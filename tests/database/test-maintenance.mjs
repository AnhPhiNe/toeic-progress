// run_maintenance: bounded cleanup of AI logs, batches, rate limits, the
// explanation ledger and league history (12 weeks kept). Live data stays.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, uid } from './harness.mjs';

const h = await createDatabase();
const { db, value } = h;
const alice = uid(1);
const monday = offsetWeeks => {
  const now = new Date(Date.now() + 7 * 3600_000);
  const day = (now.getUTCDay() + 6) % 7;
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day - 7 * offsetWeeks));
  return date.toISOString().slice(0, 10);
};

try {
  await h.addUser(alice, { email: 'alice@example.test' });
  await db.query(`insert into public.ai_usage_counters(bucket,user_id,used,expires_at) values
    ('old-a',$1,1,now()-interval '3 days'),('old-b',null,1,now()-interval '2 days'),('fresh',null,1,now()+interval '1 hour'),('guest',$1,1,null)`, [alice]);
  await db.query(`insert into public.ai_requests(user_id,request_id,input_hash,created_at) values
    ($1,$2,$4,now()-interval '31 days'),($1,$3,$4,now())`, [alice, randomUUID(), randomUUID(), 'a'.repeat(64)]);
  await db.query(`insert into public.ai_batches(user_id,batch_id,created_at) values($1,$2,now()-interval '2 days'),($1,$3,now())`, [alice, randomUUID(), randomUUID()]);
  await db.query(`insert into public.api_rate_limits values($1,'sync',now()-interval '2 days',1),($1,'redeem',date_trunc('hour',now()),2)`, [alice]);
  await db.query(`insert into public.ai_explanation_questions(user_id,ticket_id,question_number,binding,expires_at,lease_id,lease_until)
    select $1,$2,n,$3,now()-interval '1 day',null,null from generate_series(1,7) n`, [alice, randomUUID(), 'a'.repeat(64)]);
  await db.query(`insert into public.ai_explanation_questions(user_id,ticket_id,question_number,binding,expires_at,lease_id,lease_until)
    values($1,$2,1,$3,now()-interval '1 day',$4,now()+interval '1 minute'),($1,$5,1,$3,now()+interval '1 hour',null,null)`,
    [alice, randomUUID(), 'a'.repeat(64), randomUUID(), randomUUID()]);
  for (const weeks of [0, 11, 12, 13, 20]) {
    const week = monday(weeks);
    await db.query('insert into public.league_weeks(week_start) values($1)', [week]);
    const group = await value('insert into public.league_groups(week_start,tier) values($1,1) returning id', [week]);
    await db.query("insert into public.league_standings(week_start,user_id,group_id,nickname,coat) values($1,$2,$3,'Alice','nau-cam')", [week, alice, group]);
  }
  await db.query("insert into public.league_members(user_id,nickname,group_id) values($1,'Alice',(select id from public.league_groups where week_start=$2))", [alice, monday(0)]);
  await db.query(`insert into public.ai_provider_budget_counters(bucket,user_id,used,expires_at) values
    ('old-provider',null,2,now()-interval '2 days'),('fresh-provider',null,1,now()+interval '1 hour')`);
  await db.query(`insert into public.ai_cost_ledger(user_id,endpoint,model,effort,input_tokens,cached_tokens,output_tokens,duration_ms,status,created_at) values
    ($1,'extract','gpt-6-luna','low',100,0,50,500,'ok',now()-interval '95 days'),
    ($1,'extract','gpt-6-luna','low',100,0,50,500,'ok',now()-interval '10 days')`, [alice]);
  await db.query(`insert into private.identity_carryover_counters(bucket,used,expires_at) values
    ('old-carry',4,now()-interval '2 days'),('fresh-carry',2,now()+interval '1 day')`);

  // Bounded: with a limit of 5, the ledger needs two passes.
  const first = await value('select public.run_maintenance(5)');
  assert.deepEqual(first, {
    aiUsageCounters: 2, aiRequests: 1, aiBatches: 1, apiRateLimits: 1, explanationQuestions: 5, leagueWeeks: 2,
    providerBudgetCounters: 1, aiCostLedger: 1, identityCarryover: 1, limit: 5
  });
  const second = await value('select public.run_maintenance(5)');
  assert.equal(second.explanationQuestions, 2);
  assert.deepEqual(await value('select public.run_maintenance()'), {
    aiUsageCounters: 0, aiRequests: 0, aiBatches: 0, apiRateLimits: 0, explanationQuestions: 0, leagueWeeks: 0,
    providerBudgetCounters: 0, aiCostLedger: 0, identityCarryover: 0, limit: 5000
  });

  // What stays: unexpired counters, the guest bucket, recent rows, active leases, 12 weeks of league history.
  assert.deepEqual((await db.query('select bucket from public.ai_usage_counters order by bucket')).rows.map(r => r.bucket), ['fresh', 'guest']);
  assert.deepEqual((await db.query('select bucket from public.ai_provider_budget_counters order by bucket')).rows.map(r => r.bucket), ['fresh-provider']);
  assert.equal(await value('select count(*)::int from public.ai_cost_ledger'), 1);
  assert.deepEqual((await db.query('select bucket from private.identity_carryover_counters order by bucket')).rows.map(r => r.bucket), ['fresh-carry']);
  assert.equal(await value('select count(*)::int from public.ai_requests'), 1);
  assert.equal(await value('select count(*)::int from public.ai_batches'), 1);
  assert.equal(await value("select count(*)::int from public.api_rate_limits where bucket='redeem'"), 1);
  assert.equal(await value('select count(*)::int from public.ai_explanation_questions'), 2, 'Active leases and live tickets stay');
  const weeks = (await db.query('select week_start::text as w from public.league_weeks order by 1')).rows.map(r => r.w);
  assert.deepEqual(weeks, [monday(12), monday(11), monday(0)]);
  assert.equal(await value('select count(*)::int from public.league_standings'), 3, 'Old standings go with their week');
  assert.equal(await value('select group_id is not null from public.league_members'), true, 'The current group is kept');
  await assert.rejects(value('select public.run_maintenance(0)'), /Invalid maintenance request/);
  console.log('Maintenance: bounded cleanup of AI logs, batches, rate limits, explanation ledger and league history passed.');
} finally {
  await db.close();
}
