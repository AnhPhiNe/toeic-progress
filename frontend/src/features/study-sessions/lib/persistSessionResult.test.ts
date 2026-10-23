import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateAccount, emptyBundle, readDataBundle, writeDataBundle } from '@/shared/data/dataBundle';
import { loadMistakes, loadStudySessions } from '@/shared/data/storage';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { persistSessionResult } from './persistSessionResult';

const values = new Map<string, string>();
let failWrite = false;
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (failWrite) throw new DOMException('full', 'QuotaExceededError');
    values.set(key, value);
  },
  removeItem: (key: string) => { values.delete(key); }
};
const session = (id = 'qa-session'): StudySession => ({ id, testName: 'QA Result', skillType: 'LR', sessionType: 'FULL_TEST',
  date: '2026-10-23', durationMinutes: 120, totalScore: 700, scaledListening: 350, scaledReading: 350,
  wrongQuestions: [3, 101, 153], createdAt: '2026-10-23T05:00:00.000Z' });
const note = (id: string): MistakeEntry => ({ id, part: 5, questionContext: 'A saved question.', userMistake: '(A)',
  correctAnswer: '(B)', category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: '2026-10-23T05:00:00.000Z' });

beforeEach(() => {
  values.clear(); failWrite = false;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T05:00:00Z'));
  vi.stubGlobal('localStorage', storage);
  writeDataBundle({ ...emptyBundle(), mistakes: [{ ...note('existing'), updatedAt: '2026-10-23T05:00:00.000Z', deletedAt: null }] });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('atomic result and notebook handoff', () => {
  it('writes the result, explicit notes and Reading drafts in exactly one bundle write', () => {
    const write = vi.spyOn(storage, 'setItem');
    const saved = persistSessionResult(session(), { expectedOwner: null, newMistakes: [note('explicit')] });
    expect(write).toHaveBeenCalledOnce();
    expect(saved.sessions.map(row => row.id)).toEqual(['qa-session']);
    expect(saved.mistakes.map(row => row.id).sort()).toEqual(['draft:qa-session:101', 'draft:qa-session:153', 'existing', 'explicit']);
    expect(saved.isRecord).toBe(true);
    expect(loadStudySessions()).toHaveLength(1);
    expect(loadMistakes()).toHaveLength(4);
  });

  it('leaves no half-saved session or cards on quota failure and retries without duplicates', () => {
    const before = values.get('toeic_progress_bundle_v3');
    failWrite = true;
    expect(() => persistSessionResult(session(), { expectedOwner: null })).toThrow(/đầy/);
    expect(values.get('toeic_progress_bundle_v3')).toBe(before);
    failWrite = false;
    persistSessionResult(session(), { expectedOwner: null });
    expect(loadStudySessions()).toHaveLength(1);
    expect(loadMistakes().filter(row => row.sessionId === 'qa-session')).toHaveLength(2);
    expect(() => persistSessionResult(session(), { expectedOwner: null })).toThrow(/đã được lưu/);
    expect(loadStudySessions()).toHaveLength(1);
  });

  it('rejects colliding explicit card IDs before saving any result', () => {
    const before = values.get('toeic_progress_bundle_v3');
    expect(() => persistSessionResult(session(), { expectedOwner: null, newMistakes: [note('existing')] })).toThrow(/ID/);
    expect(values.get('toeic_progress_bundle_v3')).toBe(before);
  });

  it('commits an automatic streak shield with the result instead of a fallible second write', () => {
    const bundle = readDataBundle();
    writeDataBundle({ ...bundle, vocabLog: [{ id: 'vocab-two-days-ago', date: '2026-10-21', count: 5,
      updatedAt: '2026-10-21T05:00:00.000Z', deletedAt: null }] });
    const write = vi.spyOn(storage, 'setItem');
    const saved = persistSessionResult(session(), { expectedOwner: null });
    expect(write).toHaveBeenCalledOnce();
    expect(readDataBundle().shieldDays).toEqual([expect.objectContaining({ id: 'shield:2026-10-22', date: '2026-10-22', deletedAt: null })]);
    expect(saved.profile.streakFreezes).toBe(1);
    expect(saved.profile.currentStreak).toBe(3);
  });

  it('keeps deleted draft tombstones while updating the result and preserving unrelated cards', () => {
    const saved = persistSessionResult(session(), { expectedOwner: null });
    const original = saved.sessions[0];
    const current = readDataBundle();
    writeDataBundle({ ...current, mistakes: current.mistakes.map(row => row.id === 'draft:qa-session:101'
      ? { ...row, updatedAt: '2026-10-23T06:00:00.000Z', deletedAt: '2026-10-23T06:00:00.000Z' } : row) });
    const write = vi.spyOn(storage, 'setItem');
    const updated = persistSessionResult({ ...original, testName: 'Renamed', wrongQuestions: [101, 154] }, { expectedOwner: null, original });
    expect(write).toHaveBeenCalledOnce();
    expect(updated.mistakes.map(row => row.id).sort()).toEqual(['draft:qa-session:154', 'existing']);
    expect(readDataBundle().mistakes.find(row => row.id === 'draft:qa-session:101')?.deletedAt).toBeTruthy();
  });

  it('rejects stale edits and owner switches without writing', () => {
    const original = persistSessionResult(session(), { expectedOwner: null }).sessions[0];
    const current = readDataBundle();
    writeDataBundle({ ...current, sessions: current.sessions.map(row => ({ ...row, totalScore: 750 })) });
    const before = values.get('toeic_progress_bundle_v3');
    expect(() => persistSessionResult({ ...original, testName: 'Stale edit' }, { expectedOwner: null, original })).toThrow(/sửa ở nơi khác/);
    expect(values.get('toeic_progress_bundle_v3')).toBe(before);
    activateAccount('different-owner');
    const write = vi.spyOn(storage, 'setItem');
    expect(() => persistSessionResult(session('other'), { expectedOwner: null })).toThrow(/Tài khoản/);
    expect(write).not.toHaveBeenCalled();
  });
});
