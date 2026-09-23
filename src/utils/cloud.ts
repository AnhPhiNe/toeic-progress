import { createClient } from '@supabase/supabase-js';
import type { DataBundle, SyncMeta } from './dataBundle';
import { defaultProfile } from './dataBundle';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const cloud = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

type EntityType = 'profile' | 'sessions' | 'mistakes' | 'pacingRuns' | 'checklist' | 'vocabLog' | 'shieldDays';
const COLLECTIONS: Exclude<EntityType, 'profile'>[] = ['sessions', 'mistakes', 'pacingRuns', 'checklist', 'vocabLog', 'shieldDays'];

interface CloudRow {
  entity_type: EntityType;
  record_id: string;
  payload: Record<string, unknown>;
  updated_at: string;
  deleted_at: string | null;
}

function withServerMeta(row: CloudRow): Record<string, unknown> & SyncMeta {
  return {
    ...row.payload,
    updatedAt: new Date(row.updated_at).toISOString(),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null
  };
}

export function recordsFromBundle(bundle: DataBundle) {
  const rows: CloudRow[] = [];
  const add = (entity_type: EntityType, record_id: string, record: Record<string, unknown> & SyncMeta) => {
    rows.push({ entity_type, record_id, payload: record, updated_at: record.updatedAt, deleted_at: record.deletedAt });
  };
  add('profile', 'profile', bundle.profile as unknown as Record<string, unknown> & SyncMeta);
  for (const key of COLLECTIONS) {
    for (const record of bundle[key]) add(key, record.id, record as unknown as Record<string, unknown> & SyncMeta);
  }
  return rows;
}

export function bundleFromRecords(rows: CloudRow[]): DataBundle {
  const epoch = '1970-01-01T00:00:00.000Z';
  const bundle: DataBundle = {
    schemaVersion: 2,
    profile: { ...defaultProfile(), updatedAt: epoch, deletedAt: null },
    sessions: [], mistakes: [], pacingRuns: [], checklist: [], vocabLog: [], shieldDays: []
  };
  for (const row of rows) {
    const record = withServerMeta(row);
    if (row.entity_type === 'profile') {
      bundle.profile = record as unknown as DataBundle['profile'];
    } else if (COLLECTIONS.includes(row.entity_type as Exclude<EntityType, 'profile'>)) {
      (bundle as unknown as Record<EntityType, unknown[]>)[row.entity_type].push(record);
    }
  }
  for (const key of COLLECTIONS) bundle[key].sort((a, b) => a.id.localeCompare(b.id));
  return bundle;
}

export async function fetchCloudBundle(userId: string): Promise<{ bundle: DataBundle; hasRecords: boolean }> {
  if (!cloud) throw new Error('Chưa cấu hình Supabase.');
  const rows: CloudRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await cloud.from('sync_records')
      .select('entity_type,record_id,payload,updated_at,deleted_at')
      .eq('user_id', userId).order('entity_type').order('record_id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data as CloudRow[]));
    if (!data || data.length < 1000) break;
  }
  return { bundle: bundleFromRecords(rows), hasRecords: rows.length > 0 };
}

export async function applyCloudBundle(bundle: DataBundle, replace = false): Promise<void> {
  if (!cloud) throw new Error('Chưa cấu hình Supabase.');
  const { error } = await cloud.rpc('apply_sync_records', { p_records: recordsFromBundle(bundle), p_replace: replace });
  if (error) throw error;
}

export async function deleteCloudAccount(): Promise<void> {
  if (!cloud) throw new Error('Chưa cấu hình Supabase.');
  const { error } = await cloud.functions.invoke('delete-account');
  if (error) throw error;
  await cloud.auth.signOut();
}
