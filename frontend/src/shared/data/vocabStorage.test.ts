import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { loadVocabLog, upsertVocabLog, deleteVocabLog } from '@/shared/data/storage';
import { readDataBundle } from '@/shared/data/dataBundle';
import { parseBackup } from '@/shared/data/backup';

const values = new Map<string, string>();
const fakeStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, value); },
  removeItem(key: string) { values.delete(key); },
  clear() { values.clear(); }
};

describe('vocabulary storage operations', () => {
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', fakeStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('upserts and deletes vocab log with soft-delete metadata', () => {
    const list1 = upsertVocabLog('2026-09-24', 30);
    expect(list1).toHaveLength(1);
    expect(list1[0].count).toBe(30);
    expect(list1[0].date).toBe('2026-09-24');

    const id = list1[0].id;
    const remaining = deleteVocabLog(id);
    expect(remaining).toHaveLength(0);

    // Verify bundle retains the soft delete for sync
    const all = readDataBundle().vocabLog;
    expect(all).toHaveLength(1);
    expect(all[0].deletedAt).toBeDefined();
    expect(all[0].deletedAt).not.toBeNull();

    // loadVocabLog filters out soft-deleted records
    const active = loadVocabLog();
    expect(active).toHaveLength(0);
  });

  it('replaces a daily total and retires duplicate legacy records instead of adding twice', () => {
    upsertVocabLog('2026-09-24', 20);
    upsertVocabLog('2026-09-24', 30);
    expect(loadVocabLog()).toHaveLength(1);
    expect(loadVocabLog()[0].count).toBe(30);
    const bundle = readDataBundle();
    bundle.vocabLog.push({ id: 'legacy', date: '2026-09-24', count: 10, updatedAt: '2026-09-24T00:00:00Z', deletedAt: null });
    values.set('toeic_progress_bundle_v3', JSON.stringify(bundle));
    expect(upsertVocabLog('2026-09-24', 25)).toMatchObject([{ date: '2026-09-24', count: 25 }]);
    expect(readDataBundle().vocabLog.find(log => log.id === 'legacy')?.deletedAt).toBeTruthy();
    expect(deleteVocabLog('vocab:2026-09-24')).toHaveLength(0);
  });

  it('deletes an aggregated legacy day and rejects invalid dates/counts without writes', () => {
    upsertVocabLog('2026-09-24', 10);
    const bundle = readDataBundle();
    bundle.vocabLog = ['old-1', 'old-2'].map(id => ({ ...bundle.vocabLog[0], id }));
    values.set('toeic_progress_bundle_v3', JSON.stringify(bundle));
    expect(deleteVocabLog('vocab:2026-09-24')).toHaveLength(0);
    const before = values.get('toeic_progress_bundle_v3');
    expect(() => upsertVocabLog('2026-02-31', 10)).toThrow();
    expect(() => upsertVocabLog('2026-09-24', 1.5)).toThrow();
    expect(() => upsertVocabLog('2026-09-24', 10001)).toThrow();
    expect(values.get('toeic_progress_bundle_v3')).toBe(before);
  });

  it('preserves source/parts in quick updates and backups, and clears them only when explicitly edited', () => {
    upsertVocabLog('2026-09-24', 20, { sourceName: ' ETS 1 ', parts: [7, 5, 7] });
    expect(upsertVocabLog('2026-09-24', 25)[0]).toMatchObject({ count: 25, sourceName: 'ETS 1', parts: [5, 7] });
    const exported = JSON.stringify({ ...readDataBundle(), exportDate: new Date().toISOString() });
    const parsed = parseBackup(exported);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && 'vocabLog' in parsed.preview.data) expect(parsed.preview.data.vocabLog[0]).toMatchObject({ sourceName: 'ETS 1', parts: [5, 7] });
    expect(() => upsertVocabLog('2026-09-24', 25, { parts: [8] })).toThrow();
    expect(upsertVocabLog('2026-09-24', 25, { sourceName: '', parts: [] })[0]).toMatchObject({ parts: [] });
    expect(loadVocabLog()[0].sourceName).toBeUndefined();
  });
});
