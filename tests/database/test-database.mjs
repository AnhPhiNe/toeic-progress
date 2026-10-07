import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const guest = '33333333-3333-4333-8333-333333333333';
const stamp = '2026-10-05T00:00:00Z';
const record = (id, count = 1, updated = stamp, deleted = null) => ({
  entity_type: 'vocabLog', record_id: id, payload: { id, date: '2026-10-05', count }, updated_at: updated, deleted_at: deleted
});
const profile = { entity_type: 'profile', record_id: 'profile', payload: { name: 'Alice' }, updated_at: stamp, deleted_at: null };
const sync = async (owner, records, cursor = 0, replace = false) => (await db.query(
  'select public.sync_account_records($1::uuid,$2::jsonb,$3::bigint,$4::boolean) as value', [owner, JSON.stringify(records), cursor, replace]
)).rows[0].value;

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20260923000000_sync_records.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261005000000_fastapi_backend.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values($1,false),($2,false),($3,true)', [alice, bob, guest]);

  const first = await sync(alice, [profile, record('a'), record('b')]);
  assert.equal(first.records.length, 3);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261006000000_domain_tables.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query("select count(*)::int as total from public.vocabulary_logs where user_id=$1", [alice])).rows[0].total, 2);
  assert.equal((await db.query("select relkind from pg_class where oid='public.sync_records'::regclass")).rows[0].relkind, 'v');
  assert.equal((await db.query('select count(*)::int as total from public.sync_records_legacy')).rows[0].total, 3);
  assert.equal((await sync(alice, [])).cursor, first.cursor, 'Backfill must preserve existing browser cursors');
  const quiet = await sync(alice, [], first.cursor);
  assert.equal(quiet.records.length, 0);
  assert.equal(quiet.cursor, first.cursor);
  const changed = await sync(alice, [record('a', 2, '2026-10-05T01:00:00Z')], first.cursor);
  assert.equal(changed.records.length, 1);
  assert.equal(changed.records[0].payload.count, 2);
  assert.ok(changed.cursor > first.cursor);
  const stale = await sync(alice, [record('a')], changed.cursor);
  assert.equal(stale.records[0].payload.count, 2, 'Rejected old writes must return canonical data');
  assert.equal(stale.cursor, changed.cursor);
  const tie = await sync(alice, [record('a', 2, '2026-10-05T01:00:00Z', '2026-10-05T01:00:00Z')], changed.cursor);
  assert.ok(tie.records[0].deleted_at, 'Deletion wins equal timestamps');
  assert.equal((await sync(bob, [])).records.length, 0);
  await assert.rejects(sync(guest, []), /Permanent account/);
  const replace = await sync(alice, [profile, record('a')], 0, true);
  assert.ok(replace.records.find(row => row.record_id === 'b').deleted_at, 'Replacement must retain server-only tombstones');
  await assert.rejects(sync(alice, [], 0, true), /replacement/i);

  const privileges = (await db.query(`select
    has_function_privilege('authenticated','public.sync_account_records(uuid,jsonb,bigint,boolean)','execute') as sync,
    has_function_privilege('authenticated','public.apply_sync_records(jsonb,boolean)','execute') as legacy,
    has_function_privilege('authenticated','public.reserve_ai_request(uuid,boolean,uuid,text,text,integer,integer,integer,integer)','execute') as quota
  `)).rows[0];
  assert.deepEqual(privileges, { sync: false, legacy: false, quota: false });
  const readAs = (user, anonymous) => db.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [user, JSON.stringify({ is_anonymous: anonymous })]);
    return (await tx.query('select record_id from public.sync_records')).rows;
  });
  assert.equal((await readAs(alice, false)).length, 3);
  assert.equal((await readAs(bob, false)).length, 0);
  assert.equal((await readAs(alice, true)).length, 0, 'Anonymous claims cannot read account data');

  const reserve = (id, user = guest, limit = 3) => db.query(`select public.reserve_ai_request(
    $1::uuid,$2::boolean,$3::uuid,$4,$5,$6,100,100,100) as value`, [user, user === guest, id, 'a'.repeat(64), 'b'.repeat(64), limit]).then(result => result.rows[0].value);
  const requests = Array.from({ length: 8 }, (_, index) => `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`);
  const reservations = await Promise.all(requests.map(id => reserve(id)));
  assert.equal(reservations.filter(result => result.allowed).length, 3);
  const duplicate = await reserve(requests[0]);
  assert.equal(duplicate.code, 'duplicate');
  const usage = (await db.query('select public.get_ai_usage($1,true,3) as value', [guest])).rows[0].value;
  assert.equal(usage.remaining, 0);
  await db.exec("update public.ai_usage_counters set expires_at=now()-interval '2 days' where bucket like 'minute:%'; select public.cleanup_ai_usage();");
  assert.equal((await db.query("select count(*)::int as total from public.ai_usage_counters where bucket like 'minute:%'")).rows[0].total, 0);
  // Service-role-only NULL caps support trusted backend exemptions. Request
  // deduplication, shared minute caps and the audit counters still apply.
  await db.exec('truncate public.ai_requests,public.ai_usage_counters;');
  await db.query(`insert into public.ai_usage_counters(bucket,used) values
    ('user:'||$1||':'||to_char(now() at time zone 'UTC','YYYY-MM'),10),
    ('day:'||to_char(now() at time zone 'UTC','YYYY-MM-DD'),20),
    ('ip:'||$2||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD'),5)`, [alice, 'b'.repeat(64)]);
  const unlimited = id => db.query(`select public.reserve_ai_request(
    $1::uuid,false,$2::uuid,$3,$4,null,null,2,null) as value`,
    [alice, id, 'a'.repeat(64), 'b'.repeat(64)]).then(result => result.rows[0].value);
  const privilegedId = '55555555-5555-4555-8555-555555555555';
  const privileged = await unlimited(privilegedId);
  assert.deepEqual(privileged, { allowed: true, remaining: null, limit: null });
  assert.equal((await unlimited(privilegedId)).code, 'duplicate');
  const burst = await Promise.all(requests.map(id => unlimited(id)));
  assert.equal(burst.filter(result => result.allowed).length, 1, 'Unlimited usage retains the global minute cap');
  assert.equal((await reserve('66666666-6666-4666-8666-666666666666', alice, 10)).code, 'quota');
  const fullyExempt = (await db.query(`select public.reserve_ai_request(
    $1::uuid,false,$2::uuid,$3,$4,null,null,null,null) as value`,
    [alice, '77777777-7777-4777-8777-777777777777', 'a'.repeat(64), 'b'.repeat(64)])).rows[0].value;
  assert.deepEqual(fullyExempt, { allowed: true, remaining: null, limit: null });
  console.log('Database migrations, incremental sync, tombstones, RLS, RPC grants, quota reservations and cleanup passed.');
} finally {
  await db.close();
}
