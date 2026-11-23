// Weekly league after security wave 2: stars counted in the database from the
// synced rows (offline-friendly rules and caps), seating, ranking, the database
// clock as the only week, grace-window finalisation (maintenance or a late
// GET), leave keeping the seat, stale weeks, access and account deletion.
import assert from 'node:assert/strict';
import { createDatabase, record } from './harness.mjs';

const h = await createDatabase();
const { db, one, value, sync } = h;
const id = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const guest = '66666666-6666-4666-8666-666666666666';
const W1 = '2026-11-16', W2 = '2026-11-23', W3 = '2026-11-30';
// Vietnam is UTC+7: `vn('2026-11-18', 10)` is Wednesday 10:00 in Vietnam.
const vn = (day, hour = 9) => new Date(Date.parse(`${day}T00:00:00Z`) + (hour - 7) * 3600_000).toISOString();
const setNow = at => db.query("select set_config('toeic.now',$1,false)", [at]);
const state = async user => value('select public.league_state($1::uuid)', [user]);
const refresh = async (user, week, stars = null) => value('select public.league_refresh($1::uuid,$2::date,$3::integer)', [user, week, stars]);
const join = (user, week, name, coat = 'nau-cam') => db.query('select public.league_join($1::uuid,$2::date,$3,$4)', [user, week, name, coat]);
const leave = (user, week) => db.query('select public.league_leave($1::uuid,$2::date)', [user, week]);
const standing = (user, week) => one('select stars, final_rank, outcome, opted_out, group_id from public.league_standings where user_id=$1 and week_start=$2', [user, week]);
const card = (key, createdAt, extra = {}) => record('mistakes', key, { part: 5, category: 'OTHER', status: 'NEEDS_REVIEW', questionContext: 'Q',
  userMistake: '(A)', correctAnswer: '(B)', tags: [], createdAt, ...extra }, createdAt);
const test = (key, date, createdAt, extra = {}) => record('sessions', key, { skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date,
  durationMinutes: 120, createdAt, totalScore: 600, ...extra }, createdAt);
const practice = (key, date, createdAt) => record('sessions', key, { skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Part 5', date,
  durationMinutes: 20, createdAt }, createdAt);
const cards = (n, user, day, hour = 9) => Array.from({ length: n }, (_, k) => card(`${user}-${day}-${k}`, vn(day, hour)));

