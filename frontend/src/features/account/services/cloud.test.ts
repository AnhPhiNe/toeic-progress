import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBundle } from '@/shared/data/dataBundle';
import { pendingRecords, readSyncState, recordsFromBundle, rememberSync } from '@/features/account/services/cloud';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
describe('incremental sync', () => {
  it('only uploads changed records, including tombstones', () => {
    const bundle = emptyBundle();
    rememberSync('alice', { cursor: 7, records: recordsFromBundle(bundle), hasRecords: true });
    expect(pendingRecords(bundle, readSyncState('alice'))).toHaveLength(0);
    bundle.profile = { ...bundle.profile, updatedAt: '2026-10-06T00:00:00.000Z' };
    expect(pendingRecords(bundle, readSyncState('alice'))).toHaveLength(1);
    bundle.vocabLog = [{ id: 'v1', date: '2026-10-05', count: 3, updatedAt: '2026-10-06T00:00:00.000Z', deletedAt: '2026-10-06T00:00:00.000Z' }];
    expect(pendingRecords(bundle, readSyncState('alice'))).toHaveLength(2);
    expect(pendingRecords(bundle, readSyncState('bob')).length).toBe(2);
  });
  it('normalizes server timestamp formatting before acknowledging a record', () => {
    const bundle = emptyBundle();
    const records = recordsFromBundle(bundle).map(row => ({ ...row, updated_at: row.updated_at.replace('Z', '+00:00') }));
    rememberSync('alice', { cursor: 8, records, hasRecords: true });
    expect(pendingRecords(bundle, readSyncState('alice'))).toHaveLength(0);
  });
  it('falls back to cursor zero after local cursor corruption', () => {
    values.set('toeic_sync_cursor_alice_v3', '{bad');
    expect(readSyncState('alice').cursor).toBe(0);
  });
});
