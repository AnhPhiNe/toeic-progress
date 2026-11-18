// Plans and redeem codes: hashed codes only, atomic redemption, distinct
// refusal codes, plan extension, 5 wrong attempts per hour, service role only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDatabase, uid } from './harness.mjs';

const h = await createDatabase();
const { db, one, value } = h;
const alice = uid(1), bob = uid(2), carol = uid(3), guest = uid(4);
const hashOf = code => createHash('sha256').update(code).digest('hex');
const mint = (code, plan, days, { max = 1, expires = null } = {}) => db.query(
  'insert into public.redeem_codes(code_hash,plan,duration_days,max_redemptions,expires_at,note) values($1,$2,$3,$4,$5,$6)',
  [hashOf(code), plan, days, max, expires, 'test']);
const redeem = (user, code) => value('select public.redeem_code($1::uuid,$2)', [user, hashOf(code)]);
const plan = user => one('select plan, expires_at, ai_monthly_limit from public.user_plans where user_id=$1', [user]);
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400_000);

try {
  for (const [id, n] of [[alice, 1], [bob, 2], [carol, 3]]) await h.addUser(id, { email: `user${n}@example.test` });
  await h.addUser(guest, { anonymous: true });
  await mint('PLUS-30', 'plus', 30, { max: 2 });
  await mint('PLUS-7', 'plus', 7);
  await mint('OLD', 'plus', 30, { expires: '2026-01-01T00:00:00Z' });
  await mint('ADMIN-1', 'admin', 365);

  // Only the hash is stored.
  assert.equal(await value("select count(*)::int from public.redeem_codes where code_hash ~ '^[a-f0-9]{64}$'"), 4);
  await assert.rejects(db.query("insert into public.redeem_codes(code_hash,plan,duration_days) values('PLAIN-CODE','plus',1)"), /check constraint/);
  await assert.rejects(db.query("insert into public.redeem_codes(code_hash,plan,duration_days) values($1,'free',1)", ['d'.repeat(64)]), /check constraint/);

  // Success starts the plan now; the code counts one redemption.
  const first = await redeem(alice, 'PLUS-30');
  assert.equal(first.ok, true);
  assert.equal(first.plan, 'plus');
  const started = await plan(alice);
  assert.equal(started.plan, 'plus');
  assert.equal(days(new Date().toISOString(), started.expires_at.toISOString()), 30);
  assert.equal(await value("select redeemed_count from public.redeem_codes where code_hash=$1", [hashOf('PLUS-30')]), 1);
  assert.deepEqual(await value('select public.get_ai_access($1::uuid)', [alice]).then(a => [a.plan, a.unlimited]), ['plus', false]);

  // Same plan active: the duration is added to the current expiry.
  await db.query('update public.user_plans set ai_monthly_limit=150 where user_id=$1', [alice]);
  const extended = await redeem(alice, 'PLUS-7');
  assert.equal(extended.ok, true);
  const after = await plan(alice);
  assert.equal(days(started.expires_at.toISOString(), after.expires_at.toISOString()), 7);
  assert.equal(after.ai_monthly_limit, 150, 'Extending keeps a custom cap');

  // Distinct refusals, none of which changes the plan or the code.
  assert.deepEqual(await redeem(alice, 'PLUS-30'), { ok: false, code: 'already_used' });
  assert.deepEqual(await redeem(bob, 'PLUS-7'), { ok: false, code: 'exhausted' });
  assert.deepEqual(await redeem(bob, 'OLD'), { ok: false, code: 'expired' });
  assert.deepEqual(await redeem(bob, 'NOPE'), { ok: false, code: 'invalid' });
  assert.equal(await plan(bob), undefined);
  assert.equal((await redeem(bob, 'PLUS-30')).ok, true, 'A multi-use code serves another account');
  assert.deepEqual(await redeem(carol, 'PLUS-30'), { ok: false, code: 'exhausted' });

  // Rate limit: 5 wrong attempts per hour (bob already has 3), then refused even for a valid code.
  assert.equal((await redeem(bob, 'WRONG-1')).code, 'invalid');
  assert.equal((await redeem(bob, 'WRONG-2')).code, 'invalid');
  const limited = await redeem(bob, 'ADMIN-1');
  assert.equal(limited.code, 'rate_limited');
  assert.ok(limited.retryAfter >= 1 && limited.retryAfter <= 3600);
  assert.equal(await value("select used from public.api_rate_limits where user_id=$1 and bucket='redeem'", [bob]), 5);
  assert.equal(await value("select redeemed_count from public.redeem_codes where code_hash=$1", [hashOf('ADMIN-1')]), 0);
  await db.query("update public.api_rate_limits set window_start=window_start-interval '1 hour' where user_id=$1 and bucket='redeem'", [bob]);
  assert.equal((await redeem(bob, 'ADMIN-1')).ok, true, 'A new hour opens a new window');

  // A different plan starts now and resets the custom cap; a lower plan is not needed.
  const admin = await plan(bob);
  assert.equal(admin.plan, 'admin');
  assert.equal(days(new Date().toISOString(), admin.expires_at.toISOString()), 365);
  assert.equal(admin.ai_monthly_limit, null);
  assert.equal((await value('select public.get_ai_access($1::uuid)', [bob])).unlimited, true);
  await mint('PLUS-B', 'plus', 30);
  assert.deepEqual(await redeem(bob, 'PLUS-B'), { ok: false, code: 'not_needed', plan: 'admin' });
  assert.equal(await value("select redeemed_count from public.redeem_codes where code_hash=$1", [hashOf('PLUS-B')]), 0, 'An unneeded code stays unused');

  // An expired plan restarts from now.
  await db.query("update public.user_plans set expires_at=now()-interval '3 days' where user_id=$1", [alice]);
  await mint('PLUS-A2', 'plus', 10);
  await redeem(alice, 'PLUS-A2');
  assert.equal(days(new Date().toISOString(), (await plan(alice)).expires_at.toISOString()), 10);
  assert.equal((await plan(alice)).ai_monthly_limit, null, 'A lapsed plan restarts with the plan defaults');

  // Input checks and roles.
  await assert.rejects(value("select public.redeem_code($1::uuid,'not-a-hash')", [alice]), /Invalid redeem request/);
  await assert.rejects(redeem(guest, 'PLUS-B'), /Permanent account required/);
  await assert.rejects(h.asRole('authenticated', tx => tx.query("select public.redeem_code($1::uuid,$2)", [alice, hashOf('PLUS-B')]),
    { sub: alice, is_anonymous: false }), /permission denied/);
  await assert.rejects(h.asRole('service_role', tx => tx.query('select * from public.redeem_codes')), /permission denied/);
  assert.equal((await h.asRole('service_role', tx => tx.query('select public.redeem_code($1::uuid,$2) as r', [carol, hashOf('PLUS-B')]))).rows[0].r.ok, true);

  // Account deletion removes plans and uses, never the codes.
  await db.query('delete from auth.users where id=$1', [alice]);
  assert.equal(await value('select count(*)::int from public.user_plans where user_id=$1', [alice]), 0);
  assert.equal(await value('select count(*)::int from public.redeem_code_uses where user_id=$1', [alice]), 0);
  assert.equal(await value('select count(*)::int from public.redeem_codes'), 6);
  console.log('Plans and redeem codes: hashing, atomic redemption, refusal codes, extension, rate limit and grants passed.');
} finally {
  await db.close();
}
