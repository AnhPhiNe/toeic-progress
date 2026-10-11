import type { DataBundle, SyncMeta } from '@/shared/data/dataBundle';
import { defaultProfile } from '@/shared/data/dataBundle';
import { backendRequest } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';
export { cloud } from '@/shared/api/supabaseClient';

type EntityType = 'profile' | 'sessions' | 'mistakes' | 'pacingRuns' | 'checklist' | 'vocabLog' | 'shieldDays' | 'weeklyPlans';
const COLLECTIONS: Exclude<EntityType, 'profile'>[] = ['sessions', 'mistakes', 'pacingRuns', 'checklist', 'vocabLog', 'shieldDays', 'weeklyPlans'];
export interface CloudRow { entity_type: EntityType; record_id: string; payload: Record<string, unknown>; updated_at: string; deleted_at: string | null }
export interface SyncReply { cursor: number; records: CloudRow[]; hasRecords: boolean; resetBarrier?: boolean; sourceImageCleanupBefore?: string }
export interface SyncState { cursor: number; acknowledged: Record<string, string> }
const syncKey = (id: string) => `toeic_sync_cursor_${id}_v3`;
const identity = (row: CloudRow) => `${row.entity_type}:${row.record_id}`;
const signature = (row: CloudRow) => `${new Date(row.updated_at).toISOString()}|${row.deleted_at ? new Date(row.deleted_at).toISOString() : ''}`;

export function readSyncState(userId: string): SyncState {
  try {
    const state = JSON.parse(localStorage.getItem(syncKey(userId)) || 'null');
    if (state && Number.isSafeInteger(state.cursor) && state.cursor >= 0 && typeof state.acknowledged === 'object' && state.acknowledged !== null) return state;
  } catch { /* A missing cursor triggers a safe full reconciliation. */ }
  return { cursor: 0, acknowledged: {} };
}
export function rememberSync(userId: string, reply: SyncReply, reset = false): void {
  const acknowledged = reset ? {} : readSyncState(userId).acknowledged;
  for (const row of reply.records) acknowledged[identity(row)] = signature(row);
  localStorage.setItem(syncKey(userId), JSON.stringify({ cursor: reply.cursor, acknowledged }));
}
export function recordsFromBundle(bundle: DataBundle): CloudRow[] {
  const rows: CloudRow[] = [];
  const add = (entity_type: EntityType, record_id: string, record: Record<string, unknown> & SyncMeta) => {
    rows.push({ entity_type, record_id, payload: record, updated_at: record.updatedAt, deleted_at: record.deletedAt });
  };
  add('profile', 'profile', bundle.profile as unknown as Record<string, unknown> & SyncMeta);
  for (const key of COLLECTIONS) for (const record of bundle[key]) add(key, record.id, record as unknown as Record<string, unknown> & SyncMeta);
  return rows;
}
export function pendingRecords(bundle: DataBundle, state: SyncState): CloudRow[] {
  return recordsFromBundle(bundle).filter(row => state.acknowledged[identity(row)] !== signature(row));
}
export function bundleFromRecords(rows: CloudRow[]): DataBundle {
  const epoch = '1970-01-01T00:00:00.000Z';
  const bundle: DataBundle = {
    schemaVersion: 3, profile: { ...defaultProfile(), updatedAt: epoch, deletedAt: null },
    sessions: [], mistakes: [], pacingRuns: [], checklist: [], vocabLog: [], shieldDays: [], weeklyPlans: []
  };
  for (const row of rows) {
    const record = { ...row.payload, updatedAt: new Date(row.updated_at).toISOString(), deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null };
    if (row.entity_type === 'profile') bundle.profile = record as unknown as DataBundle['profile'];
    else if (COLLECTIONS.includes(row.entity_type)) (bundle as unknown as Record<EntityType, unknown[]>)[row.entity_type].push(record);
  }
  for (const key of COLLECTIONS) bundle[key].sort((a, b) => a.id.localeCompare(b.id));
  return bundle;
}
async function syncRequest(userId: string, records: CloudRow[], cursor: number, replace = false): Promise<SyncReply> {
  const reply = await backendRequest<SyncReply>('/api/v1/sync', 'POST', { records, cursor, replace }, userId);
  return validateSyncReply(reply);
}
function validateSyncReply(reply: SyncReply): SyncReply {
  if (!Number.isSafeInteger(reply?.cursor) || reply.cursor < 0 || !Array.isArray(reply.records)) throw new Error('Phản hồi đồng bộ không hợp lệ.');
  return reply;
}
export async function fetchCloudBundle(userId: string): Promise<{ bundle: DataBundle; hasRecords: boolean }> {
  const reply = await syncRequest(userId, [], 0);
  return { bundle: bundleFromRecords(reply.records), hasRecords: reply.hasRecords };
}
export async function exchangeCloudChanges(userId: string, bundle: DataBundle, replace = false, reset = false): Promise<SyncReply> {
  // An explicitly chosen guest transfer starts from the latest server epoch.
  // Old cursors from another device must not implicitly undo a prior reset.
  const snapshot = reset ? await syncRequest(userId, [], 0) : null;
  const state = snapshot ? { cursor: snapshot.cursor, acknowledged: {} } : readSyncState(userId);
  return syncRequest(userId, pendingRecords(bundle, state), state.cursor, replace);
}
export async function deleteCloudAccount(): Promise<void> {
  await backendRequest('/api/v1/account', 'DELETE');
  await cloud?.auth.signOut();
}

export async function resetCloudLearningData(userId: string): Promise<SyncReply> {
  const reply = validateSyncReply(await backendRequest<SyncReply>('/api/v1/data/reset', 'POST', { confirm: true }, userId));
  if (!reply.resetBarrier || !reply.records.some(row => row.entity_type==='profile' && row.record_id==='profile' && !row.deleted_at)) {
    throw new Error('Máy chủ chưa xác nhận dữ liệu sau khi xóa. Vui lòng thử đồng bộ lại.');
  }
  return reply;
}

export async function cleanupResetImages(userId: string, before: string): Promise<void> {
  await backendRequest('/api/v1/mistake-images/cleanup', 'POST', { before }, userId);
}
