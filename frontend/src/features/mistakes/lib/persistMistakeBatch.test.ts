import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { emptyBundle, writeDataBundle, activateAccount } from '@/shared/data/dataBundle';
import { loadMistakes } from '@/shared/data/storage';
import { commitMistakeBatch } from './persistMistakeBatch';

const values = new Map<string, string>();
let failWrite = false;
const fakeStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (failWrite) throw new DOMException('full', 'QuotaExceededError'); values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }
};
const card = (id: string): MistakeEntry => ({ id, part: 5, questionNumber: id === 'one' ? 101 : id === 'two' ? 102 : 103, sourceTestName: 'QA', userChoiceState: 'UNKNOWN', questionContext: 'The room ____ fifty guests.', userMistake: '(B) accommodating',
  correctAnswer: '(A) accommodates', answerSource: 'PROVIDED', category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-10-22T00:00:00Z' });

beforeEach(() => {
  values.clear(); failWrite = false;
  vi.stubGlobal('localStorage', fakeStorage);
  writeDataBundle({ ...emptyBundle(), mistakes: [{ ...card('existing'), updatedAt: '2026-10-22T00:00:00Z', deletedAt: null }] });
});
afterEach(() => vi.unstubAllGlobals());

describe('atomic mistake batch persistence', () => {
  it('stores all new cards in one bundle replacement while preserving existing cards', () => {
    const write = vi.spyOn(fakeStorage, 'setItem');
    const saved = commitMistakeBatch([card('one'), card('two')], null);
    expect(saved.map(value => value.id)).toEqual(['one', 'two', 'existing']);
    expect(loadMistakes().map(value => value.id)).toEqual(['one', 'two', 'existing']);
    expect(write).toHaveBeenCalledOnce();
    write.mockRestore();
  });

  it('rejects invalid second cards, duplicate IDs and existing IDs before any write', () => {
    const before = values.get('toeic_progress_bundle_v3');
    expect(() => commitMistakeBatch([card('one'), { ...card('two'), context: 'ữ'.repeat(16000) }])).toThrow(/32 KiB/);
    expect(() => commitMistakeBatch([card('one'), card('one')])).toThrow(/ID/);
    expect(() => commitMistakeBatch([card('one'), card('existing')])).toThrow(/đã được lưu/);
    expect(values.get('toeic_progress_bundle_v3')).toBe(before);
  });

  it('preserves the complete previous bundle when storage fails, allowing the same draft IDs to retry safely', () => {
    const before = values.get('toeic_progress_bundle_v3');
    failWrite = true;
    expect(() => commitMistakeBatch([card('one'), card('two')])).toThrow(/đầy/);
    expect(values.get('toeic_progress_bundle_v3')).toBe(before);
    failWrite = false;
    commitMistakeBatch([card('one'), card('two')]);
    expect(loadMistakes().map(value => value.id)).toEqual(['one', 'two', 'existing']);
  });

  it('never writes a captured owner batch under another account', () => {
    activateAccount('other-owner');
    expect(() => commitMistakeBatch([card('one')], null)).toThrow(/Tài khoản/);
    expect(values.has('toeic_progress_account_other-owner_v3')).toBe(false);
  });
});
