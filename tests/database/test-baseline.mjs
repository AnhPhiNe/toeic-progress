// Baseline v2: shape, security model (RLS, grants, search_path), idempotent
// re-apply and the refusal to run on top of v1 objects.
import assert from 'node:assert/strict';
import { baselineSql, createDatabase, profile, record, uid } from './harness.mjs';

const RPCS = [
  'ai_quota_status(uuid,boolean,text)', 'apply_identity_carryover(uuid,text)',
  'claim_explanation_question(uuid,uuid,integer,text,timestamp with time zone,uuid,uuid)',
  'finish_explanation_question(uuid,uuid,integer,uuid,jsonb)', 'get_ai_access(uuid)', 'get_ai_usage(uuid,boolean,integer)',
  'league_join(uuid,date,text,text)', 'league_leave(uuid,date)', 'league_refresh(uuid,date,integer)', 'league_update(uuid,date,text,text)',
  'prepare_account_deletion(uuid,text)',
  'record_ai_usage(uuid,text,text,text,integer,integer,integer,integer,text)',
  'redeem_code(uuid,text)', 'reserve_ai_batch_request(uuid,boolean,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer)',
  'reserve_ai_request(uuid,boolean,uuid,text,text,integer,integer,integer,integer)', 'reserve_api_request(uuid,text,integer,integer)',
  'reserve_batch_explain_quota(uuid,uuid,integer,integer)',
  'reserve_provider_budget(uuid,integer,integer,integer,integer)',
  'reset_learning_data(uuid)', 'run_maintenance(integer,integer)', 'schema_ready()', 'sync_account_records(uuid,jsonb,bigint,boolean)'
].sort();
const TABLES = ['ai_access_grants', 'ai_batches', 'ai_cost_ledger', 'ai_explanation_questions', 'ai_explanation_requests', 'ai_provider_budget_counters', 'ai_requests', 'ai_usage_counters',
  'api_rate_limits', 'learning_data_resets', 'league_groups', 'league_members', 'league_standings', 'league_weeks', 'mistakes',
  'pacing_run_phases', 'pacing_runs', 'redeem_code_uses', 'redeem_codes', 'streak_shields', 'study_session_parts', 'study_sessions',
  'sync_tombstones', 'user_plans', 'user_profiles', 'vocabulary_logs'];

