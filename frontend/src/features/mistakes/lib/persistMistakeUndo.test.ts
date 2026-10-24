import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { activateAccount, emptyBundle, readDataBundle, writeDataBundle } from '@/shared/data/dataBundle';
import { loadMistakes, updateMistakes } from '@/shared/data/storage';
import { gradeLatestMistake } from './mistakeUpdates';
import { undoMistakeDeletion, undoMistakeGrade } from './persistMistakeUndo';

const values = new Map<string, string>();
const before: MistakeEntry = { id: 'card', part: 5, questionContext: 'Reports should ____ submitted.',
  options: ['(A) are', '(B) be'], correctAnswer: '(B) be', userMistake: '(A) are', category: 'OTHER',
  tags: [], status: 'NEEDS_REVIEW', reviewStage: 2, reviewCount: 2, nextReviewDate: '2020-01-01', createdAt: '2026-10-23T05:00:00Z' };
let failWrite = false;
beforeEach(() => {
  values.clear(); failWrite = false;
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (failWrite) throw new DOMException('full', 'QuotaExceededError'); values.set(key, value); },
    removeItem: (key: string) => values.delete(key) });
  writeDataBundle({ ...emptyBundle(), mistakes: [{ ...before, updatedAt: before.createdAt, deletedAt: null }] });
});
afterEach(() => { vi.unstubAllGlobals(); });
describe('safe durable mistake Undo', () => {
  it('restores every prior schedule field and keeps newer annotations', () => {
    const original = loadMistakes()[0];
    const after = updateMistakes(current => [gradeLatestMistake(current[0], original, 'EASY')])[0];
    updateMistakes(current => current.map(card => ({ ...card, userReason: 'Added after grading' })));
    const restored = undoMistakeGrade(original, after, null)[0];
    expect(restored).toMatchObject({ reviewStage: 2, reviewCount: 2, nextReviewDate: '2020-01-01', status: 'NEEDS_REVIEW', userReason: 'Added after grading' });
    expect(restored.lastReviewedAt).toBeUndefined();
    expect(loadMistakes()[0]).toEqual(restored);
  });
  it('rejects another grade or changed question without losing stored work', () => {
    const original = loadMistakes()[0];
    const after = updateMistakes(current => [gradeLatestMistake(current[0], original, 'GOOD')])[0];
    updateMistakes(current => current.map(card => ({ ...card, reviewCount: 99 })));
    expect(() => undoMistakeGrade(original, after, null)).toThrow(/thay đổi/);
    expect(loadMistakes()[0].reviewCount).toBe(99);
    updateMistakes(current => current.map(card => ({ ...card, ...after, questionContext: 'Changed question' })));
    expect(() => undoMistakeGrade(original, after, null)).toThrow(/thay đổi/);
  });
  it('restores a compacted deletion once with source images and unrelated cards intact', () => {
    const original = { ...loadMistakes()[0], sourceImageIds: ['private-image-hash'] };
    updateMistakes(() => [original, { ...original, id: 'unrelated' }]);
    updateMistakes(current => current.filter(card => card.id !== original.id));
    const version = readDataBundle().mistakes.find(card => card.id === original.id)!.updatedAt;
    const restored = undoMistakeDeletion(original, version, null);
    expect(restored).toHaveLength(2);
    expect(loadMistakes().find(card => card.id === original.id)?.sourceImageIds).toEqual(['private-image-hash']);
    expect(() => undoMistakeDeletion(original, version, null)).toThrow(/khôi phục/);
  });
  it('rejects a newer tombstone, missing tombstone, and account switch', () => {
    updateMistakes(() => []);
    const version = readDataBundle().mistakes[0].updatedAt;
    writeDataBundle({ ...readDataBundle(), mistakes: [{ ...readDataBundle().mistakes[0], updatedAt: '2099-01-01T00:00:00Z' }] });
    expect(() => undoMistakeDeletion(before, version, null)).toThrow(/thay đổi/);
    writeDataBundle({ ...readDataBundle(), mistakes: [] });
    expect(() => undoMistakeDeletion(before, version, null)).toThrow(/thay đổi/);
    activateAccount('other');
    expect(() => undoMistakeDeletion(before, version, null)).toThrow(/Tài khoản/);
  });
  it('does not consume restoration on a failed local commit', () => {
    updateMistakes(() => []);
    const version = readDataBundle().mistakes[0].updatedAt;
    failWrite = true;
    expect(() => undoMistakeDeletion(before, version, null)).toThrow(/đầy/);
    failWrite = false;
    expect(undoMistakeDeletion(before, version, null)).toHaveLength(1);
  });
});
