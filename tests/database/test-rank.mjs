// Xếp hạng (20261126000000_rank_seasons): rank math, weekly points, the season
// shield, max one division down, season rollover with a tier drop, idempotent
// rewards, the AI bonus month, boards inside a group, rank_state and access.
import assert from 'node:assert/strict';
import { createDatabase, record } from './harness.mjs';

const h = await createDatabase();
const { db, one, value, sync } = h;
const id = n => `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`;
const vn = (day, hour = 9) => new Date(Date.parse(`${day}T00:00:00Z`) + (hour - 7) * 3600_000).toISOString();
const setNow = at => db.query("select set_config('toeic.now',$1,false)", [at]);
const apply = (level, points, delta) => value('select private.rank_apply($1,$2,$3)', [level, points, delta]);
const week = (user, w, stars, rank, size) => value('select private.rank_week($1::uuid,$2::date,$3,$4,$5)', [user, w, stars, rank, size]);
const player = user => one('select season, level, points, best_level, shield_used_week::text as shield from private.rank_players where user_id=$1', [user]);
const join = (user, w, name) => db.query('select public.league_join($1::uuid,$2::date,$3,$4)', [user, w, name, 'nau']);
const rankState = user => value('select public.rank_state($1::uuid)', [user]);
const card = (key, at, extra = {}) => record('mistakes', key, { part: 5, category: 'OTHER', status: 'NEEDS_REVIEW', questionContext: 'Q',
  userMistake: '(A)', correctAnswer: '(B)', tags: [], createdAt: at, ...extra }, at);
const test = (key, date, at, l, r) => record('sessions', key, { skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date,
  durationMinutes: 120, createdAt: at, scaledListening: l, scaledReading: r, totalScore: l + r }, at);

