import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const tester = '22222222-2222-4222-8222-222222222222';
const guest = '33333333-3333-4333-8333-333333333333';
const fresh = '44444444-4444-4444-8444-444444444444';
const migration = await readFile(new URL('../../supabase/migrations/20261011000000_ai_access_grants.sql', import.meta.url), 'utf8');
const grant = async id => (await db.query('select * from public.ai_access_grants where user_id=$1', [id])).rows[0];

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, is_anonymous boolean not null default false,
      email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}');
    create table auth.identities(user_id uuid references auth.users on delete cascade, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  for (const name of ['20260923000000_sync_records.sql', '20261005000000_fastapi_backend.sql',
    '20261006000000_domain_tables.sql', '20261006010000_purge_deleted_content.sql', '20261006020000_api_rate_limits.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'));
  }
  await db.query(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    ($1,'anhphine1011@gmail.com',now(),'{"full_name":"Owner"}'),
    ($2,'tester@gmail.com',now(),'{"name":"Tester","ai_unlimited":true,"status":"active"}')`, [owner,tester]);
  await db.query(`insert into auth.users(id,is_anonymous) values($1,true)`, [guest]);
  await db.query(`insert into auth.identities values($1,'google','{"email":"anhphine1011@gmail.com","email_verified":true}')`, [owner]);
  await db.exec(migration);
  assert.equal((await grant(owner)).status,'active'); assert.equal((await grant(owner)).monthly_limit,null);
  assert.equal((await grant(tester)).status,'pending'); assert.equal((await grant(tester)).monthly_limit,10);
  assert.equal((await grant(tester)).display_name,'Tester'); assert.equal(await grant(guest),undefined);
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'new@gmail.com','{"status":"active","monthly_limit":null}')`, [fresh]);
  assert.equal((await grant(fresh)).status,'pending','Auth metadata must never approve AI');
  await db.query(`update public.ai_access_grants set status='active',monthly_limit=27,email='spoof@example.com' where user_id=$1`, [tester]);
  assert.equal((await grant(tester)).email,'tester@gmail.com');
  await db.query(`update auth.users set email='changed@gmail.com',raw_user_meta_data='{"name":"New name","monthly_limit":999}' where id=$1`, [tester]);
  assert.equal((await grant(tester)).email,'changed@gmail.com'); assert.equal((await grant(tester)).display_name,'New name');
  assert.equal((await grant(tester)).status,'active'); assert.equal((await grant(tester)).monthly_limit,27);
  await db.query(`update auth.users set is_anonymous=false,email='promoted@gmail.com' where id=$1`, [guest]);
  assert.equal((await grant(guest)).status,'pending','Guest promotion must require approval');
  await db.query(`update public.ai_access_grants set status='blocked',monthly_limit=3 where user_id=$1`, [owner]);
  await db.exec(migration);
  assert.equal((await grant(owner)).status,'blocked','Reapplying must not restore revoked owner access');
  assert.equal((await grant(tester)).monthly_limit,27,'Reapplying must retain admin changes');

  for (const role of ['anon','authenticated']) {
    for (const sql of ['select * from public.ai_access_grants',
      "update public.ai_access_grants set status='active',monthly_limit=null", 'delete from public.ai_access_grants',
      `insert into public.ai_access_grants(user_id) values('${fresh}')`]) {
      await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.exec(sql); }), /permission denied/);
    }
    for (const name of ['normalize_ai_access_grant','register_ai_access_grant']) {
      assert.equal((await db.query(`select has_function_privilege($1,$2,'execute') as allowed`,[role,`public.${name}()`])).rows[0].allowed,false);
    }
  }
  assert.equal((await db.query("select relrowsecurity as enabled from pg_class where oid='public.ai_access_grants'::regclass")).rows[0].enabled,true);
  for (const limit of [-1,0,10001]) await assert.rejects(db.query('update public.ai_access_grants set monthly_limit=$1 where user_id=$2',[limit,tester]),/check constraint/);
  await assert.rejects(db.query("update public.ai_access_grants set status='admin' where user_id=$1",[tester]),/check constraint/);
  await db.transaction(async tx => { await tx.exec('set local role service_role'); await tx.query('select * from public.ai_access_grants'); });
  const reserve = async request => (await db.query('select public.reserve_ai_request($1,false,$2,$3,$4,27,100,100,100) as value',
    [tester,request,'a'.repeat(64),'b'.repeat(64)])).rows[0].value;
  assert.equal((await reserve(fresh)).remaining,26);
  await db.query('update public.ai_access_grants set monthly_limit=40 where user_id=$1',[tester]);
  assert.equal((await db.query('select public.get_ai_usage($1,false,40) as value',[tester])).rows[0].value.remaining,39,'Changing grant must retain consumed usage');
  await db.query('select public.reset_learning_data($1)',[tester]);
  assert.equal((await grant(tester)).monthly_limit,40,'Reset learning must retain AI grant');
  assert.equal((await db.query('select public.get_ai_usage($1,false,40) as value',[tester])).rows[0].value.remaining,39);
  await db.query('delete from auth.users where id=$1',[tester]);
  assert.equal(await grant(tester),undefined,'Deleting Auth account must delete its AI grant');
  console.log('AI grants: private admin control, pending signup, owner bootstrap, cap preservation, reset and deletion passed.');
} finally { await db.close(); }
