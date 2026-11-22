import type { DataBundle, SyncMeta } from '@/shared/data/dataBundle';
import { StorageWriteError, defaultProfile } from '@/shared/data/dataBundle';
import { apiAvailable, backendRequest } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';
export { cloud } from '@/shared/api/supabaseClient';

type EntityType = 'profile' | 'sessions' | 'mistakes' | 'pacingRuns' | 'vocabLog' | 'shieldDays';
const COLLECTIONS: Exclude<EntityType, 'profile'>[] = ['sessions', 'mistakes', 'pacingRuns', 'vocabLog', 'shieldDays'];
export interface CloudRow { entity_type: EntityType; record_id: string; payload: Record<string, unknown>; updated_at: string; deleted_at: string | null }
/**
 * epoch names the server database generation; fullResync marks a reply after this device re-sent everything.
 * hasMore: the server pages large replies (cursor = last version sent); syncRequest follows the pages.
 * fullSnapshot: this device was behind a tombstone purge, so records holds the whole canonical set.
 * resetVersion: the account's reset barrier; it must not change while the pages are read.
 */
export interface SyncReply {
  cursor: number; records: CloudRow[]; hasRecords: boolean; resetBarrier?: boolean; sourceImageCleanupBefore?: string; epoch?: string;
  fullResync?: boolean; hasMore?: boolean; fullSnapshot?: boolean; resetVersion?: number;
}
export interface SyncState { cursor: number; acknowledged: Record<string, string>; epoch?: string }
// Re-sending every record after a server rebuild goes in requests well below the 1,000-record / 4 MiB sync limit.
const RESYNC_CHUNK_RECORDS = 500;
const RESYNC_CHUNK_BYTES = 1_000_000;
const syncKey = (id: string) => `toeic_sync_cursor_${id}_v3`;
const identity = (row: CloudRow) => `${row.entity_type}:${row.record_id}`;
const signature = (row: CloudRow) => `${new Date(row.updated_at).toISOString()}|${row.deleted_at ? new Date(row.deleted_at).toISOString() : ''}`;

export function readSyncState(userId: string): SyncState {
  try {
    const state = JSON.parse(localStorage.getItem(syncKey(userId)) || 'null');
    if (state && Number.isSafeInteger(state.cursor) && state.cursor >= 0 && typeof state.acknowledged === 'object' && state.acknowledged !== null
      && (state.epoch === undefined || typeof state.epoch === 'string')) return state;
  } catch { /* A missing cursor triggers a safe full reconciliation. */ }
  return { cursor: 0, acknowledged: {} };
}
export function rememberSync(userId: string, reply: SyncReply, reset = false): void {
  const previous = readSyncState(userId);
  const acknowledged = reset || reply.fullResync ? {} : previous.acknowledged;
  for (const row of reply.records) acknowledged[identity(row)] = signature(row);
  const epoch = reply.epoch ?? previous.epoch;
  try {
    localStorage.setItem(syncKey(userId), JSON.stringify({ cursor: reply.cursor, acknowledged, ...(epoch ? { epoch } : {}) }));
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)) {
      throw new StorageWriteError('Bộ nhớ trình duyệt đã đầy nên chưa lưu được trạng thái đồng bộ. Hãy xuất bản sao lưu rồi xóa bớt dữ liệu cũ.', 'quota');
    }
    throw error;
  }
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
    sessions: [], mistakes: [], pacingRuns: [], vocabLog: [], shieldDays: []
  };
  for (const row of rows) {
    const record = { ...row.payload, updatedAt: new Date(row.updated_at).toISOString(), deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null };
    if (row.entity_type === 'profile') bundle.profile = record as unknown as DataBundle['profile'];
    else if (COLLECTIONS.includes(row.entity_type)) (bundle as unknown as Record<EntityType, unknown[]>)[row.entity_type].push(record);
  }
  for (const key of COLLECTIONS) bundle[key].sort((a, b) => a.id.localeCompare(b.id));
  return bundle;
}
// 10,000 records at 1,000 per page plus slack; a reply that never ends is refused, not followed forever.
const MAX_SYNC_PAGES = 50;
async function syncRequest(userId: string, records: CloudRow[], cursor: number, replace = false): Promise<SyncReply> {
  const first = validateSyncReply(await backendRequest<SyncReply>('/api/v1/sync', 'POST', { records, cursor, replace }, userId));
  return first.hasMore ? followPages(userId, first) : first;
}
/** Read the remaining pages of a large reply; later pages win for the same record. */
async function followPages(userId: string, first: SyncReply): Promise<SyncReply> {
  const rows = new Map<string, CloudRow>();
  for (const row of first.records) rows.set(identity(row), row);
  let reply = first;
  for (let pages = 1; reply.hasMore; pages++) {
    if (pages >= MAX_SYNC_PAGES) throw new Error('Phản hồi đồng bộ quá dài. Vui lòng thử lại.');
    const next = validateSyncReply(await backendRequest<SyncReply>('/api/v1/sync', 'POST', { records: [], after: reply.cursor }, userId));
    if (next.hasMore && next.cursor <= reply.cursor) throw new Error('Phản hồi đồng bộ không hợp lệ.');
    if ((next.resetVersion ?? 0) !== (first.resetVersion ?? 0)) {
      throw new Error('Dữ liệu tài khoản vừa được xóa trên thiết bị khác. Vui lòng đồng bộ lại.');
    }
    for (const row of next.records) rows.set(identity(row), row);
    reply = next;
  }
  return { ...first, records: [...rows.values()], cursor: reply.cursor, hasMore: false, epoch: reply.epoch ?? first.epoch };
}
function validateSyncReply(reply: SyncReply): SyncReply {
  if (!Number.isSafeInteger(reply?.cursor) || reply.cursor < 0 || !Array.isArray(reply.records)) throw new Error('Phản hồi đồng bộ không hợp lệ.');
  return reply;
}
/** Fire-and-forget GET /health: wakes a sleeping free-tier server while the learner is still looking at the screen. */
export function wakeBackend(): void {
  if (!apiAvailable) return;
  try {
    void fetch(`${import.meta.env.VITE_API_URL!.replace(/\/$/, '')}/health`, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => undefined);
  } catch { /* best effort */ }
}