const h = await createDatabase();
const { db, one, value } = h;
try {
  // Only current features: no retired tables, views or functions.
  const tables = (await db.query("select relname from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows.map(r => r.relname).sort();
  assert.deepEqual(tables, TABLES.sort());
  assert.equal(await value("select count(*)::int from pg_class where relnamespace='public'::regnamespace and relkind in ('v','m')"), 0, 'No public views');
  for (const gone of ['weekly_plans', 'weekly_plan_tasks', 'exam_checklist', 'sync_records', 'sync_records_legacy', 'exam_history', 'ai_provider_state', 'ai_provider_attempts']) {
    assert.equal(await value('select to_regclass($1) is null', ['public.' + gone]), true, gone);
  }
  assert.equal(await value("select count(*)::int from pg_proc where proname in ('apply_sync_records','reserve_gemini_attempt','finish_gemini_attempt','cleanup_ai_usage','explanation_ledger_ready')"), 0);
  assert.equal(await value("select count(*)::int from information_schema.columns where table_schema='public' and column_name in ('owner_id','deleted_at') and table_name<>'sync_tombstones'"), 0,
    'user_id everywhere; live tables carry no dead deleted_at column');

  // Security: RLS everywhere, no policies, nothing for browser roles.
  assert.equal(await value("select count(*)::int from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity"), 0);
  assert.equal(await value("select count(*)::int from pg_policies where schemaname='public'"), 0);
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await value(`select count(*)::int from pg_class c where c.relnamespace in ('public'::regnamespace,'private'::regnamespace)
      and c.relkind in ('r','v','S') and (has_table_privilege('${role}', c.oid, 'select') or has_table_privilege('${role}', c.oid, 'insert')
      or has_table_privilege('${role}', c.oid, 'update') or has_table_privilege('${role}', c.oid, 'delete'))`), 0, role + ' table privileges');
    assert.equal(await value(`select count(*)::int from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace)
      and has_function_privilege('${role}', p.oid, 'execute')`), 0, role + ' function privileges');
    assert.equal(await value(`select has_schema_privilege('${role}','private','usage')`), false);
  }
  assert.equal(await value("select has_schema_privilege('service_role','private','usage')"), false);
  assert.equal(await value("select count(*)::int from pg_proc where pronamespace='private'::regnamespace and has_function_privilege('service_role', oid, 'execute')"), 0);
  const serviceRpcs = (await db.query(`select p.oid::regprocedure::text as name from pg_proc p where p.pronamespace='public'::regnamespace
    and has_function_privilege('service_role', p.oid, 'execute') order by 1`)).rows.map(r => r.name).sort();
  assert.deepEqual(serviceRpcs, RPCS, 'service_role executes exactly the RPCs');
  const serviceTables = (await db.query(`select c.relname, has_table_privilege('service_role',c.oid,'insert') or has_table_privilege('service_role',c.oid,'update')
    or has_table_privilege('service_role',c.oid,'delete') as writes from pg_class c where c.relnamespace in ('public'::regnamespace,'private'::regnamespace)
    and c.relkind in ('r','v','S') and has_table_privilege('service_role',c.oid,'select') order by 1`)).rows;
  assert.deepEqual(serviceTables, ['league_members', 'mistakes', 'pacing_runs', 'study_sessions', 'vocabulary_logs'].map(relname => ({ relname, writes: false })),
    'service_role reads only what the backend selects, and writes only through RPCs');
  const unsafe = (await db.query(`select p.oid::regprocedure::text as name from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace)
    and not coalesce(p.proconfig @> array['search_path=""'], false)`)).rows;
  assert.deepEqual(unsafe, [], 'Every function pins search_path to empty');
  const invokers = (await db.query(`select p.oid::regprocedure::text as name from pg_proc p where p.pronamespace='public'::regnamespace and not p.prosecdef`)).rows;
  assert.deepEqual(invokers, [], 'Every RPC is SECURITY DEFINER');

  await h.addUser(uid(1), { email: 'Alice@Example.test', name: 'Alice' });
  await h.sync(uid(1), [profile(), record('vocabLog', 'v1', { date: '2026-11-20', count: 3 })]);
  const claims = { sub: uid(1), is_anonymous: false, role: 'authenticated' };
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select * from public.study_sessions'), claims), /permission denied/);
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select * from public.league_standings'), claims), /permission denied/);
  await assert.rejects(h.asRole('anon', tx => tx.query("select public.sync_account_records($1::uuid,'[]'::jsonb,0,false)", [uid(1)])), /permission denied/);
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select * from private.sync_rows'), claims), /permission denied/);
  await assert.rejects(h.asRole('service_role', tx => tx.query("insert into public.user_plans(user_id,plan) values($1,'admin')", [uid(1)])), /permission denied/);
  assert.equal((await h.asRole('service_role', tx => tx.query('select word_count from public.vocabulary_logs'))).rows[0].word_count, 3);

  // Objects created later in public stay private by default.
  await db.exec('create table public.later(id int)');
  assert.equal(await value("select has_table_privilege('anon','public.later','select') or has_table_privilege('authenticated','public.later','select')"), false);
  await db.exec('drop table public.later');

  // GoTrue inserts users as supabase_auth_admin: the trigger still registers the grant.
  await h.asRole('supabase_auth_admin', tx => tx.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'Bob@Example.test','{\"name\":\"Bob\"}')", [uid(2)]));
  assert.deepEqual(await one('select email, display_name, status from public.ai_access_grants where user_id=$1', [uid(2)]),
    { email: 'bob@example.test', display_name: 'Bob', status: 'active' });
  await h.addUser(uid(3), { anonymous: true });
  assert.equal(await value('select count(*)::int from public.ai_access_grants where user_id=$1', [uid(3)]), 0, 'Guests get no grant row');
  await db.query("update public.ai_access_grants set email='someone-else@example.test' where user_id=$1", [uid(1)]);
  assert.equal(await value('select email from public.ai_access_grants where user_id=$1', [uid(1)]), 'alice@example.test', 'Display fields follow Auth');

  // schema_ready() reports a missing wave-1 object (checked inside a rolled-back transaction).
  assert.deepEqual(await value('select public.schema_ready()'), { baseline: 2, ready: true });
  for (const drop of ['drop function public.reserve_batch_explain_quota(uuid,uuid,integer,integer)', 'alter table public.ai_batches drop column explain_questions',
    'drop table private.identity_redeem_uses', 'drop table private.account_deletion_contributions cascade']) {
    await assert.rejects(db.transaction(async tx => {
      await tx.exec(drop);
      assert.deepEqual((await tx.query('select public.schema_ready() as r')).rows[0].r, { baseline: 2, ready: false }, drop);
      throw new Error('rollback');
    }), /rollback/);
  }

  // Re-applying the baseline is a no-op that keeps data, sync epoch, and incremental RPC grants.
  const epoch = await value("select value from private.settings where key='sync_epoch'");
  await db.exec(await baselineSql());
  assert.equal(await value('select count(*)::int from public.vocabulary_logs'), 1);
  assert.equal(await value("select value from private.settings where key='sync_epoch'"), epoch);
  assert.deepEqual(await value('select public.schema_ready()'), { baseline: 2, ready: true });
  const serviceRpcsAfterReapply = (await db.query(`select p.oid::regprocedure::text as name from pg_proc p where p.pronamespace='public'::regnamespace
    and has_function_privilege('service_role', p.oid, 'execute') order by 1`)).rows.map(r => r.name).sort();
  assert.deepEqual(serviceRpcsAfterReapply, RPCS, 'Re-applying baseline must not revoke incremental service_role RPCs');

  // Refuses to build on top of v1 objects.
  const old = await createDatabase({ apply: false });
  await old.db.exec('create table public.weekly_plans(id int)');
  await assert.rejects(old.db.exec(await baselineSql()), /drop_v1/);
  await old.db.close();
  console.log('Baseline shape, RLS, grants, search_path, default privileges, auth trigger and idempotent re-apply passed.');
} finally {
  await db.close();
}
