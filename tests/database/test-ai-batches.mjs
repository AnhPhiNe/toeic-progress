import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const batch = '99999999-9999-4999-8999-999999999999';
const id = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const hash = 'a'.repeat(64);
const ip = 'b'.repeat(64);
const reserve = async (owner, request, batchId = batch, { user = 27, day = 100, minute = 100, ipLimit = 100, max = 4 } = {}) => (await db.query(
  'select public.reserve_ai_batch_request($1::uuid,false,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,3600) as value',
  [owner, request, batchId, hash, ip, user, day, minute, ipLimit, max]
)).rows[0].value;
const used = async prefix => (await db.query("select coalesce(sum(used),0)::int as n from public.ai_usage_counters where bucket like $1", [prefix + '%'])).rows[0].n;

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  for (const name of ['20260923000000_sync_records.sql', '20261005000000_fastapi_backend.sql', '20261006000000_domain_tables.sql',
    '20261006010000_purge_deleted_content.sql', '20261006020000_api_rate_limits.sql', '20261115000000_ai_batch_reservations.sql']) {
    await db.exec(await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'));
  }
  await db.query('insert into auth.users values($1,false),($2,false)', [alice, bob]);

  const first = await reserve(alice, id(1));
  assert.deepEqual(first, { allowed: true, remaining: 26, limit: 27 });
  const second = await reserve(alice, id(2));
  assert.deepEqual(second, { allowed: true, remaining: 26, limit: 27 }, 'A later chunk of the same batch is not charged to the account');
  assert.equal(await used('user:'), 1);
  assert.equal(await used('day:'), 2, 'Every chunk still counts against the global day cap');
  assert.equal(await used('minute:'), 2, 'Every chunk still counts against the global minute cap');
  assert.equal(await used('ip:'), 2);
  assert.equal((await reserve(alice, id(2))).code, 'duplicate');
  assert.equal((await reserve(alice, id(3))).allowed, true);
  assert.equal((await reserve(alice, id(4))).allowed, true);
  assert.equal((await reserve(alice, id(5))).code, 'batch_full', 'A fifth chunk is refused');
  assert.equal(await used('day:'), 4, 'A refused chunk consumes nothing');

  // Another owner reusing the same batch id starts their own batch and pays for it.
  const other = await reserve(bob, id(6));
  assert.deepEqual(other, { allowed: true, remaining: 26, limit: 27 });
  assert.equal(await used('user:'), 2);

  // The global safety caps stop a batch too.
  await db.exec('truncate public.ai_requests,public.ai_usage_counters,public.ai_batches;');
  const small = { minute: 2 };
  assert.equal((await reserve(alice, id(10), batch, small)).allowed, true);
  assert.equal((await reserve(alice, id(11), batch, small)).allowed, true);
  assert.equal((await reserve(alice, id(12), batch, small)).code, 'quota', 'The per-minute cap counts every chunk');
  assert.equal(await used('user:'), 1);

  // An exhausted account cannot start a batch, but a started batch can finish.
  await db.exec('truncate public.ai_requests,public.ai_usage_counters,public.ai_batches;');
  assert.equal((await reserve(alice, id(20), batch, { user: 1 })).allowed, true);
  assert.equal((await reserve(alice, id(21), batch, { user: 1 })).allowed, true, 'The batch was already paid for');
  assert.equal((await reserve(alice, id(22), '88888888-8888-4888-8888-888888888888', { user: 1 })).code, 'quota');

  // An expired batch is charged again.
  await db.query("update public.ai_batches set created_at=now()-interval '2 hours'");
  assert.equal((await reserve(alice, id(30), batch, { user: 5 })).allowed, true);
  assert.equal(await used('user:'), 2);
  await db.query("update public.ai_batches set created_at=now()-interval '2 days'");
  await db.query('select public.cleanup_ai_usage()');
  assert.equal((await db.query('select count(*)::int as n from public.ai_batches')).rows[0].n, 0);

  const permissions = (await db.query(`select
    has_function_privilege('anon','public.reserve_ai_batch_request(uuid,boolean,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer)','execute') as anon,
    has_function_privilege('authenticated','public.reserve_ai_batch_request(uuid,boolean,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer)','execute') as authenticated,
    has_function_privilege('service_role','public.reserve_ai_batch_request(uuid,boolean,uuid,uuid,text,text,integer,integer,integer,integer,integer,integer)','execute') as service`)).rows[0];
  assert.deepEqual(permissions, { anon: false, authenticated: false, service: true });
  await assert.rejects(db.transaction(async tx => { await tx.exec('set local role authenticated'); await tx.query('select * from public.ai_batches'); }), /permission denied/);
  await db.query('delete from auth.users where id=$1', [alice]);
  assert.equal((await db.query('select count(*)::int as n from public.ai_batches where owner_id=$1', [alice])).rows[0].n, 0);
  console.log('AI batch reservations: one charge per capture, global caps per chunk, chunk limit, owner isolation, expiry, grants and cleanup passed.');
} catch (error) {
  console.error('AI batch database check failed:', error.message);
  process.exitCode = 1;
} finally { await db.close(); }