try {
  for (let n = 1; n <= 26; n++) await h.addUser(id(n));
  await h.addUser(guest, { anonymous: true });
  await setNow(vn('2026-11-18', 10));

  // Guests and invalid input are refused; non-members get an empty state for the database week.
  await assert.rejects(join(guest, W1, 'Khách'), /Permanent account required/);
  await assert.rejects(refresh(id(1), '2026-11-17'), /Invalid league request/);
  assert.deepEqual(await state(id(1)), { weekStart: W1, member: null, lastWeek: null });
  await assert.rejects(join(id(1), W1, 'x'), /check constraint/);
  await assert.rejects(join(id(1), W1, 'Sóc', 'Bad Coat!'), /check constraint/);

  // 21 joiners: groups never exceed 20 and the 21st opens a second group.
  for (let n = 1; n <= 21; n++) await join(id(n), W1, `Bạn ${n}`);
  const sizes = (await db.query('select count(*)::int as n from public.league_standings where week_start=$1 group by group_id order by group_id', [W1])).rows.map(r => r.n);
  assert.deepEqual(sizes, [20, 1]);
  await state(id(1)); await state(id(1));
  assert.equal(await value('select count(*)::int from public.league_standings where user_id=$1', [id(1)]), 1, 'Refreshing must not seat a member twice');

  // Stars come from synced rows, recounted on every sync: member n adds n cards (member 3 none).
  for (let n = 1; n <= 20; n++) if (n !== 3) await sync(id(n), cards(n, n, '2026-11-18'));
  assert.equal((await standing(id(7), W1)).stars, 7, 'Sync recounts the standing at once');
  const view = await state(id(18));
  assert.equal(view.group.size, 20);
  assert.equal(view.group.zone, 5);
  assert.deepEqual(view.group.rows[0], { rank: 1, nickname: 'Bạn 20', coat: 'nau-cam', stars: 20, me: false });
  assert.deepEqual(view.group.rows.find(row => row.me), { rank: 3, nickname: 'Bạn 18', coat: 'nau-cam', stars: 18, me: true });
  assert.deepEqual(view.stars, { total: 18, today: 18, daily: { '2026-11-18': 18 } });
  assert.ok(!JSON.stringify(view).includes(id(20)), 'Other learners\' ids must never be returned');
  // An old backend's p_stars is ignored; out-of-range values are still refused.
  assert.equal((await refresh(id(1), W1, 400)).group.rows.find(row => row.me).stars, 1);
  await assert.rejects(refresh(id(1), W1, 421), /Invalid league stars/);

  // Star rules for one learner (joined Wednesday): caps, join day, future days, short tests.
  const x = id(22);
  await join(x, W1, 'Sóc Thử');
  await sync(x, [
    ...Array.from({ length: 6 }, (_, k) => practice(`x-p${k}`, '2026-11-18', vn('2026-11-18', 8))), // 5 a day count: 40
    test('x-short', '2026-11-18', vn('2026-11-18', 8), { durationMinutes: 10 }),                  // under 15 minutes
    test('x-before-join', '2026-11-17', vn('2026-11-17', 20)),                                      // before joining
    test('x-thu', '2026-11-19', vn('2026-11-19', 8)),                                               // tomorrow
  ]);
  assert.equal((await state(x)).stars.total, 40);
  await setNow(vn('2026-11-19', 10));
  assert.equal((await state(x)).stars.total, 60, 'A row dated today counts once today comes');
  const fourFull = Array.from({ length: 4 }, (_, k) => test(`x-f${k}`, '2026-11-20', vn('2026-11-19', 9)));
  await sync(x, [...fourFull, record('sessions', 'x-thu', {}, vn('2026-11-19', 9), vn('2026-11-19', 9))]);
  assert.equal((await state(x)).stars.total, 40, 'Deleting a test removes its stars (no ghost stars)');
  await setNow(vn('2026-11-20', 10));
  assert.deepEqual((await state(x)).stars.daily, { '2026-11-18': 40, '2026-11-20': 60 }, 'Four full tests in a day: 3 count, capped at 60');

  // Offline-friendly: a Sunday test synced Monday morning still counts for last week.
  await setNow(vn(W2, 9));
  await sync(x, [test('x-sun', '2026-11-22', vn('2026-11-22', 20))]);
  assert.equal((await standing(x, W1)).stars, 120);
  assert.equal((await standing(x, W1)).final_rank, null, 'Not final before Monday noon');
  // Re-dating a row first synced last week into this week earns nothing this week.
  await sync(x, [record('sessions', 'x-p0', { skillType: 'LR', sessionType: 'PART_PRACTICE',
    testName: 'Part 5', date: W2, durationMinutes: 20, createdAt: vn(W2, 8) }, vn(W2, 8))]);
  const xNow = await state(x);
  assert.equal(xNow.weekStart, W2);
  assert.equal(xNow.stars.total, 0, 'first_synced_at is last week: no stars this week');
  assert.equal(xNow.lastWeek, null, 'Last week shows once it is final');
  await state(id(20)); // seated in W2 at the old tier before finalising

  // After the grace window, a late Sunday sync no longer changes last week; maintenance finalises it.
  await setNow(vn(W2, 13));
  await sync(x, [test('x-late', '2026-11-22', vn('2026-11-22', 21))]);
  const maintenance = await value('select public.run_maintenance()');
  assert.equal(maintenance.leagueGroups, 2);
  assert.equal((await standing(x, W1)).stars, 120, 'Rows synced after the deadline do not count');
  const outcomes = async week => Object.fromEntries((await db.query(
    'select s.user_id,s.final_rank,s.outcome,m.tier from public.league_standings s join public.league_members m using(user_id) where s.week_start=$1', [week])).rows.map(r => [r.user_id, r]));
  let w1 = await outcomes(W1);
  const rankOf = async user => one('select level, points, shield_used_week::text as shield from private.rank_players where user_id=$1', [user]);
  // Rank points (Xếp hạng): stars/10 + top 6 of 20 get +20; bottom 5 lose 20 but the season shield turns the first loss into 0.
  for (const n of [20, 19, 18, 17, 16, 15]) assert.deepEqual([w1[id(n)].outcome, w1[id(n)].tier], ['stay', 1], `Top 6 earn points, still Đồng IV (member ${n})`);
  assert.deepEqual(await rankOf(id(20)), { level: 0, points: 22, shield: null });
  assert.deepEqual(await rankOf(id(15)), { level: 0, points: 21, shield: null });
  for (const n of [1, 2, 3, 4, 5]) assert.deepEqual([w1[id(n)].outcome, (await rankOf(id(n))).shield], ['stay', W1], 'Bottom 5: shield used');
  assert.equal(w1[id(3)].final_rank, 20, 'Zero stars ranks last');
  assert.deepEqual([w1[id(21)].outcome, w1[id(22)].outcome], ['stay', 'stay'], 'A group too small for a table moves nobody');
  assert.equal((await value('select public.run_maintenance()')).leagueGroups, 0, 'Finalising twice changes nothing');
  assert.deepEqual((await state(id(16))).lastWeek, { rank: 5, outcome: 'stay', stars: 16, tier: 1, weekStart: W1 });

  // Stale weeks are refused; a future week from a fast app clock goes to the database week.
  await assert.rejects(join(id(23), W1, 'Muộn'), /Stale league week/);
  await assert.rejects(leave(id(1), W1), /Stale league week/);
  await assert.rejects(db.query('select public.league_update($1::uuid,$2::date,$3,$4)', [id(1), W1, 'Tên Mới', null]), /Stale league week/);
  await join(id(23), W3, 'Sớm');
  assert.equal(await value('select count(*)::int from public.league_standings where user_id=$1 and week_start=$2', [id(23), W2]), 1);
  assert.equal(await value('select count(*)::int from public.league_standings where week_start=$1', [W3]), 0);

  // A full Vàng group in W2; ties go to whoever reached the count first.
  await setNow(vn('2026-11-24', 10));
  await db.query('update public.league_members set tier=3 where user_id = any($1::uuid[])', [Array.from({ length: 20 }, (_, k) => id(k + 1))]);
  // Vàng IV with 10 points; the top six are 90 points from Vàng III.
  await db.query('update private.rank_players set level=8, points=case when user_id = any($2::uuid[]) then 90 else 10 end where user_id = any($1::uuid[])',
    [Array.from({ length: 20 }, (_, k) => id(k + 1)), Array.from({ length: 6 }, (_, k) => id(k + 15))]);
  await db.query('delete from public.league_standings where week_start=$1 and user_id = any($2::uuid[])', [W2, Array.from({ length: 20 }, (_, k) => id(k + 1))]);
  for (let n = 1; n <= 20; n++) await state(id(n));
  for (const n of [2, 1]) await sync(id(n), cards(2, n, '2026-11-24'));
  for (let n = 3; n <= 20; n++) await sync(id(n), cards(n, n, '2026-11-24'));
  const vang = await state(id(1));
  assert.equal(vang.group.tier, 3);
  assert.equal(vang.group.rows.find(row => row.me).rank, 20, 'The later arrival at 2 stars ranks lower');

  // Leaving keeps the seat: still counted, still ranked, still demoted; rejoining returns to the same room.
  const seat = (await standing(id(4), W2)).group_id;
  await leave(id(4), W2);
  assert.equal((await standing(id(4), W2)).opted_out, true);
  assert.equal((await state(id(4))).member, null);
  assert.equal((await state(id(5))).group.size, 20, 'A left seat still counts for the zones');
  await join(id(4), W2, 'Quay Lại');
  assert.deepEqual([(await standing(id(4), W2)).group_id, (await standing(id(4), W2)).opted_out], [seat, false]);
  await leave(id(4), W2);
  await leave(id(20), W2);
  assert.equal(await value('select tier from public.league_members where user_id=$1', [id(4)]), 3, 'No tier change until the week is final');

  // Late GET after the deadline finalises (bounded) when maintenance has not run.
  await setNow(vn(W3, 12));
  await state(id(5));
  const w2 = await outcomes(W2);
  for (const n of [20, 19, 18, 17, 16, 15]) assert.deepEqual([w2[id(n)].outcome, w2[id(n)].tier], ['up', 3], `Top 6 go up a division, leaving or not (member ${n})`);
  assert.deepEqual(await rankOf(id(20)), { level: 9, points: 12, shield: null }, 'Points carry over into Vàng III');
  for (const n of [5, 4, 3, 2, 1]) assert.deepEqual([w2[id(n)].outcome, w2[id(n)].tier], ['down', 2], `Bottom 5 (shield spent) fall one division, leaving or not (member ${n})`);
  assert.deepEqual(await rankOf(id(1)), { level: 7, points: 75, shield: W1 }, 'Bạc I with 75 points');
  assert.equal(w2[id(6)].outcome, 'stay');
  assert.equal(await value('select count(*)::int from public.league_standings where user_id=$1 and week_start=$2', [id(4), W3]), 0, 'Left members are not seated next week');

  // Reset: erased study earns nothing in the open week.
  assert.ok((await state(id(6))).stars.total === 0);
  await sync(id(6), cards(5, 6, W3, 10));
  assert.equal((await state(id(6))).stars.total, 5);
  await db.query('select public.reset_learning_data($1::uuid)', [id(6)]);
  assert.equal((await standing(id(6), W3)).stars, 0);

  // No direct access for browser roles; the backend reads membership only.
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select user_id from public.league_members'), { sub: id(5), is_anonymous: false }), /permission denied/);
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select nickname from public.league_standings'), { sub: id(5), is_anonymous: false }), /permission denied/);
  await assert.rejects(h.asRole('anon', tx => tx.query('select * from public.league_members')), /permission denied/);
  await assert.rejects(h.asRole('service_role', tx => tx.query('update public.league_members set tier=4')), /permission denied/);
  const grants = await one(`select has_function_privilege('authenticated','public.league_state(uuid)','execute') as auth,
    has_function_privilege('anon','public.league_join(uuid,date,text,text)','execute') as anon,
    has_function_privilege('service_role','public.league_state(uuid)','execute') as service,
    has_function_privilege('service_role','private.league_stars(uuid,date,timestamp with time zone)','execute') as helper`);
  assert.deepEqual(grants, { auth: false, anon: false, service: true, helper: false });

  // Account deletion removes membership and standings.
  await db.query('delete from auth.users where id=$1', [id(4)]);
  assert.equal(await value('select count(*)::int from public.league_standings where user_id=$1', [id(4)]), 0);
  assert.equal(await value('select count(*)::int from public.league_members where user_id=$1', [id(4)]), 0);
  await setNow('');
  console.log('League: database-counted stars, caps, offline grace, no ghost stars, seating, stale weeks, finalise, leave keeps seat, reset, access and deletion passed.');
} finally {
  await db.close();
}
