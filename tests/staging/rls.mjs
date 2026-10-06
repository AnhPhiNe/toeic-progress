import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const { SUPABASE_TEST_PROJECT, SUPABASE_STAGING_URL, SUPABASE_STAGING_PUBLISHABLE_KEY, SUPABASE_STAGING_SERVICE_ROLE_KEY, SUPABASE_STAGING_API_URL } = process.env;
if (SUPABASE_TEST_PROJECT !== 'staging' || !SUPABASE_STAGING_URL || !SUPABASE_STAGING_PUBLISHABLE_KEY || !SUPABASE_STAGING_SERVICE_ROLE_KEY || !SUPABASE_STAGING_API_URL) {
  console.error('RLS test requires staging-only environment variables and SUPABASE_TEST_PROJECT=staging.');
  process.exit(2);
}

const admin = createClient(SUPABASE_STAGING_URL, SUPABASE_STAGING_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const makeClient = () => createClient(SUPABASE_STAGING_URL, SUPABASE_STAGING_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const created = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const synchronize = async (client, records) => {
  const { data } = await client.auth.getSession();
  const response = await fetch(`${SUPABASE_STAGING_API_URL.replace(/\/$/, '')}/api/v1/sync`, {
    method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, cursor: 0, replace: false })
  });
  assert(response.ok, `Staging API sync failed (${response.status})`);
};

try {
  const clients = [];
  for (let index = 0; index < 2; index++) {
    const email = `rls-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}!Ab9`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error || new Error('Cannot create staging test user');
    created.push(data.user.id);
    const client = makeClient();
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    clients.push(client);
  }

  const [alice, bob] = clients;
  const id = `rls-test-${randomUUID()}`;
  const stamp = new Date().toISOString();
  const record = { entity_type: 'vocabLog', record_id: id, payload: { id, date: '2026-09-23', count: 1, updatedAt: stamp, deletedAt: null }, updated_at: stamp, deleted_at: null };
  await synchronize(alice, [record]);
  const directRpc = await alice.rpc('sync_account_records', { p_owner_id: created[0], p_records: [record], p_cursor: 0, p_replace: false });
  assert(!!directRpc.error, 'Browser could call service-only sync RPC');
  const own = await alice.from('sync_records').select('record_id').eq('record_id', id);
  assert(!own.error && own.data?.length === 1, 'Owner cannot read own record');
  const crossRead = await bob.from('sync_records').select('record_id').eq('user_id', created[0]);
  assert(!crossRead.error && crossRead.data?.length === 0, 'Cross-account read leaked data');
  const crossWrite = await bob.from('sync_records').insert({ user_id: created[0], ...record });
  assert(!!crossWrite.error, 'Cross-account direct write was allowed');

  const tombstone = { ...record, updated_at: stamp, deleted_at: stamp, payload: { ...record.payload, deletedAt: stamp } };
  await synchronize(alice, [tombstone]);
  const final = await alice.from('sync_records').select('deleted_at').eq('record_id', id).single();
  assert(!final.error && !!final.data?.deleted_at, 'Equal-timestamp deletion did not win');
  console.log('Staging RLS, owner access, cross-account isolation and tombstone tie passed.');
} finally {
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('Could not remove staging test user:', id);
  }
}
