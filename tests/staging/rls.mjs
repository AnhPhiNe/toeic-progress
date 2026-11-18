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
  return response.json();
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
  const first = await synchronize(alice, [record]);
  assert(first.records.some(row => row.record_id === id), 'Owner did not get the record back through the API');
  // Baseline v2: browsers have no direct access at all, only the API.
  const directRpc = await alice.rpc('sync_account_records', { p_user_id: created[0], p_records: [record], p_cursor: 0, p_replace: false });
  assert(!!directRpc.error, 'Browser could call service-only sync RPC');
  for (const table of ['vocabulary_logs', 'study_sessions', 'mistakes', 'user_profiles', 'league_standings', 'user_plans', 'redeem_codes']) {
    const read = await alice.from(table).select('*').limit(1);
    assert(!!read.error || (read.data?.length ?? 0) === 0, `Browser read ${table} directly`);
  }
  const crossWrite = await bob.from('vocabulary_logs').insert({ user_id: created[0], id, study_date: '2026-09-23', word_count: 1, updated_at: stamp });
  assert(!!crossWrite.error, 'Cross-account direct write was allowed');
  const bobView = await synchronize(bob, []);
  assert(!bobView.records.some(row => row.record_id === id), 'Cross-account read leaked data');

  const tombstone = { ...record, updated_at: stamp, deleted_at: stamp, payload: { id } };
  const final = await synchronize(alice, [tombstone]);
  assert(!!final.records.find(row => row.record_id === id)?.deleted_at, 'Equal-timestamp deletion did not win');
  console.log('Staging: no direct browser access, API owner access, cross-account isolation and tombstone tie passed.');
} finally {
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('Could not remove staging test user:', id);
  }
}
