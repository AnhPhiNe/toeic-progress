import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const reserve = async (owner, scope, account = 3, limit = 2) => (await db.query(
  'select public.reserve_api_request($1::uuid,$2::text,$3::integer,$4::integer) as value', [owner,scope,account,limit]
)).rows[0].value;

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  for (const name of ['20260923000000_sync_records.sql','20261005000000_fastapi_backend.sql','20261006000000_domain_tables.sql','20261006010000_purge_deleted_content.sql','20261006020000_api_rate_limits.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name, import.meta.url), 'utf8'));
  }
  await db.query('insert into auth.users values($1,false),($2,true)', [alice,bob]);
  assert.equal((await reserve(alice,'sync')).allowed,true);
  assert.equal((await reserve(alice,'sync')).allowed,true);
  const limited = await reserve(alice,'sync');
  assert.equal(limited.allowed,false);
  assert.ok(limited.retry_after>=1 && limited.retry_after<=60);
  assert.equal((await reserve(alice,'usage')).allowed,true);
  assert.equal((await reserve(alice,'ai')).allowed,false,'Account limit must combine endpoints');
  assert.equal((await reserve(bob,'usage')).allowed,true,'Identities must have independent counters');
  assert.equal((await db.query("select used from public.api_rate_limits where owner_id=$1 and bucket='account'",[alice])).rows[0].used,3,'Denied requests must not consume additional quota');
  await assert.rejects(reserve(alice,'arbitrary'), /Invalid API reservation/);
  await assert.rejects(reserve(alice,'sync',0), /Invalid API reservation/);
  const permissions=(await db.query(`select
    has_function_privilege('anon','public.reserve_api_request(uuid,text,integer,integer)','execute') as anon,
    has_function_privilege('authenticated','public.reserve_api_request(uuid,text,integer,integer)','execute') as authenticated,
    has_function_privilege('service_role','public.reserve_api_request(uuid,text,integer,integer)','execute') as service`)).rows[0];
  assert.deepEqual(permissions,{anon:false,authenticated:false,service:true});
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from public.api_rate_limits');}),/permission denied/);
  await db.query("update public.api_rate_limits set window_start=window_start-interval '2 minutes' where owner_id=$1",[alice]);
  assert.equal((await reserve(alice,'sync')).allowed,true,'New minute must renew quota');
  assert.equal((await db.query('select count(*)::int as n from public.api_rate_limits where owner_id=$1',[alice])).rows[0].n,2,'Expired counters must be removed per owner');
  await db.query("update public.api_rate_limits set window_start=window_start-interval '2 days'");
  await db.query('select public.cleanup_ai_usage()');
  assert.equal((await db.query('select count(*)::int as n from public.api_rate_limits')).rows[0].n,0);
  await reserve(bob,'usage');
  await db.query('delete from auth.users where id=$1',[bob]);
  assert.equal((await db.query('select count(*)::int as n from public.api_rate_limits')).rows[0].n,0,'Account deletion must remove operational counters');
  console.log('Shared API scope/account caps, denied reservations, renewal, grants, cleanup and account deletion passed.');
} catch(error) {
  console.error('API limiter database check failed:',error.message);
  process.exitCode=1;
} finally { await db.close(); }
