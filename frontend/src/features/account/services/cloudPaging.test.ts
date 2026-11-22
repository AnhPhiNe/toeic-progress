import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBundle } from '@/shared/data/dataBundle';
import type { DataBundle } from '@/shared/data/dataBundle';

const requests: Array<Record<string, unknown>> = [];
let replies: Array<Record<string, unknown>> = [];
vi.mock('@/shared/api/api', () => ({
  backendRequest: vi.fn(async (_path: string, _method: string, body: Record<string, unknown>) => {
    requests.push(body);
    return replies.shift();
  })
}));
vi.mock('@/shared/api/supabaseClient', () => ({ cloud: null }));
const { exchangeCloudChanges, fetchCloudBundle, readSyncState, recordsFromBundle, rememberSync } = await import('@/features/account/services/cloud');
const { synchronizeAccount, withoutServerDeleted } = await import('@/features/account/services/cloudSync');
const { readAccountBundle, writeAccountBundle } = await import('@/shared/data/dataBundle');

const values = new Map<string, string>();
const stamp = '2026-11-10T00:00:00.000Z';
const vocab = (id: string, count = 1) => ({ entity_type: 'vocabLog', record_id: id, payload: { id, date: '2026-11-09', count }, updated_at: stamp, deleted_at: null });
const profileRow = { entity_type: 'profile', record_id: 'profile', payload: { ...emptyBundle().profile }, updated_at: stamp, deleted_at: null };
beforeEach(() => {
  values.clear();
  requests.length = 0;
  replies = [];
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key), get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null
  });
});

describe('paged sync replies', () => {
  it('follows hasMore pages with after=cursor and merges every record once', async () => {
    replies = [
      { cursor: 3, records: [profileRow, vocab('v1'), vocab('v2')], hasRecords: true, hasMore: true, resetVersion: 0, epoch: 'e' },
      { cursor: 6, records: [vocab('v2', 9), vocab('v3'), vocab('v4')], hasRecords: true, hasMore: true, resetVersion: 0, epoch: 'e' },
      { cursor: 8, records: [vocab('v5')], hasRecords: true, hasMore: false, resetVersion: 0, epoch: 'e' }
    ];
    const { bundle } = await fetchCloudBundle('alice');
    expect(requests).toEqual([{ records: [], cursor: 0, replace: false }, { records: [], after: 3 }, { records: [], after: 6 }]);
    expect(bundle.vocabLog.map(item => item.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
    expect(bundle.vocabLog.find(item => item.id === 'v2')?.count).toBe(9);
  });

  it('remembers the last page cursor, so the next sync is a delta', async () => {
    const local = emptyBundle();
    rememberSync('alice', { cursor: 1, records: recordsFromBundle(local), hasRecords: true, epoch: 'e' });
    replies = [
      { cursor: 2, records: [vocab('v1')], hasRecords: true, hasMore: true, epoch: 'e' },
      { cursor: 5, records: [vocab('v2')], hasRecords: true, hasMore: false, epoch: 'e' }
    ];
    const reply = await exchangeCloudChanges('alice', local);
    expect(reply.cursor).toBe(5);
    expect(reply.records).toHaveLength(2);
    rememberSync('alice', reply);
    expect(readSyncState('alice').cursor).toBe(5);
  });

  it('refuses pages that do not advance or that cross a reset', async () => {
    replies = [
      { cursor: 3, records: [vocab('v1')], hasRecords: true, hasMore: true, resetVersion: 0 },
      { cursor: 3, records: [vocab('v2')], hasRecords: true, hasMore: true, resetVersion: 0 }
    ];
    await expect(fetchCloudBundle('alice')).rejects.toThrow('không hợp lệ');
    replies = [
      { cursor: 3, records: [vocab('v1')], hasRecords: true, hasMore: true, resetVersion: 0 },
      { cursor: 9, records: [profileRow], hasRecords: true, hasMore: false, resetVersion: 9 }
    ];
    await expect(fetchCloudBundle('alice')).rejects.toThrow('thiết bị khác');
  });

  it('a full snapshot drops synced records the server no longer has, but keeps new local ones', async () => {
    const previous: DataBundle = emptyBundle();
    previous.vocabLog = [
      { id: 'gone', date: '2026-11-09', count: 1, updatedAt: stamp, deletedAt: null },
      { id: 'kept', date: '2026-11-09', count: 1, updatedAt: stamp, deletedAt: null }
    ];
    writeAccountBundle('alice', previous);
    rememberSync('alice', { cursor: 4, records: recordsFromBundle(previous), hasRecords: true, epoch: 'e' });
    replies = [{ cursor: 50, records: [profileRow, vocab('kept')], hasRecords: true, hasMore: false, fullSnapshot: true, epoch: 'e' }];
    await synchronizeAccount('alice');
    expect(readAccountBundle('alice')?.vocabLog.map(item => item.id)).toEqual(['kept']);

    const latest = { ...previous, vocabLog: [...previous.vocabLog, { id: 'new', date: '2026-11-09', count: 2, updatedAt: stamp, deletedAt: null }] };
    const canonical = { ...emptyBundle(), vocabLog: [previous.vocabLog[1]] };
    expect(withoutServerDeleted(latest, previous, canonical).vocabLog.map(item => item.id)).toEqual(['kept', 'new']);
  });
});
