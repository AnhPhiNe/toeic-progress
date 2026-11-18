// Weekly league on the v2 baseline: seating, ranking, lazy rollover,
// promotion/demotion, leave, access and account deletion.
import assert from 'node:assert/strict';
import { createDatabase } from './harness.mjs';

const h = await createDatabase();
const { db, one } = h;
const id = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
const guest = '66666666-6666-4666-8666-666666666666';
const W1 = '2026-11-16', W2 = '2026-11-23', W3 = '2026-11-30';
const refresh = async (user, week, stars = null) => (await db.query(
  'select public.league_refresh($1::uuid,$2::date,$3::integer) as v', [user, week, stars])).rows[0].v;
const join = (user, week, name, coat = 'nau-cam') => db.query('select public.league_join($1::uuid,$2::date,$3,$4)', [user, week, name, coat]);

try {
  for (let n = 1; n <= 26; n++) await h.addUser(id(n));
  await h.addUser(guest, { anonymous: true });

  // Guests and invalid input are refused; non-members get an empty state.
  await assert.rejects(join(guest, W1, 'KhÃ¡ch'), /Permanent account required/);
  await assert.rejects(refresh(id(1), '2026-11-17'), /Invalid league request/);
  assert.deepEqual(await refresh(id(1), W1), { member: null, lastWeek: null });
  await assert.rejects(join(id(1), W1, 'x'), /check constraint/);
  await assert.rejects(join(id(1), W1, 'SÃ³c', 'Bad Coat!'), /check constraint/);

  // 21 joiners: groups never exceed 20 and the 21st opens a second group.
  for (let n = 1; n <= 21; n++) await join(id(n), W1, `Báº¡n ${n}`);
  const sizes = (await db.query('select count(*)::int as n from public.league_standings where week_start=$1 group by group_id order by group_id', [W1])).rows.map(r => r.n);
  assert.deepEqual(sizes, [20, 1]);
  await refresh(id(1), W1); await refresh(id(1), W1);
  assert.equal((await one('select count(*)::int as n from public.league_standings where user_id=$1', [id(1)])).n, 1, 'Refreshing must not seat a member twice');

  // Stars: member n earns 10*n (n=1..20), so rank 1 is member 20.
  for (let n = 1; n <= 20; n++) await refresh(id(n), W1, n === 3 ? 0 : 10 * n);
  await assert.rejects(refresh(id(1), W1, 421), /Invalid league stars/);
  const state = await refresh(id(18), W1, 180);
  assert.equal(state.group.size, 20);
  assert.equal(state.group.zone, 5);
  assert.deepEqual(state.group.rows[0], { rank: 1, nickname: 'Báº¡n 20', coat: 'nau-cam', stars: 200, me: false });
  assert.deepEqual(state.group.rows.find(row => row.me), { rank: 3, nickname: 'Báº¡n 18', coat: 'nau-cam', stars: 180, me: true });
  assert.ok(!JSON.stringify(state).includes(id(20)), 'Other learners\' ids must never be returned');

  // No direct access for browser roles; the backend reads membership only.
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select user_id from public.league_members'), { sub: id(5), is_anonymous: false }), /permission denied/);
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select nickname from public.league_standings'), { sub: id(5), is_anonymous: false }), /permission denied/);
  await assert.rejects(h.asRole('anon', tx => tx.query('select * from public.league_members')), /permission denied/);
  await assert.rejects(h.asRole('service_role', tx => tx.query('update public.league_members set tier=4')), /permission denied/);
  assert.equal((await h.asRole('service_role', tx => tx.query('select opted_out_at from public.league_members where user_id=$1', [id(5)]))).rows.length, 1);
  const grants = await one(`select has_function_privilege('authenticated','public.league_refresh(uuid,date,integer)','execute') as auth,
    has_function_privilege('anon','public.league_join(uuid,date,text,text)','execute') as anon,
    has_function_privilege('service_role','public.league_refresh(uuid,date,integer)','execute') as service`);
  assert.deepEqual(grants, { auth: false, anon: false, service: true });

  // Nickname/coat edits reach this week's snapshot.
  await db.query('select public.league_update($1::uuid,$2::date,$3,$4)', [id(20), W1, 'MÃ¢y Bay', 'xam-khoi']);
  assert.equal((await refresh(id(1), W1)).group.rows[0].nickname, 'MÃ¢y Bay');

  // Lazy rollover: the first W2 request finalises W1 exactly once.
  await Promise.all([refresh(id(21), W2), refresh(id(21), W2)]);
  assert.equal((await one('select count(*)::int as n from public.league_weeks where week_start=$1', [W2])).n, 1);
  const outcomes = async week => Object.fromEntries((await db.query(
    'select s.user_id,s.final_rank,s.outcome,m.tier from public.league_standings s join public.league_members m using(user_id) where s.week_start=$1', [week])).rows.map(r => [r.user_id, r]));
  let w1 = await outcomes(W1);
  for (const n of [20, 19, 18, 17, 16]) assert.deepEqual([w1[id(n)].outcome, w1[id(n)].tier], ['up', 2], `Top 5 must move up (member ${n})`);
  for (const n of [1, 2, 3, 4, 5]) assert.deepEqual([w1[id(n)].outcome, w1[id(n)].tier], ['stay', 1], 'Äá»“ng has no lower tier');
  assert.equal(w1[id(3)].final_rank, 20, 'Zero stars ranks last');
  assert.deepEqual([w1[id(21)].final_rank, w1[id(21)].outcome], [1, 'stay'], 'A group too small for a table moves nobody');
  await refresh(id(1), W2); await refresh(id(1), W2);
  w1 = await outcomes(W1);
  assert.equal(w1[id(16)].tier, 2, 'Rolling over again must not promote twice');
  assert.deepEqual((await refresh(id(16), W2)).lastWeek, { rank: 5, outcome: 'up', stars: 160, tier: 1, weekStart: W1 });

  // Demotion: a full VÃ ng group in W2; ties go to whoever reached the count first.
  await db.query('update public.league_members set tier=3 where user_id<>$1', [id(21)]);
  await db.query('delete from public.league_standings where week_start=$1 and user_id<>$2', [W2, id(21)]);
  for (let n = 1; n <= 20; n++) await refresh(id(n), W2, n <= 2 ? 50 : 10 * n);
  assert.equal((await refresh(id(1), W2)).group.rows.find(row => row.me).rank, 16, 'Earlier arrival at 50 stars ranks higher');
  await db.query('select public.league_leave($1::uuid,$2::date)', [id(4), W2]);
  assert.equal((await one('select tier from public.league_members where user_id=$1', [id(4)])).tier, 2, 'Leaving from the demotion zone still demotes');
  assert.deepEqual(await refresh(id(4), W2), { member: null, lastWeek: { rank: 17, outcome: 'stay', stars: 40, tier: 1, weekStart: W1 } });
  await db.query('select public.league_leave($1::uuid,$2::date)', [id(20), W2]);
  assert.equal((await one('select tier from public.league_members where user_id=$1', [id(20)])).tier, 3, 'Leaving from the top keeps the tier');
  await refresh(id(1), W3);
  const w2 = await outcomes(W2);
  for (const n of [19, 18, 17, 16, 15]) assert.deepEqual([w2[id(n)].outcome, w2[id(n)].tier], ['up', 4]);
  for (const n of [5, 6, 3, 1, 2]) assert.deepEqual([w2[id(n)].outcome, w2[id(n)].tier], ['down', 2], `Bottom 5 must move down (member ${n})`);
  assert.equal(w2[id(7)].outcome, 'stay');

  // Rejoining seats the learner again with the same tier; stale weeks are refused.
  await join(id(4), W3, 'Quay Láº¡i');
  assert.equal((await refresh(id(4), W3)).group.tier, 2);
  await assert.rejects(refresh(id(4), W2), /Stale league week/);

  // Account deletion removes membership and standings.
  await db.query('delete from auth.users where id=$1', [id(4)]);
  assert.equal((await one('select count(*)::int as n from public.league_standings where user_id=$1', [id(4)])).n, 0);
  assert.equal((await one('select count(*)::int as n from public.league_members where user_id=$1', [id(4)])).n, 0);
  console.log('League seating, ranking, access, lazy rollover, promotion/demotion, leave and deletion passed.');
} finally {
  await db.close();
}
