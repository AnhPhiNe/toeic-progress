import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { loadVocabLog, upsertVocabLog, deleteVocabLog } from '@/shared/data/storage';
import { readDataBundle } from '@/shared/data/dataBundle';

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
});