export async function fetchCloudBundle(userId: string): Promise<{ bundle: DataBundle; hasRecords: boolean }> {
  const reply = await syncRequest(userId, [], 0);
  return { bundle: bundleFromRecords(reply.records), hasRecords: reply.hasRecords };
}
function chunkRecords(rows: CloudRow[]): CloudRow[][] {
  if (!rows.length) return [];
  const chunks: CloudRow[][] = [];
  let chunk: CloudRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = JSON.stringify(row).length;
    if (chunk.length && (chunk.length >= RESYNC_CHUNK_RECORDS || bytes + size > RESYNC_CHUNK_BYTES)) {
      chunks.push(chunk);
      chunk = [];
      bytes = 0;
    }
    chunk.push(row);
    bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

export async function exchangeCloudChanges(userId: string, bundle: DataBundle, replace = false, reset = false): Promise<SyncReply> {
  // An explicitly chosen guest transfer starts from the latest server epoch.
  // Old cursors from another device must not implicitly undo a prior reset.
  const snapshot = reset ? await syncRequest(userId, [], 0) : null;
  const state = snapshot ? { cursor: snapshot.cursor, acknowledged: {}, epoch: snapshot.epoch } : readSyncState(userId);
  const pending = pendingRecords(bundle, state);
  const chunks = chunkRecords(pending);
  let reply: SyncReply;
  if (chunks.length <= 1) {
    reply = await syncRequest(userId, pending, state.cursor, replace);
  } else if (replace) {
    const first = await syncRequest(userId, chunks[0], state.cursor, true);
    if (first.resetBarrier) return first;
    const profileRow = first.records.find(row => row.entity_type === 'profile' && row.record_id === 'profile');
    const floorMs = Math.max(Date.now(), profileRow ? Date.parse(profileRow.updated_at) + 1000 : 0);
    for (const chunk of chunks.slice(1)) {
      const bumped = chunk.map(row => {
        const updatedMs = Math.max(Date.parse(row.updated_at) || 0, floorMs);
        const updated_at = new Date(updatedMs).toISOString();
        const deleted_at = row.deleted_at ? new Date(Math.max(Date.parse(row.deleted_at) || 0, floorMs)).toISOString() : null;
        return { ...row, updated_at, deleted_at };
      });
      const partial = await syncRequest(userId, bumped, state.cursor, false);
      if (partial.resetBarrier) return partial;
    }
    reply = await syncRequest(userId, [], 0);
  } else {
    let last: SyncReply | null = null;
    for (const chunk of chunks) {
      last = await syncRequest(userId, chunk, state.cursor, false);
      if (last.resetBarrier) return last;
    }
    reply = reset ? await syncRequest(userId, [], 0) : last!;
  }
  // Nothing acknowledged yet means this request already carried every record.
  const sentEverything = Object.keys(state.acknowledged).length === 0;
  if (replace || reset || sentEverything || !reply.epoch || reply.epoch === state.epoch || reply.resetBarrier) return reply;
  return resendEverything(userId, bundle, state.cursor);
}

/**
 * The server database is a different generation from the one this device last
 * synced with (it was rebuilt or restored). Records the server lost would never
 * be re-sent, because this device already counts them as acknowledged, so send
 * every local record once. The old cursor keeps reset barriers working; the
 * server keeps whichever copy of each record is newer.
 */
async function resendEverything(userId: string, bundle: DataBundle, cursor: number): Promise<SyncReply> {
  for (const chunk of chunkRecords(recordsFromBundle(bundle))) {
    const partial = await syncRequest(userId, chunk, cursor);
    if (partial.resetBarrier) return partial;
  }
  // Everything is on the server now: take the full canonical snapshot.
  return { ...await syncRequest(userId, [], 0), fullResync: true };
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
