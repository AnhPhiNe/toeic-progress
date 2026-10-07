import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addStudySession, loadMistakes, loadStudySessions, saveMistakes, saveStudySessions, updateMistakes, updateStudySessions } from '@/shared/data/storage';
import { readDataBundle } from '@/shared/data/dataBundle';
import type { MistakeEntry, StudySession } from '@/shared/types';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

const values = new Map<string, string>();
const fakeStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, value); },
  removeItem(key: string) { values.delete(key); },
  clear() { values.clear(); }
};

const session = (id: string, testName: string): StudySession => ({
  id, skillType: 'LR', sessionType: 'FULL_TEST', testName, date: '2026-10-07', durationMinutes: 120,
  scaledListening: 400, scaledReading: 400, totalScore: 800, scoreSource: 'MANUAL_SECTIONS', createdAt: '2026-10-07T08:00:00.000Z'
});

const mistake = (id: string): MistakeEntry => ({
  id, part: 5, questionContext: `Câu ${id}`, userMistake: '(A)', correctAnswer: '(B)', category: 'ADVANCED_GRAMMAR',
  tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-10-07T08:00:00.000Z'
});

describe('collection updates apply to the stored list, not a stale copy', () => {
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', fakeStorage);
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a session written elsewhere (Pacing screen) when another session is edited or deleted', () => {
    saveStudySessions([session('a', 'Test A'), session('b', 'Test B')]);
    const staleCopyHeldByApp = loadStudySessions();

    // The Pacing screen saves straight to storage while the app keeps its old state.
    addStudySession({ ...session('pacing', '[Luyện tốc độ] Part 5'), sessionType: 'PART_PRACTICE' });
    expect(staleCopyHeldByApp.map(s => s.id)).not.toContain('pacing');

    updateStudySessions(current => current.map(s => (s.id === 'a' ? { ...s, testName: 'Test A (sửa)' } : s)));
    updateStudySessions(current => current.filter(s => s.id !== 'b'));

    expect(loadStudySessions().map(s => s.id).sort()).toEqual(['a', 'pacing']);
    const stored = readDataBundle().sessions;
    expect(stored.find(s => s.id === 'pacing')?.deletedAt).toBeNull();
    expect(stored.find(s => s.id === 'b')?.deletedAt).toBeTruthy();
  });

  it('keeps a mistake added elsewhere when another card is graded or deleted', () => {
    saveMistakes([mistake('m1'), mistake('m2')]);
    saveMistakes([mistake('m3'), ...loadMistakes()]);

    updateMistakes(current => current.map(m => (m.id === 'm1' ? { ...m, status: 'MASTERED' as const } : m)));
    updateMistakes(current => current.filter(m => m.id !== 'm2'));

    expect(loadMistakes().map(m => m.id).sort()).toEqual(['m1', 'm3']);
    expect(loadMistakes().find(m => m.id === 'm1')?.status).toBe('MASTERED');
  });
});
