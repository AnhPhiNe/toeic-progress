// Shared setup for the v2 baseline tests: a Supabase-like auth schema in
// PGlite, the baseline migration, and small query helpers.
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const MIGRATIONS_DIR = new URL('../../supabase/migrations/', import.meta.url);
export const BASELINE = new URL('../../supabase/migrations/20261120000000_baseline_v2.sql', import.meta.url);
export const uid = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

export async function baselineSql() {
  return readFile(BASELINE, 'utf8');
}

export async function migrationSqlList() {
  const entries = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
    .map(entry => entry.name)
    .sort();
  return Promise.all(entries.map(name => readFile(new URL(name, MIGRATIONS_DIR), 'utf8')));
}

export async function createDatabase({ apply = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
    create schema auth;
    create table auth.users(
      id uuid primary key, is_anonymous boolean not null default false, email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb, email_confirmed_at timestamptz
    );
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
    grant all on auth.users to supabase_auth_admin;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase's own defaults: API roles get everything new in public unless revoked.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  if (apply) {
    for (const sql of await migrationSqlList()) await db.exec(sql);
  }
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const value = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
  const addUser = (id, { anonymous = false, email = null, name = null } = {}) => db.query(
    'insert into auth.users(id,is_anonymous,email,raw_user_meta_data) values($1,$2,$3,$4)',
    [id, anonymous, email, JSON.stringify(name ? { full_name: name } : {})]);
  const sync = async (user, records, cursor = 0, replace = false) => value(
    'select public.sync_account_records($1::uuid,$2::jsonb,$3::bigint,$4::boolean)', [user, JSON.stringify(records), cursor, replace]);
  const asRole = (role, run, claims = null) => db.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    if (claims) await tx.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
      [claims.sub, JSON.stringify(claims)]);
    return run(tx);
  });
  return { db, one, value, addUser, sync, asRole };
}

export const record = (entity_type, id, payload, updated_at = '2026-11-20T00:00:00Z', deleted_at = null) => ({
  entity_type, record_id: id, payload: deleted_at ? { id } : { id, ...payload }, updated_at, deleted_at
});
export const profile = (payload = {}, updated_at = '2026-11-20T00:00:00Z') => ({
  entity_type: 'profile', record_id: 'profile', payload: { name: 'Alice', targetScore: 800, examDate: '', selectedSkill: 'LR',
    dailyMinGoalMinutes: 30, streakFreezes: 2, ...payload }, updated_at, deleted_at: null
});
