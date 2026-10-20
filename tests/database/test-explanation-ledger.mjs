import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = randomUUID(), other = randomUUID(), ticket = randomUUID();
const expires = new Date(Date.now() + 23 * 3600_000).toISOString();
const migration = await readFile(new URL('../../supabase/migrations/20261020104827_durable_explanation_tickets.sql', import.meta.url), 'utf8');
const claim = async (number, request, lease, extra = {}) => {
  const p = { owner, ticket, number, binding: 'a'.repeat(64), expires, request, lease, ...extra };
  return (await db.query('select public.claim_explanation_question($1,$2,$3,$4,$5,$6,$7) as value',
    [p.owner,p.ticket,p.number,p.binding,p.expires,p.request,p.lease])).rows[0].value;
};
const finish = async (number, lease, result, extra = {}) => (await db.query(
  'select public.finish_explanation_question($1,$2,$3,$4,$5) as value',
  [extra.owner ?? owner,extra.ticket ?? ticket,number,lease,result])).rows[0].value;
const result = { question: 'Which delivery is free?', context: 'Complete source.', explanation: { quickTip: 'Read the fee column.' } };

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.learning_data_resets(user_id uuid primary key references auth.users(id) on delete cascade,reset_at timestamptz);
    grant all on public.learning_data_resets to service_role;`);
  await db.query('insert into auth.users values($1),($2)', [owner,other]);
  await db.exec(migration);
  assert.deepEqual((await db.query('select public.explanation_ledger_ready() as value')).rows[0].value,{ version: 1,tables: true });

  // Every failed question has its own first attempt and retries, not a shared batch cap.
  for (let number = 104; number < 110; number++) {
    const request = randomUUID(), lease = randomUUID();
    assert.deepEqual(await claim(number,request,lease),{ action: 'claimed',remainingAttempts: 2 });
    assert.deepEqual(await finish(number,lease,null),{ accepted: true,remainingAttempts: 2 });
    assert.equal((await claim(number,request,randomUUID())).action,'replayed','Same failed request must not generate again');
  }
  for (let number = 104; number < 110; number++) {
    const lease = randomUUID();
    assert.deepEqual(await claim(number,randomUUID(),lease),{ action: 'claimed',remainingAttempts: 1 });
    assert.deepEqual(await finish(number,lease,result),{ accepted: true,remainingAttempts: 1 });
    assert.deepEqual(await claim(number,randomUUID(),randomUUID()),{ action: 'completed',draft: result,remainingAttempts: 1 });
  }
  assert.equal((await claim(104,randomUUID(),randomUUID(),{ binding: 'b'.repeat(64) })).action,'content_changed');
  assert.equal((await claim(104,randomUUID(),randomUUID(),{ owner: other })).action,'claimed','Another owner cannot read the cache');

  // PGlite serializes requests through one connection: this checks the SQL
  // pending-alias state machine, not real cross-session row-lock concurrency.
  const first = randomUUID(), alias = randomUUID(), lease = randomUUID();
  const competing = await Promise.all([claim(110,first,lease),claim(110,alias,randomUUID())]);
  assert.equal(competing.filter(value => value.action === 'claimed').length,1);
  assert.equal(competing.filter(value => value.action === 'pending').length,1);
  assert.equal((await claim(110,first,randomUUID())).action,'pending');
  await finish(110,lease,null);
  assert.equal((await claim(110,alias,randomUUID())).action,'replayed','Joined request is durable after reconnect');

  // A worker may disappear after a paid request. Its old request cannot dispatch
  // again, and the old lease can never overwrite the next explicit attempt.
  const crashed = randomUUID(), oldLease = randomUUID();
  assert.equal((await claim(111,crashed,oldLease)).action,'claimed');
  await db.query(`update public.ai_explanation_questions set lease_until=now()-interval '1 second'
    where owner_id=$1 and ticket_id=$2 and question_number=111`,[owner,ticket]);
  assert.deepEqual(await claim(111,crashed,randomUUID()),{ action: 'replayed',remainingAttempts: 2 });
  const newLease = randomUUID();
  assert.equal((await claim(111,randomUUID(),newLease)).action,'claimed');
  assert.deepEqual(await finish(111,oldLease,{ bad: 'stale result' }),{ accepted: false });
  assert.equal((await finish(111,newLease,result)).accepted,true);
  assert.deepEqual((await claim(111,randomUUID(),randomUUID())).draft,result);
  assert.deepEqual(await finish(111,null,result),{ accepted: false },'An empty lease cannot write a finished question');

  for (let attempt = 0; attempt < 3; attempt++) {
    const currentLease = randomUUID();
    assert.equal((await claim(112,randomUUID(),currentLease)).remainingAttempts,2-attempt);
    await finish(112,currentLease,null);
  }
  assert.deepEqual(await claim(112,randomUUID(),randomUUID()),{ action: 'exhausted',remainingAttempts: 0 });

  // The service role uses invoker functions; browser roles cannot call/read/write anything.
  const functions = ['explanation_ledger_ready()',
    'claim_explanation_question(uuid,uuid,integer,text,timestamp with time zone,uuid,uuid)',
    'finish_explanation_question(uuid,uuid,integer,uuid,jsonb)',
    'clear_explanation_cache_on_reset()', 'cleanup_explanation_ledger(integer)'];
  for (const role of ['anon','authenticated']) {
    for (const name of functions) assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') as allowed',
      [role,'public.'+name])).rows[0].allowed,false);
    for (const table of ['ai_explanation_questions','ai_explanation_requests']) {
      await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.exec(`select * from public.${table}`); }),/permission denied/);
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await db.query(
        'select has_table_privilege($1,$2,$3) as allowed',[role,'public.'+table,privilege])).rows[0].allowed,false);
    }
  }
  const security = (await db.query(`select prosecdef,proconfig from pg_proc where proname in
    ('claim_explanation_question','finish_explanation_question','explanation_ledger_ready')`)).rows;
  assert.equal(security.length,3);
  assert.ok(security.every(value => !value.prosecdef && value.proconfig.includes('search_path=""')));
  const source = await db.query(`select proname,prosrc from pg_proc where proname in
    ('claim_explanation_question','clear_explanation_cache_on_reset')`);
  for (const entry of source.rows) assert.ok(entry.prosrc.includes('pg_advisory_xact_lock(hashtextextended('));
  const claimSource = source.rows.find(value => value.proname === 'claim_explanation_question').prosrc;
  assert.ok(claimSource.indexOf('pg_advisory_xact_lock') < claimSource.indexOf('if exists(select 1 from public.learning_data_resets'),
    'Owner lock must precede barrier check and insertion');
  await db.transaction(async tx => { await tx.exec('set local role service_role'); assert.equal((await tx.query('select public.explanation_ledger_ready() as value')).rows[0].value.version,1); });

  // TTL cleanup is bounded and does not delete live grants or a running lease.
  await db.query(`insert into public.ai_explanation_questions(owner_id,ticket_id,question_number,binding,expires_at)
    select $1,$2,generate_series(1,150),$3,now()-interval '1 day'`,[owner,randomUUID(),'a'.repeat(64)]);
  const before = Number((await db.query(`select count(*) from public.ai_explanation_questions where expires_at<now()`)).rows[0].count);
  const resetLease = randomUUID();
  await claim(113,randomUUID(),resetLease);
  const after = Number((await db.query(`select count(*) from public.ai_explanation_questions where expires_at<now()`)).rows[0].count);
  assert.equal(before-after,100);
  assert.equal((await db.query('select public.cleanup_explanation_ledger(10) as removed')).rows[0].removed,10);
  assert.deepEqual((await claim(104,randomUUID(),randomUUID())).draft,result,'Cleanup retains valid cached results');
  await db.query('insert into public.learning_data_resets values($1,now())',[owner]);
  assert.deepEqual(await finish(113,resetLease,result),{ accepted: false },'Reset fences an in-flight completion');
  assert.equal((await claim(104,randomUUID(),randomUUID())).action,'invalidated','A reset cannot rehydrate an old cached ticket');
  assert.equal((await db.query('select result,attempts,invalidated from public.ai_explanation_questions where owner_id=$1 and ticket_id=$2 and question_number=104',
    [owner,ticket])).rows[0].result,null);
  assert.equal((await db.query('select attempts from public.ai_explanation_questions where owner_id=$1 and ticket_id=$2 and question_number=104',
    [owner,ticket])).rows[0].attempts,2,'Reset must not grant fresh retries');
  const afterResetExpiry = new Date(Date.now() + 24 * 3600_000 + 1000).toISOString();
  assert.equal((await claim(114,randomUUID(),randomUUID(),{ ticket: randomUUID(),expires: afterResetExpiry })).action,'claimed',
    'A newly issued ticket after reset still works');
  await db.query('delete from auth.users where id=$1',[owner]);
  assert.equal(Number((await db.query('select count(*) from public.ai_explanation_questions where owner_id=$1',[owner])).rows[0].count),0);
  assert.equal(Number((await db.query('select count(*) from public.ai_explanation_requests where owner_id=$1',[owner])).rows[0].count),0);
  console.log('Explanation ledger: atomic claims, per-question retries, replay, cache, crash fencing, private ACL/RLS and bounded TTL passed.');
} finally { await db.close(); }
