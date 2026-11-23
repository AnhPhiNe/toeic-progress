// AI on the v2 baseline: quota reservations (single and batch), quota
// status for the backend, access + plans, explanation ledger, API limits.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, uid } from './harness.mjs';

const h = await createDatabase();
const { db, one, value } = h;
const alice = uid(1), bob = uid(2), guest = uid(3);
const hash = 'a'.repeat(64), ip = 'b'.repeat(64);
const req = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const reserve = (user, request, { guestUser = false, user: userLimit = 3, day = 100, minute = 100, ipCap = 100 } = {}) => value(
  'select public.reserve_ai_request($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9)', [user, guestUser, request, hash, ip, userLimit, day, minute, ipCap]);
const reserveBatch = (user, request, batch, { user: userLimit = 27, minute = 100 } = {}) => value(
  'select public.reserve_ai_batch_request($1::uuid,false,$2::uuid,$3::uuid,$4,$5,$6,100,$7,100,4,3600)', [user, request, batch, hash, ip, userLimit, minute]);
const used = prefix => value("select coalesce(sum(used),0)::int from public.ai_usage_counters where bucket like $1 || '%'", [prefix]);
const clear = () => db.exec('truncate public.ai_requests, public.ai_usage_counters, public.ai_batches');

try {
  await h.addUser(alice, { email: 'alice@example.test' });
  await h.addUser(bob, { email: 'bob@example.test' });
  await h.addUser(guest, { anonymous: true });

  // Single requests: caps, idempotency, identity.
  const guestResults = [];
  for (let n = 0; n < 5; n++) guestResults.push(await reserve(guest, req(n), { guestUser: true }));
  assert.equal(guestResults.filter(r => r.allowed).length, 3);
  assert.deepEqual(guestResults[0], { allowed: true, remaining: 2, limit: 3 });
  assert.equal(guestResults[4].code, 'quota');
  assert.equal((await reserve(guest, req(0), { guestUser: true })).code, 'duplicate');
  await assert.rejects(reserve(guest, req(9)), /Invalid identity/, 'guest flag must match the Auth user');
  await assert.rejects(value("select public.reserve_ai_request($1::uuid,false,$2::uuid,'short',$3,1,1,1,1)", [alice, req(9), ip]), /Invalid reservation/);
  assert.deepEqual(await value('select public.get_ai_usage($1::uuid,true,3)', [guest]), { remaining: 0, limit: 3, guest: true });
  assert.equal(await value("select expires_at is null from public.ai_usage_counters where bucket like 'user:%:guest'"), true, 'Guest quota never resets');
  assert.equal(await value("select user_id from public.ai_usage_counters where bucket like 'user:%'"), guest);

  // Quota status: the only definition of bucket keys, read by the backend.
  const status = await value('select public.ai_quota_status($1::uuid,true,$2)', [guest, ip]);
  assert.deepEqual(status.map(b => b.kind), ['guest', 'day', 'minute', 'ip']);
  assert.equal(status[0].used, 3);
  assert.equal(status[0].resetsAt, null);
  assert.match(status[1].bucket, /^day:\d{4}-\d{2}-\d{2}$/);
  const month = await value('select public.ai_quota_status($1::uuid,false,$2)', [alice, ip]);
  assert.equal(month[0].kind, 'month');
  assert.match(month[0].bucket, new RegExp(`^user:${alice}:\\d{4}-\\d{2}$`));
  assert.ok(Date.parse(month[0].resetsAt) > Date.now());

  // NULL caps (unlimited accounts) still count, still dedupe, keep the shared minute cap.
  await clear();
  const unlimited = (n, minute = null) => value('select public.reserve_ai_request($1::uuid,false,$2::uuid,$3,$4,null,null,$5,null)', [alice, req(n), hash, ip, minute]);
  assert.deepEqual(await unlimited(1, 2), { allowed: true, remaining: null, limit: null });
  assert.equal((await unlimited(1, 2)).code, 'duplicate');
  assert.equal((await unlimited(2, 2)).allowed, true);
  assert.equal((await unlimited(3, 2)).code, 'quota', 'Unlimited accounts keep the global minute cap');
  assert.equal((await unlimited(4)).allowed, true);
  assert.equal(await used('user:'), 3, 'Unlimited usage is still counted');

  // The global caps are shared: Bob is stopped by the day cap Alice used up.
  await clear();
  assert.equal((await reserve(alice, req(10), { day: 1 })).allowed, true);
  assert.equal((await reserve(bob, req(11), { day: 1 })).code, 'quota');
  assert.equal(await used('user:'), 1, 'A refused request consumes nothing');

  // Batches: one charge per capture, every chunk counts against shared caps.
  await clear();
  const batch = randomUUID();
  assert.deepEqual(await reserveBatch(alice, req(20), batch), { allowed: true, remaining: 26, limit: 27 });
  assert.deepEqual(await reserveBatch(alice, req(21), batch), { allowed: true, remaining: 26, limit: 27 });
  assert.equal(await used('user:'), 1);
  assert.equal(await used('day:'), 2);
  assert.equal((await reserveBatch(alice, req(21), batch)).code, 'duplicate');
  await reserveBatch(alice, req(22), batch);
  await reserveBatch(alice, req(23), batch);
  assert.equal((await reserveBatch(alice, req(24), batch)).code, 'batch_full');
  assert.equal(await used('day:'), 4);
  assert.deepEqual(await reserveBatch(bob, req(25), batch), { allowed: true, remaining: 26, limit: 27 }, 'Batch ids are per account');
  await clear();
  assert.equal((await reserveBatch(alice, req(30), batch, { user: 1 })).allowed, true);
  assert.equal((await reserveBatch(alice, req(31), batch, { user: 1 })).allowed, true, 'A started batch can finish');
  assert.equal((await reserveBatch(alice, req(32), randomUUID(), { user: 1 })).code, 'quota');
  assert.equal((await reserveBatch(alice, req(33), batch, { minute: 2 })).code, 'quota', 'Chunks count against the minute cap');
  await db.query("update public.ai_batches set created_at=now()-interval '2 hours'");
  assert.equal((await reserveBatch(alice, req(34), batch, { user: 5 })).allowed, true);
  assert.equal(await used('user:'), 2, 'An expired batch is charged again');
  const lockSource = await value("select prosrc from pg_proc where proname='reserve_ai'");
  assert.ok(lockSource.includes("hashtextextended('ai:' || p_user_id::text") && !lockSource.includes('2026100501'), 'Per-account lock, no global lock');

  // Access: grant status + plan; one place for the monthly cap.
  const access = user => value('select public.get_ai_access($1::uuid)', [user]);
  assert.deepEqual(await access(alice), { status: 'active', plan: 'free', planExpiresAt: null, unlimited: false, monthlyLimit: null, rankBonus: 0 });
  await db.query("update public.ai_access_grants set status='blocked' where user_id=$1", [alice]);
  assert.equal((await access(alice)).status, 'blocked');
  await db.query("update public.ai_access_grants set status='active' where user_id=$1", [alice]);
  await db.query("insert into public.user_plans(user_id,plan,ai_monthly_limit) values($1,'free',25)", [alice]);
  assert.equal((await access(alice)).monthlyLimit, 25);
  await db.query("update public.user_plans set plan='admin' where user_id=$1", [alice]);
  assert.deepEqual(await access(alice), { status: 'active', plan: 'admin', planExpiresAt: null, unlimited: true, monthlyLimit: null, rankBonus: 0 });
  await db.query("update public.user_plans set plan='plus', ai_monthly_limit=200, expires_at=now()-interval '1 day' where user_id=$1", [alice]);
  assert.deepEqual(await access(alice), { status: 'active', plan: 'free', planExpiresAt: null, unlimited: false, monthlyLimit: null, rankBonus: 0 },
    'An expired plan falls back to free and its cap no longer applies');
  assert.equal((await access(guest)).status, 'active', 'No grant row means active (the backend still requires sign-in)');
  await assert.rejects(db.query("insert into public.user_plans(user_id,plan) values($1,'gold')", [bob]), /check constraint/);

  // API rate limits: per minute and per scope, per account.
  const api = (user, scope, account = 3, scopeLimit = 2) => value('select public.reserve_api_request($1::uuid,$2,$3,$4)', [user, scope, account, scopeLimit]);
  assert.deepEqual(await api(alice, 'sync'), { allowed: true });
  assert.deepEqual(await api(alice, 'sync'), { allowed: true });
  const limited = await api(alice, 'sync');
  assert.equal(limited.allowed, false);
  assert.ok(limited.retry_after >= 1 && limited.retry_after <= 60);
  assert.deepEqual(await api(alice, 'ai'), { allowed: true });
  assert.equal((await api(alice, 'usage')).allowed, false, 'Account-wide cap across scopes');
  assert.deepEqual(await api(bob, 'sync'), { allowed: true });
  await assert.rejects(api(alice, 'redeem'), /Invalid API reservation/, 'redeem attempts are counted only by redeem_code');
  await db.query("insert into public.api_rate_limits values($1,'redeem',date_trunc('hour',now()),2),($1,'sync',now()-interval '5 minutes',1)", [bob]);
  await api(bob, 'sync');
  assert.equal(await value("select count(*)::int from public.api_rate_limits where user_id=$1 and bucket='redeem'", [bob]), 1,
    'Per-minute cleanup keeps the hourly redeem window');
  assert.equal(await value("select count(*)::int from public.api_rate_limits where user_id=$1 and window_start<date_trunc('minute',now()) and bucket<>'redeem'", [bob]), 0);

  // Explanation ledger: per-question attempts, replay, cache, fencing, reset.
  const ticket = randomUUID();
  const expires = new Date(Date.now() + 23 * 3600_000).toISOString();
  const result = { quickTip: 'tip' };
  const claim = (n, request, lease, { user = alice, binding = hash, ticketId = ticket, expiresAt = expires } = {}) => value(
    'select public.claim_explanation_question($1::uuid,$2::uuid,$3,$4,$5::timestamptz,$6::uuid,$7::uuid)', [user, ticketId, n, binding, expiresAt, request, lease]);
  const finish = (n, lease, draft, user = alice) => value(
    'select public.finish_explanation_question($1::uuid,$2::uuid,$3,$4::uuid,$5::jsonb)', [user, ticket, n, lease, draft === null ? null : JSON.stringify(draft)]);
  const r1 = randomUUID(), l1 = randomUUID();
  assert.deepEqual(await claim(104, r1, l1), { action: 'claimed', remainingAttempts: 2 });
  assert.deepEqual(await finish(104, l1, null), { accepted: true, remainingAttempts: 2 });
  assert.equal((await claim(104, r1, randomUUID())).action, 'replayed');
  const l2 = randomUUID();
  assert.equal((await claim(104, randomUUID(), l2)).action, 'claimed');
  const alias = await claim(104, randomUUID(), randomUUID());
  assert.equal(alias.action, 'pending', 'A second request waits for the running one');
  assert.deepEqual(await finish(104, l2, result), { accepted: true, remainingAttempts: 1 });
  assert.deepEqual(await claim(104, randomUUID(), randomUUID()), { action: 'completed', draft: result, remainingAttempts: 1 });
  assert.equal((await claim(104, randomUUID(), randomUUID(), { binding: 'c'.repeat(64) })).action, 'content_changed');
  assert.equal((await claim(104, randomUUID(), randomUUID(), { user: bob })).action, 'claimed', 'Another account never reads the cache');
  const crashed = randomUUID(), oldLease = randomUUID();
  await claim(105, crashed, oldLease);
  await db.query("update public.ai_explanation_questions set lease_until=now()-interval '1 second' where user_id=$1 and question_number=105", [alice]);
  assert.equal((await claim(105, crashed, randomUUID())).action, 'replayed', 'A vanished worker is never replayed');
  const newLease = randomUUID();
  await claim(105, randomUUID(), newLease);
  assert.deepEqual(await finish(105, oldLease, { stale: true }), { accepted: false });
  for (let attempt = 0; attempt < 2; attempt++) { const l = randomUUID(); await claim(106, randomUUID(), l); await finish(106, l, null); }
  const last = randomUUID(); await claim(106, randomUUID(), last); await finish(106, last, null);
  assert.deepEqual(await claim(106, randomUUID(), randomUUID()), { action: 'exhausted', remainingAttempts: 0 });
  await assert.rejects(claim(107, randomUUID(), randomUUID(), { expiresAt: new Date(Date.now() + 26 * 3600_000).toISOString() }), /Invalid explanation claim/);
  await value('select public.reset_learning_data($1::uuid)', [alice]);
  assert.deepEqual(await finish(105, newLease, result), { accepted: false }, 'Reset fences an in-flight completion');
  assert.equal((await claim(104, randomUUID(), randomUUID())).action, 'invalidated', 'A reset cannot rehydrate old cached content');
  assert.equal(await value('select count(*)::int from public.ai_explanation_questions where user_id=$1 and result is not null', [alice]), 0);
  const fresh = new Date(Date.now() + 24 * 3600_000 + 1000).toISOString();
  assert.equal((await claim(108, randomUUID(), randomUUID(), { ticketId: randomUUID(), expiresAt: fresh })).action, 'claimed', 'A ticket issued after reset works');

  // Provider budget guard (cost-weighted) & metadata-only cost ledger.
  const budget = (user, { day = 10, owner = 3, minute = 2, cost = 1 } = {}) => value(
    'select public.reserve_provider_budget($1::uuid,$2,$3,$4,$5)', [user, day, owner, minute, cost]);
  assert.deepEqual(await budget(alice), { allowed: true });
  assert.deepEqual(await budget(alice), { allowed: true });
  const minBlocked = await budget(alice);
  assert.equal(minBlocked.allowed, false);
  assert.equal(minBlocked.code, 'minute');
  assert.ok(minBlocked.retry_after >= 1 && minBlocked.retry_after <= 60);
  // Cost-weighted check: remaining owner capacity is 1, so cost=2 is refused while cost=1 fits.
  assert.equal((await budget(alice, { minute: 10, cost: 2 })).code, 'owner_day');
  assert.deepEqual(await budget(alice, { minute: 10, cost: 1 }), { allowed: true });
  assert.equal((await budget(alice, { minute: 10, cost: 1 })).code, 'owner_day');
  // Bob has a separate owner-day bucket, then hits shared global day cap.
  assert.deepEqual(await budget(bob, { day: 5, owner: 3, minute: 10, cost: 2 }), { allowed: true });
  assert.equal((await budget(bob, { day: 5, owner: 3, minute: 10, cost: 1 })).code, 'day');
  await assert.rejects(budget(alice, { day: 0 }), /Invalid provider budget limits/);
  await assert.rejects(budget(alice, { cost: 0 }), /Invalid provider budget limits/);
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select public.reserve_provider_budget($1::uuid,10,10,10,1)', [alice]), { sub: alice }), /permission denied/);
  await assert.rejects(h.asRole('anon', tx => tx.query('select public.reserve_provider_budget($1::uuid,10,10,10,1)', [alice])), /permission denied/);
  assert.deepEqual((await h.asRole('service_role', tx => tx.query('select public.reserve_provider_budget($1::uuid,100,100,100,1) as r', [bob]))).rows[0].r, { allowed: true });

  // Batch-level explain ticket question ceiling on ai_batches.
  const explainBatchId = randomUUID();
  await reserveBatch(bob, req(90), explainBatchId);
  assert.deepEqual(await value('select public.reserve_batch_explain_quota($1::uuid,$2::uuid,6,16)', [bob, explainBatchId]), { granted: 6, used: 6, limit: 16 });
  assert.deepEqual(await value('select public.reserve_batch_explain_quota($1::uuid,$2::uuid,6,16)', [bob, explainBatchId]), { granted: 6, used: 12, limit: 16 });
  assert.deepEqual(await value('select public.reserve_batch_explain_quota($1::uuid,$2::uuid,6,16)', [bob, explainBatchId]), { granted: 4, used: 16, limit: 16 });
  assert.deepEqual(await value('select public.reserve_batch_explain_quota($1::uuid,$2::uuid,3,16)', [bob, explainBatchId]), { granted: 0, used: 16, limit: 16 });

  await db.query("select public.record_ai_usage($1::uuid,'explain-batch','gpt-6-luna','medium',1200,300,450,1850,'ok')", [alice]);
  const ledgerRow = await one('select user_id, endpoint, model, effort, input_tokens, cached_tokens, output_tokens, duration_ms, status from public.ai_cost_ledger');
  assert.deepEqual(ledgerRow, {
    user_id: alice, endpoint: 'explain-batch', model: 'gpt-6-luna', effort: 'medium',
    input_tokens: 1200, cached_tokens: 300, output_tokens: 450, duration_ms: 1850, status: 'ok'
  });

  // Identity carryover across self-service account deletion (S-01):
  // block status, monthly AI usage, daily provider owner units, redeem rate limit and multi-use promo history survive delete + re-login.
  const idHash = 'd'.repeat(64);
  const promoHash = 'e'.repeat(64);
  await db.query("update public.ai_access_grants set status='blocked' where user_id=$1", [alice]);
  await db.query("insert into public.redeem_codes(code_hash,plan,duration_days,max_redemptions) values($1,'plus',30,10)", [promoHash]);
  assert.equal((await value('select public.redeem_code($1::uuid,$2)', [alice, promoHash])).ok, true);
  assert.equal((await value('select public.redeem_code($1::uuid,$2)', [alice, 'f'.repeat(64)])).code, 'invalid');
  assert.deepEqual(await value('select public.prepare_account_deletion($1::uuid,$2)', [alice, idHash]), { prepared: true, carried: true });

  // A retry after a failed delete must not count the same usage twice; only growth since the last call is added.
  const carried = async () => (await db.query('select bucket, used from private.identity_carryover_counters order by bucket')).rows;
  const firstCarry = await carried();
  assert.ok(firstCarry.length >= 2, 'Month and provider counters are carried');
  assert.deepEqual(await value('select public.prepare_account_deletion($1::uuid,$2)', [alice, idHash]), { prepared: true, carried: true });
  assert.deepEqual(await carried(), firstCarry, 'Retrying prepare_account_deletion does not double count');
  const monthBucket = firstCarry.find(r => r.bucket.startsWith('id_month:'));
  await db.query("update public.ai_usage_counters set used = used + 2 where bucket like 'user:' || $1 || ':%'", [alice]);
  await value('select public.prepare_account_deletion($1::uuid,$2)', [alice, idHash]);
  await value('select public.prepare_account_deletion($1::uuid,$2)', [alice, idHash]);
  assert.equal((await carried()).find(r => r.bucket === monthBucket.bucket).used, monthBucket.used + 2, 'Only new usage is added on retry');
  await db.query("update public.ai_usage_counters set used = used - 2 where bucket like 'user:' || $1 || ':%'", [alice]);
  await value('select public.prepare_account_deletion($1::uuid,$2)', [alice, idHash]);
  assert.equal((await carried()).find(r => r.bucket === monthBucket.bucket).used, monthBucket.used + 2, 'A lower reading never lowers the carryover');
  await db.query("update private.identity_carryover_counters set used = used - 2 where bucket = $1", [monthBucket.bucket]);
  await db.query("update private.account_deletion_contributions set used = used - 2 where bucket = $1", [monthBucket.bucket]);
  assert.deepEqual(await carried(), firstCarry);
  await assert.rejects(h.asRole('service_role', tx => tx.query('select count(*) from private.account_deletion_contributions')), /permission denied/);

  // Account deletion removes every AI row of that account.
  await db.query('delete from auth.users where id=$1', [alice]);
  for (const table of ['ai_usage_counters', 'ai_provider_budget_counters', 'ai_requests', 'ai_batches', 'ai_explanation_questions', 'ai_explanation_requests', 'api_rate_limits', 'user_plans', 'ai_access_grants']) {
    assert.equal(await value(`select count(*)::int from public.${table} where user_id=$1`, [alice]), 0, `${table} survived account deletion`);
  }
  assert.equal(await value('select count(*)::int from private.account_deletion_contributions where user_id=$1', [alice]), 0, 'Per-account contributions go with the account');
  assert.deepEqual(await carried(), firstCarry, 'Carryover itself survives the delete');
  assert.equal(await value('select user_id from public.ai_cost_ledger limit 1'), null, 'Cost ledger anonymizes user_id on account deletion');
  assert.ok(await value("select count(*)::int from public.ai_usage_counters where user_id is null") > 0, 'Shared day/minute/IP counters stay');

  // Re-registering with the same verified identity restores block, quotas, rate limits and promo history.
  const aliceReborn = uid(99);
  await h.addUser(aliceReborn, { email: 'alice@example.test' });
  assert.equal((await access(aliceReborn)).status, 'active', 'Raw trigger starts active before carryover');
  assert.deepEqual(await value('select public.apply_identity_carryover($1::uuid,$2)', [aliceReborn, idHash]), { applied: true, blocked: true });
  assert.equal((await access(aliceReborn)).status, 'blocked', 'Admin block survives account delete + re-login');
  // Provider owner units (3) carried over -> next unit hits owner=3 cap immediately.
  assert.equal((await budget(aliceReborn, { day: 100, owner: 3, minute: 100, cost: 1 })).code, 'owner_day');
  // Multi-use promo code cannot be redeemed again by the recreated account.
  assert.equal((await value('select public.redeem_code($1::uuid,$2)', [aliceReborn, promoHash])).code, 'already_used');
  // If an admin later unblocks aliceReborn, subsequent carryover calls stay active.
  await db.query("update public.ai_access_grants set status='active' where user_id=$1", [aliceReborn]);
  assert.deepEqual(await value('select public.apply_identity_carryover($1::uuid,$2)', [aliceReborn, idHash]), { applied: true, blocked: false });
  assert.equal((await access(aliceReborn)).status, 'active');
  console.log('AI quotas, batches, quota status, access/plans, API limits, explanation ledger, provider budget, cost ledger and AI account deletion carryover passed.');
} finally {
  await db.close();
}
