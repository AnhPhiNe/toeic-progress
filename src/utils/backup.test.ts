import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBackup } from './backup';
import { defaultProfile, readDataBundle, writeDataBundle, type DataBundle } from './dataBundle';
import { restoreBackup } from './storage';

const values = new Map<string, string>();
let failWrite = false;
const fakeStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) {
    if (failWrite) throw new Error('quota exceeded');
    values.set(key, value);
  },
  removeItem(key: string) { values.delete(key); }
};

function bundle(): DataBundle {
  const now = '2026-09-23T00:00:00.000Z';
  return {
    schemaVersion: 2,
    profile: { ...defaultProfile(), updatedAt: now, deletedAt: null },
    sessions: [], mistakes: [],
    pacingRuns: [{
      id: 'p1', presetId: 'FULL_TEST', presetName: 'Full Test', date: '2026-09-23',
      plannedMinutes: 120, actualMinutes: 120, finishedNaturally: true, phases: [],
      createdAt: now, updatedAt: now, deletedAt: null
    }],
    checklist: [{ id: 'id_original', checked: true, updatedAt: now, deletedAt: null }],
    vocabLog: [], shieldDays: []
  };
}

beforeEach(() => {
  values.clear();
  failWrite = false;
  vi.stubGlobal('localStorage', fakeStorage);
});
afterEach(() => vi.unstubAllGlobals());

describe('backup restore', () => {
  it('preserves categories absent from a v1 backup', () => {
    writeDataBundle(bundle());
    const result = parseBackup(JSON.stringify({ profile: defaultProfile(), sessions: [], mistakes: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.preserved).toContain('Lượt Phòng Thi');
    restoreBackup(result.preview);
    expect(readDataBundle().pacingRuns).toHaveLength(1);
    expect(readDataBundle().checklist).toHaveLength(1);
  });

  it('rejects the whole file and identifies invalid record positions', () => {
    const input = { profile: defaultProfile(), sessions: [], mistakes: [{ id: 'm1', part: 9 }] };
    const result = parseBackup(JSON.stringify(input));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeLessThanOrEqual(10);
    expect(result.errors.some(error => error.includes('mistakes.0.part'))).toBe(true);
    expect(values.size).toBe(0);
  });

  it('rejects a backup from a newer app version', () => {
    const result = parseBackup(JSON.stringify({ schemaVersion: 3 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain('cập nhật ứng dụng');
  });

  it('only normalizes an unknown mistake category and absent optional fields', () => {
    const input = {
      profile: defaultProfile(), sessions: [],
      mistakes: [{
        id: 'm1', part: 5, questionContext: 'Câu 101', userMistake: 'A',
        correctAnswer: 'B', category: 'NEW_CATEGORY', status: 'NEEDS_REVIEW',
        createdAt: '2026-09-23T00:00:00.000Z'
      }]
    };
    const result = parseBackup(JSON.stringify(input));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.data.mistakes[0].category).toBe('OTHER');
    expect(result.preview.corrections.some(item => item.includes('nhóm lỗi không rõ'))).toBe(true);
    expect(result.preview.corrections.some(item => item.includes('.tags'))).toBe(true);
  });

  it('keeps the previous bundle if the single commit write fails', () => {
    const original = bundle();
    writeDataBundle(original);
    failWrite = true;
    expect(() => writeDataBundle({ ...original, sessions: [] })).toThrow();
    failWrite = false;
    expect(readDataBundle()).toEqual(original);
  });
});
