import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const migration = await readFile(new URL('../../supabase/migrations/20261010000000_retire_gemini_provider.sql', import.meta.url), 'utf8');
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;
  `);
  // A fresh OpenAI installation has no legacy pool. Reapplying cleanup is safe.
  await db.exec(migration);
  await db.exec(migration);
  for (const filename of ['20260923000000_sync_records.sql', '20261005000000_fastapi_backend.sql',
    '20261006000000_domain_tables.sql', '20261006010000_purge_deleted_content.sql', '20261006020000_api_rate_limits.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/' + filename, import.meta.url), 'utf8'));
  }
  await db.query('insert into auth.users values($1,false)', [owner]);
  const stamp = '2026-10-10T00:00:00Z';
  await db.query('select public.sync_account_records($1::uuid,$2::jsonb,0,false)', [owner, JSON.stringify([{
    entity_type: 'mistakes', record_id: 'note', updated_at: stamp, deleted_at: null,
    payload: { id: 'note', part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: 'Reports ____ submitted.', question: 'Reports ____ submitted.', context: 'The office is closed today.',
      userMistake: '(A) are', correctAnswer: '(B) be', tags: [], createdAt: stamp }
  }])]);
  const reserve = async (id, hash) => (await db.query(
    'select public.reserve_ai_request($1::uuid,false,$2::uuid,$3,$4,10,20,2,5) as result',
    [owner, id, hash.repeat(64), 'c'.repeat(64)]
  )).rows[0].result;
  const snapshot = async () => (await db.query('select public.sync_account_records($1::uuid,\'[]\'::jsonb,0,false) as result', [owner])).rows[0].result;
  const usage = async () => (await db.query('select public.get_ai_usage($1::uuid,false,10) as result', [owner])).rows[0].result;
  assert.equal((await reserve('22222222-2222-4222-8222-222222222222', 'a')).allowed, true);
  const before = await snapshot(), beforeUsage = await usage();
  await db.exec(await readFile(new URL('../../supabase/migrations/20261007000000_gemini_provider_pool.sql', import.meta.url), 'utf8'));
  await db.exec(`
    insert into public.ai_provider_state(scope) values ('retired-project');
    insert into public.ai_provider_attempts(id,project_id,model,key_id,input_tokens,reserved_at,lease_until)
      values ('11111111-1111-4111-8111-111111111111','retired-project','retired-model','key-hash',10,now(),now());
  `);
  await db.exec(migration);
  const absent = (await db.query(`select
    to_regclass('public.ai_provider_state') as state,
    to_regclass('public.ai_provider_attempts') as attempts,
    to_regprocedure('public.reserve_gemini_attempt(uuid,text,jsonb,integer,integer,integer,integer,integer)') as reserve,
    to_regprocedure('public.finish_gemini_attempt(uuid,text,text,integer)') as finish`)).rows[0];
  assert.deepEqual(absent, { state: null, attempts: null, reserve: null, finish: null });
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await usage(), beforeUsage);
  assert.equal(beforeUsage.remaining, 9);
  assert.equal((await reserve('44444444-4444-4444-8444-444444444444', 'b')).allowed, true);
  assert.equal((await usage()).remaining, 8);
  await db.exec(migration);
  console.log('Retired provider cleanup supports old/fresh installations and preserves learning data/app AI counters.');
} finally {
  await db.close();
}
