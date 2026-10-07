import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const a = 'a'.repeat(64), b = 'b'.repeat(64), k1 = '1'.repeat(64), k2 = '2'.repeat(64), k3 = '3'.repeat(64);
const model = 'gemini-3.8-flash';
const project = (id, keys, limits={}) => ({id,key_ids:keys,rpm:5,tpm:250000,rpd:20,...limits});
const claim = async (projects, options={}) => {
  const id = options.id ?? randomUUID();
  const value = (await db.query('select public.reserve_gemini_attempt($1::uuid,$2,$3::jsonb,$4,$5,$6) as v',
    [id,options.model??model,JSON.stringify(projects),options.tokens??100,options.concurrency??2,1])).rows[0].v;
  return {...value,id};
};
const finish = async (attempt, scope=null, reason=null, seconds=0) => db.query(
  'select public.finish_gemini_attempt($1::uuid,$2,$3,$4)',[attempt.id,scope,reason,seconds]);
const reset = async () => db.exec('truncate public.ai_provider_state,public.ai_provider_attempts');

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  for (const name of ['20260923000000_sync_records.sql','20261005000000_fastapi_backend.sql','20261006000000_domain_tables.sql',
    '20261006010000_purge_deleted_content.sql','20261006020000_api_rate_limits.sql','20261007000000_gemini_provider_pool.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'));
  }
  const single = [project(a,[k1,k2])];
  const first = await claim(single), second = await claim(single);
  assert.equal(first.allowed,true); assert.equal(second.allowed,true);
  assert.notEqual(first.key_id,second.key_id,'Least in-flight key must be chosen');
  assert.equal((await claim(single)).code,'busy');
  await finish(first); await finish(second);
  for(let i=0;i<3;i++){const attempt=await claim(single);assert.equal(attempt.allowed,true);await finish(attempt);}
  assert.equal((await claim(single)).allowed,false,'Five RPM are shared by both keys');
  await reset();
  const multiple=[project(a,[k1]),project(b,[k3])];
  const p1=await claim(multiple);const p2=await claim(multiple);
  assert.equal(p1.project_id,a); assert.equal(p2.project_id,b,'Project load must be balanced');
  await finish(p1,'model','rpm',60);await finish(p2);
  const p3=await claim(multiple);assert.equal(p3.project_id,b,'Project B stays available when A/model is cooling');await finish(p3);
  assert.equal((await claim([project(a,[k1])])).allowed,false,'Project A/model cooldown is shared');
  const alternative=await claim([project(a,[k1])],{model:'gemini-3.7-flash'});assert.equal(alternative.allowed,true);await finish(alternative);
  await reset();
  const daily=await claim(single);await finish(daily,'model','rpd',86400);
  const denied=await claim(single);assert.equal(denied.allowed,false);assert.ok(denied.retry_after>86390);
  await db.query("update public.ai_provider_state set blocked_until=clock_timestamp()-interval '1 second' where reason='rpd'");
  const probe=await claim(single);assert.equal(probe.allowed,true);
  assert.equal((await claim(single)).allowed,false,'Only one recovery probe can pass');
  await finish(probe);
  assert.equal((await claim(single)).allowed,true,'A successful probe clears the marker');
  await reset();
  const global=await claim(single);await finish(global,'project','unknown_quota',60);
  assert.equal((await claim(single,{model:'gemini-3.5-flash'})).allowed,false,'Unknown quota blocks every model in the project');
  await reset();
  const invalid=await claim(single);await finish(invalid,'key','invalid_key',86400);
  await db.query("update public.ai_provider_state set blocked_until=clock_timestamp()-interval '1 second' where reason='invalid_key'");
  const healthy=await claim(single);assert.notEqual(healthy.key_id,invalid.key_id,'Invalid key is disabled until credentials change');await finish(healthy);
  await reset();
  const tpm=await claim([project(a,[k1],{tpm:150})]);await finish(tpm);
  assert.equal((await claim([project(a,[k1],{tpm:150})])).allowed,false,'Input token cap is enforced');
  await reset();
  const day=await claim([project(a,[k1],{rpd:1})]);await finish(day);
  const localRpd=await claim([project(a,[k1],{rpd:1})]);
  assert.equal(localRpd.allowed,false,'RPD applies before a provider call');
  assert.equal(localRpd.retry_after,86400,'Detected daily exhaustion holds the chosen 24h cooldown');
  await reset();
  const oldDay=await claim([project(a,[k1],{rpd:1})]);await finish(oldDay);
  await db.query("update public.ai_provider_attempts set reserved_at=(date_trunc('day',clock_timestamp() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')-interval '1 minute'");
  assert.equal((await claim([project(a,[k1],{rpd:1})])).allowed,true,'Local RPD counters use the Pacific calendar day');
  await reset();
  const stale=await claim(single);
  await db.query("update public.ai_provider_attempts set lease_until=clock_timestamp()-interval '1 second' where id=$1",[stale.id]);
  assert.equal((await claim(single)).allowed,true,'Expired leases recover process crashes');
  assert.equal((await claim(single,{id:stale.id})).code,'duplicate');
  await reset();
  const concurrent=await Promise.all(Array.from({length:10},()=>claim(single)));
  assert.equal(concurrent.filter(x=>x.allowed).length,2,'Concurrent claims cannot exceed the shared project/key leases');
  const grants=(await db.query(`select
    has_function_privilege('anon','public.reserve_gemini_attempt(uuid,text,jsonb,integer,integer,integer,integer,integer)','execute') as anon,
    has_function_privilege('authenticated','public.finish_gemini_attempt(uuid,text,text,integer)','execute') as authenticated,
    has_function_privilege('service_role','public.reserve_gemini_attempt(uuid,text,jsonb,integer,integer,integer,integer,integer)','execute') as service`)).rows[0];
  assert.deepEqual(grants,{anon:false,authenticated:false,service:true});
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from public.ai_provider_state');}),/permission denied/);
  console.log('Gemini project/key balancing, shared quotas, persistent cooldowns, half-open probes, leases and grants passed.');
} catch(error){console.error('Gemini pool database check failed:',error.message);process.exitCode=1;}
finally{await db.close();}
