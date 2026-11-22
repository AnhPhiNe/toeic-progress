// Pending account deletions: recorded before the ban, listed for maintenance
// once older than the grace period, attempts counted, gone with the Auth user.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDatabase, uid } from './harness.mjs';

const h = await createDatabase();
const { db, one, value } = h;
const alice = uid(1), bob = uid(2), carol = uid(3);
const list = (seconds = 600, limit = 50) => value('select public.list_pending_account_deletions($1,$2)', [seconds, limit]);

try {
  for (const [id, n] of [[alice, 1], [bob, 2], [carol, 3]]) await h.addUser(id, { email: `user${n}@example.test` });

  // Recording is idempotent and refreshes requested_at (no race with a live retry).
  assert.deepEqual(await value('select public.mark_account_deletion_pending($1::uuid)', [alice]), { pending: true });
  await db.query("update private.pending_account_deletions set requested_at=now()-interval '1 hour', attempts=2 where user_id=$1", [alice]);
  await value('select public.mark_account_deletion_pending($1::uuid)', [alice]);
  assert.equal(await value('select count(*)::int from private.pending_account_deletions'), 1);
  assert.equal(await value("select requested_at > now()-interval '1 minute' from private.pending_account_deletions where user_id=$1", [alice]), true);
  assert.equal(await value('select attempts from private.pending_account_deletions where user_id=$1', [alice]), 2, 'Attempts survive a re-request');

  // Only rows past the grace period are listed, oldest first, bounded.
  await value('select public.mark_account_deletion_pending($1::uuid)', [bob]);
  await value('select public.mark_account_deletion_pending($1::uuid)', [carol]);
  await db.query("update private.pending_account_deletions set requested_at=now()-interval '20 minutes' where user_id=$1", [bob]);
  await db.query("update private.pending_account_deletions set requested_at=now()-interval '2 days' where user_id=$1", [carol]);
  assert.deepEqual((await list()).map(r => r.userId), [carol, bob]);
  assert.deepEqual((await list(600, 1)).map(r => r.userId), [carol]);
  assert.deepEqual((await list(0)).map(r => r.userId), [carol, bob, alice]);
  assert.equal((await list())[0].attempts, 0);
  for (const [seconds, limit] of [[-1, 10], [600, 0], [600, 501], [null, 10]]) {
    await assert.rejects(list(seconds, limit), /Invalid pending deletion request/);
  }

  // Attempts are counted with a short error note.
  assert.deepEqual(await value('select public.note_account_deletion_attempt($1::uuid,$2)', [bob, 'delete:500 ' + 'x'.repeat(400)]), { found: true, attempts: 1 });
  const noted = await one('select attempts, char_length(last_error) as len from private.pending_account_deletions where user_id=$1', [bob]);
  assert.deepEqual(noted, { attempts: 1, len: 200 });
  assert.deepEqual(await value('select public.note_account_deletion_attempt($1::uuid,null)', [uid(9)]), { found: false, attempts: null });

  // Cleared after a lifted ban; gone with the Auth user (cascade).
  assert.deepEqual(await value('select public.clear_account_deletion_pending($1::uuid)', [alice]), { cleared: true });
  assert.deepEqual(await value('select public.clear_account_deletion_pending($1::uuid)', [alice]), { cleared: false });
  await db.query('delete from auth.users where id=$1', [carol]);
  assert.deepEqual((await list(0)).map(r => r.userId), [bob]);
  await assert.rejects(value('select public.mark_account_deletion_pending($1::uuid)', [uid(9)]), /foreign key/);
  await assert.rejects(value('select public.mark_account_deletion_pending(null)'), /Invalid account deletion request/);

  // Private table, service-role-only RPCs.
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await value(`select has_table_privilege('${role}','private.pending_account_deletions','select')
      or has_table_privilege('${role}','private.pending_account_deletions','insert')
      or has_table_privilege('${role}','private.pending_account_deletions','delete')`), false, role);
  }
  for (const fn of ['mark_account_deletion_pending(uuid)', 'clear_account_deletion_pending(uuid)',
    'list_pending_account_deletions(integer,integer)', 'note_account_deletion_attempt(uuid,text)']) {
    const grants = await one(`select has_function_privilege('anon','public.${fn}','execute') as anon,
      has_function_privilege('authenticated','public.${fn}','execute') as auth,
      has_function_privilege('service_role','public.${fn}','execute') as service,
      (select prosecdef from pg_proc where oid='public.${fn}'::regprocedure) as definer`);
    assert.deepEqual(grants, { anon: false, auth: false, service: true, definer: true }, fn);
  }
  await assert.rejects(h.asRole('authenticated', tx => tx.query('select public.list_pending_account_deletions()'),
    { sub: bob, is_anonymous: false, role: 'authenticated' }), /permission denied/);
  assert.equal((await h.asRole('service_role', tx => tx.query('select public.list_pending_account_deletions(0,10) as r'))).rows[0].r.length, 1);
  assert.deepEqual(await value('select public.schema_ready()'), { baseline: 2, ready: true });

  // Re-applying the migration keeps the pending row and the grants.
  await db.exec(await readFile(new URL('../../supabase/migrations/20261124000000_pending_deletions.sql', import.meta.url), 'utf8'));
  assert.deepEqual((await list(0)).map(r => r.userId), [bob]);
  assert.equal(await value("select has_function_privilege('service_role','public.note_account_deletion_attempt(uuid,text)','execute')"), true);
  assert.deepEqual(await value('select public.schema_ready()'), { baseline: 2, ready: true });
  console.log('Pending deletions: record, grace-period listing, attempts, cascade and service-role-only grants passed.');
} finally {
  await db.close();
}
