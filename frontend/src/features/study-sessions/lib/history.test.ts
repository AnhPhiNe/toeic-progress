import { describe, expect, it } from 'vitest';
import { previousScoreMap, sourceMistakes } from './history';
import { computeSessionAttemptMap } from '@/shared/data/storage';
import type { MistakeEntry, StudySession } from '@/shared/types';

const session = (id: string, patch: Partial<StudySession> = {}): StudySession => ({ id, testName: 'ETS Test 1', skillType: 'LR', sessionType: 'FULL_TEST', date: '2026-10-01', createdAt: `2026-10-01T0${id}:00:00Z`, durationMinutes: 120, totalScore: 800, ...patch });
const note = (id: string, patch: Partial<MistakeEntry> = {}): MistakeEntry => ({ id, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW', questionContext: 'Question', correctAnswer: '', userMistake: '', tags: [], createdAt: '2026-10-01T00:00:00Z', ...patch });

describe('history source and chronology', () => {
  it('groups normalized Unicode names, excludes deleted attempts and separates full tests, skills and Part practice', () => {
    const rows = [session('1'), session('2', { testName: '  ｅｔｓ  test 1  ', attemptNumber: 1 }),
      session('3', { sessionType: 'PART_PRACTICE' }), session('4', { skillType: 'SW' }), session('5', { deletedAt: 'x' })];
    const before = JSON.stringify(rows), map = computeSessionAttemptMap(rows);
    expect(map['2'].attemptNumber).toBe(2);
    expect(map['2'].firstSession?.id).toBe('1');
    expect(map['3'].attemptNumber).toBe(1);
    expect(map['4'].attemptNumber).toBe(1);
    expect(map['5']).toBeUndefined();
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('keeps explicit attempt gaps after a deletion without duplicate numbers; blank names are not one shared test', () => {
    const map = computeSessionAttemptMap([session('1', { attemptNumber: 3 }), session('2', { attemptNumber: 2 }), session('3', { testName: '' }), session('4', { testName: '' }), session('5', { testName: '__proto__' })]);
    expect(map['1'].attemptNumber).toBe(3);
    expect(map['2'].attemptNumber).toBe(4);
    expect(map['1'].scoreDiffFromFirst).toBeNull();
    expect(map['2'].scoreDiffFromFirst).toBeNull();
    expect(map['3'].isRetest).toBe(false);
    expect(map['4'].isRetest).toBe(false);
    expect(map['5'].attemptNumber).toBe(1);
  });
  it('compares the previous scored full test in stable date/time order, including different tests, without zero for missing data', () => {
    const rows = [session('3', { totalScore: 850 }), session('1'), session('2', { testName: 'Different test', totalScore: 820 }), session('4', { totalScore: undefined }), session('5', { sessionType: 'PART_PRACTICE', totalScore: 900 }), session('6', { deletedAt: 'x', totalScore: 930 })];
    const before = JSON.stringify(rows), map = previousScoreMap(rows);
    expect(map.get('1')).toBeUndefined();
    expect(map.get('2')?.id).toBe('1');
    expect(map.get('3')?.id).toBe('2');
    expect(map.has('4')).toBe(false);
    expect(map.has('5')).toBe(false);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('finds notes by source across attempts, supports legacy references and honors explicit source overrides/clears', () => {
    const rows = [session('1'), session('2')];
    const notes = [note('source', { sourceTestName: '  ｅｔｓ  test 1 ' }), note('legacy', { sessionId: '2' }),
      note('cleared', { sessionId: '1', sourceTestName: '' }), note('different', { sessionId: '1', sourceTestName: 'Other' }), note('deleted', { sourceTestName: 'ETS Test 1', deletedAt: 'x' })];
    expect(sourceMistakes(rows[0], rows, notes).map(item => item.id)).toEqual(['source', 'legacy']);
    const unnamed = session('3', { testName: '' });
    expect(sourceMistakes(unnamed, [unnamed], [note('mine', { sessionId: '3' }), note('unassigned'), note('clear', { sessionId: '3', sourceTestName: '' })]).map(item => item.id)).toEqual(['mine']);
  });
});