try {
  // ---- Pure math
  assert.deepEqual(await apply(0, 50, 25), [0, 75]);
  assert.deepEqual(await apply(9, 90, 45), [10, 35], 'Carry-over into the next division');
  assert.deepEqual(await apply(19, 90, 30), [20, 20], 'Kim cương I → Cao thủ keeps the rest');
  assert.deepEqual(await apply(20, 500, 45), [20, 545], 'Cao thủ: points only');
  assert.deepEqual(await apply(9, 10, -20), [8, 75], 'Below 0: one division down at 75');
  assert.deepEqual(await apply(9, 0, -100), [8, 75], 'Never more than one division a week');
  assert.deepEqual(await apply(20, 5, -20), [19, 75], 'Cao thủ falls to Kim cương I');
  assert.deepEqual(await apply(0, 5, -20), [0, 0], 'Đồng IV is the floor');
  assert.deepEqual(await value('select private.rank_zones(20)'), [6, 5]);
  assert.deepEqual(await value('select private.rank_zones(5)'), [0, 0]);
  assert.equal(await value("select private.rank_season('2026-11-23')"), 1);
  assert.equal(await value("select private.rank_season('2027-01-11')"), 1);
  assert.equal(await value("select private.rank_season('2027-01-18')"), 2);
  assert.equal(await value("select private.rank_season('2026-10-05')"), 1, 'Weeks before the epoch belong to season 1');

  for (let n = 1; n <= 8; n++) await h.addUser(id(n));
  await setNow(vn('2026-11-25', 10));
  for (let n = 1; n <= 8; n++) await join(id(n), '2026-11-23', `Bạn ${n}`);
  const a = id(1);
  for (let n = 1; n <= 8; n++) await rankState(id(n));
  assert.deepEqual(await player(a), { season: 1, level: 0, points: 0, best_level: null, shield: null }, 'The first visit creates a rank at Đồng IV');

  // ---- Weekly points: stars/10 (max 25) + top +20; 0-star week −20 eaten by the shield once.
  await db.query('update private.rank_players set level=8, points=64 where user_id=$1', [a]);
  assert.equal(await week(a, '2026-11-30', 184, 8, 20), 'stay');
  assert.deepEqual(await player(a), { season: 1, level: 8, points: 82, best_level: 8, shield: null }, '+18 from 184 stars, rank 8: no zone');
  assert.equal(await week(a, '2026-11-30', 999, 1, 20), 'stay', 'A finalised week is applied once');
  assert.equal((await player(a)).points, 82);
  assert.equal(await week(a, '2026-12-07', 400, 1, 20), 'up', 'Cap 25 + top 20 = 45 → Vàng III');
  assert.deepEqual(await player(a), { season: 1, level: 9, points: 27, best_level: 9, shield: null });
  assert.equal(await week(a, '2026-12-14', 0, 20, 20), 'stay', 'First loss: Khiên giữ hạng');
  assert.deepEqual(await player(a), { season: 1, level: 9, points: 27, best_level: 9, shield: '2026-12-14' });
  assert.equal(await value("select delta from private.rank_weeks where user_id=$1 and week_start='2026-12-14'", [a]), 0);
  assert.equal(await week(a, '2026-12-21', 0, 3, 4), 'stay', '0 stars: −20 even without zones');
  assert.equal((await player(a)).points, 7);
  assert.equal(await week(a, '2026-12-28', 15, 20, 20), 'down', 'Bottom 5 with 15 stars: 1 − 20, below 0 → one division down');
  assert.deepEqual(await player(a), { season: 1, level: 8, points: 75, best_level: 9, shield: '2026-12-14' });
  assert.equal(await value('select tier from public.league_members where user_id=$1', [a]), 3, 'Member tier follows the rank');

  // ---- Season rollover: best rank → rewards (once), drop one tier in the same division, shield back.
  const b = id(2), c = id(3), d = id(4);
  await db.query('update private.rank_players set level=12, points=40, best_level=13 where user_id=$1', [b]);   // Bạch kim
  await db.query('update private.rank_players set level=20, points=300, best_level=20 where user_id=$1', [c]);  // Cao thủ
  await db.query('update private.rank_players set level=5, points=10, best_level=null where user_id=$1', [d]);  // did not play
  assert.equal(await value("select private.rank_close_seasons($1::timestamptz, 100)", [vn('2027-01-18', 12)]), 0, 'Not while a season-1 week is still open');
  // The seats of 2026-11-23 were only for joining; mark them final so nothing of season 1 is open.
  await db.query("update public.league_standings set final_rank=1, outcome='stay' where week_start='2026-11-23'");
  assert.equal(await value("select private.rank_close_seasons($1::timestamptz, 100)", [vn('2027-01-18', 11)]), 0, 'Not before Monday 12:00 after the last week');
  const closed = await value("select private.rank_close_seasons($1::timestamptz, 100)", [vn('2027-01-18', 12)]);
  assert.equal(closed, 8);
  assert.deepEqual(await player(a), { season: 2, level: 4, points: 0, best_level: null, shield: null }, 'Vàng IV → Bạc IV');
  assert.deepEqual(await player(b), { season: 2, level: 8, points: 0, best_level: null, shield: null }, 'Bạch kim IV → Vàng IV');
  assert.deepEqual(await player(c), { season: 2, level: 19, points: 0, best_level: null, shield: null }, 'Cao thủ → Kim cương I');
  assert.equal((await player(d)).level, 1, 'Bạc III → Đồng III');
  const rewards = (await db.query('select user_id, best_level, cosmetics, ai_bonus, ai_month::text as month from private.rank_season_rewards order by best_level')).rows;
  assert.deepEqual(rewards.map(r => [r.user_id, r.best_level, r.ai_bonus, r.month]),
    [[a, 9, 10, '2027-02-01'], [b, 13, 20, '2027-02-01'], [c, 20, 30, '2027-02-01']], 'Only learners who played get a season reward');
  assert.deepEqual(rewards[0].cosmetics, ['frame-bac.m1', 'frame-vang.m1', 'name-tag.m1']);
  assert.deepEqual(rewards[2].cosmetics, ['frame-bac.m1', 'frame-vang.m1', 'name-tag.m1', 'khan-ngoc.m1', 'ao-choang.m1', 'vuong-mien.m1']);
  assert.equal(await value("select private.rank_close_seasons($1::timestamptz, 100)", [vn('2027-01-20')]), 0, 'Closing twice changes nothing');
  assert.equal(await value('select private.rank_roll($1::uuid, 2)', [a]), 0);
  await db.query('update private.rank_players set season=1 where user_id=$1', [a]);
  await db.query('select private.rank_roll($1::uuid, 2)', [a]);
  assert.equal(await value('select count(*)::int from private.rank_season_rewards where user_id=$1', [a]), 1, 'Rewards are idempotent per season');

  // ---- AI bonus: only in the month after the season, added to get_ai_access.
  const bonus = async (user, at) => { await setNow(at); return (await value('select public.get_ai_access($1::uuid)', [user])).rankBonus; };
  assert.equal(await bonus(c, '2027-01-25T00:00:00Z'), 0);
  assert.equal(await bonus(c, '2027-02-10T00:00:00Z'), 30);
  assert.equal(await bonus(b, '2027-02-10T00:00:00Z'), 20);
  assert.equal(await bonus(d, '2027-02-10T00:00:00Z'), 0);
  assert.equal(await bonus(c, '2027-03-01T00:00:00Z'), 0, 'One calendar month only');
  await db.query("insert into private.rank_season_rewards(user_id,season,best_level,ai_bonus,ai_month) values($1,7,20,30,'2027-02-01'),($1,8,20,30,'2027-02-01'),($1,9,20,30,'2027-02-01'),($1,10,20,30,'2027-02-01')", [c]);
  assert.equal(await bonus(c, '2027-02-10T00:00:00Z'), 100, 'Bonus capped at 100 a month');

  // ---- A whole season through the real finalise: stars → rank → season end via maintenance.
  for (let n = 9; n <= 16; n++) await h.addUser(id(n));
  await setNow(vn('2027-03-08', 10)); // season 2 runs 2027-01-18 … 2027-03-14
  for (let n = 9; n <= 16; n++) await join(id(n), '2027-03-08', `Lớp ${n}`);
  for (let n = 9; n <= 16; n++) await sync(id(n), Array.from({ length: n - 8 }, (_, k) => card(`c${n}-${k}`, vn('2027-03-08', 10))));
  const e = id(16);
  await sync(e, [test('t1', '2027-03-01', vn('2027-03-08', 10), 300, 280), test('t2', '2027-03-08', vn('2027-03-08', 10), 345, 290),
    card('rev', vn('2027-03-08', 10), { lastReviewedAt: vn('2027-03-08', 11), reviewStage: 1, reviewCount: 1 })]);
  await setNow(vn('2027-03-08', 12));
  const view = await rankState(e);
  assert.equal(view.season.number, 2);
  assert.equal(view.season.start, '2027-01-18');
  assert.equal(view.season.end, '2027-03-14');
  assert.deepEqual(view.rank, { season: 2, level: 0, points: 0, bestLevel: null, shieldUsedWeek: null });
  assert.deepEqual(Object.keys(view.boards).sort(), ['listening', 'minutes', 'reading', 'reviews', 'stars', 'streak']);
  assert.equal(view.boards.stars.length, 8);
  const mine = key => view.boards[key].find(row => row.me);
  assert.equal(mine('listening').value, 45, 'Gain over the first logged test');
  assert.equal(mine('listening').rank, 1);
  assert.equal(mine('reading').value, 10);
  assert.equal(mine('minutes').value, 120, 'This week only');
  assert.equal(mine('streak').value, 1);
  assert.equal(mine('reviews').value, 1, 'Correct reviews this week');
  assert.equal(view.boards.listening.find(row => !row.me).value, null, 'No tests: no gain');
  assert.ok(!JSON.stringify(view.boards).includes('345'), 'Raw TOEIC scores never leave the database');
  assert.ok(!JSON.stringify(view).includes(id(9)), 'No other learner ids');

  await setNow(vn('2027-03-15', 13)); // past the grace window of the season's last week
  const m = await value('select public.run_maintenance()');
  assert.equal(m.leagueGroups, 1);
  assert.ok(m.rankSeasons >= 8, 'Maintenance closes the season once the last week is final');
  const after = await rankState(e);
  assert.equal(after.season.number, 3);
  assert.deepEqual(after.rewards.map(r => [r.season, r.bestLevel, r.aiBonus]), [[2, 0, 0]], 'Season badge for everyone who played');
  assert.equal(after.rankWeek.weekStart, '2027-03-08');
  assert.equal(after.rankWeek.bonus, 20, 'Top of a group of 8 (zone 2)');

  // ---- Non-members: an empty rank with the season; guests refused.
  await h.addUser(id(30));
  const outsider = await rankState(id(30));
  assert.equal(outsider.member, null);
  assert.equal(outsider.rank, null);
  assert.equal(outsider.boards, null);
  await h.addUser(id(31), { anonymous: true });
  await assert.rejects(rankState(id(31)), /Permanent account required/);

  // ---- Access: backend only, nothing for browser roles; deletion cascades.
  const grants = await one(`select has_function_privilege('authenticated','public.rank_state(uuid)','execute') as auth,
    has_function_privilege('service_role','public.rank_state(uuid)','execute') as service,
    has_function_privilege('service_role','private.rank_week(uuid,date,integer,integer,integer)','execute') as helper,
    has_table_privilege('service_role','private.rank_players','select') as tbl`);
  assert.deepEqual(grants, { auth: false, service: true, helper: false, tbl: false });
  await db.query('delete from auth.users where id=$1', [e]);
  assert.equal(await value('select count(*)::int from private.rank_players where user_id=$1', [e]), 0);
  assert.equal(await value('select count(*)::int from private.rank_season_rewards where user_id=$1', [e]), 0);

  // ---- Re-applying the migration keeps every rank.
  const before = await value('select count(*)::int from private.rank_players');
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../../supabase/migrations/20261126000000_rank_seasons.sql', import.meta.url), 'utf8'));
  assert.equal(await value('select count(*)::int from private.rank_players'), before);
  assert.deepEqual(await value('select public.schema_ready()'), { baseline: 2, ready: true });
  await setNow('');
  console.log('Rank: math, weekly points, shield, max one division down, season rollover, idempotent rewards, AI bonus month and cap, boards, rank_state and access passed.');
} finally {
  await db.close();
}
