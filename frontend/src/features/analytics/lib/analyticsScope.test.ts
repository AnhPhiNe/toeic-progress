import { describe, it, expect } from 'vitest';
import { analyticsScopeData } from './analyticsScope';
import type { StudySession, MistakeEntry } from '@/shared/types';

const session = (id: string, patch: Partial<StudySession> = {}): StudySession => ({ id, testName: `ETS Test ${id}`,
  skillType: 'LR', sessionType: 'FULL_TEST', date: `2026-10-${id.padStart(2, '0')}`, createdAt: '2026-10-01T00:00:00Z',
  durationMinutes: 120, totalScore: 700, scaledListening: 350, scaledReading: 350,
  partScores: { part1: 5, part2: 20, part3: 30, part4: 20, part5: 25, part6: 10, part7: 40 }, ...patch });
const note = (id: string, patch: Partial<MistakeEntry> = {}): MistakeEntry => ({ id, part: 5, questionContext: 'Reports should ____ submitted.',
  userMistake: '', correctAnswer: '(B) be', category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: '2026-10-01T00:00:00Z', ...patch });

describe('analytics presentation scope', () => {
  it('uses the latest result of the normalized test name, including retakes, and all notes for that source', () => {
    const first = session('1', { testName: 'ETS Test 1' });
    const latest = session('2', { testName: '  ets   test 1  ', attemptNumber: 2, scaledListening: 400 });
    const notes = [note('old', { sessionId: first.id }), note('new', { sourceTestName: 'ＥＴＳ Test 1' }), note('clear', { sessionId: first.id, sourceTestName: '' }), note('deleted', { sourceTestName: first.testName, deletedAt: 'x' })];
    const data = analyticsScopeData([first, latest], notes, 'test:ets test 1');
    expect(data.selected.map(row => row.id)).toEqual(['2']);
    expect(data.listening.value).toBe(400);
    expect(data.notes.map(row => row.id)).toEqual(['old', 'new']);
    expect(data.parts[0].correct).toBe(5);
    expect(data.parts[0].accuracy).toBeCloseTo(83.3333);
  });
  it('all uses more than five results; recent selects five before separately counting available Part and section data', () => {
    const rows = Array.from({ length: 7 }, (_, index) => session(String(index + 1)));
    rows[6] = { ...rows[6], partScores: undefined, scaledListening: undefined, scaledReading: undefined, scoreSource: 'MANUAL_TOTAL' };
    const notes = [note('early', { sourceTestName: rows[0].testName }), note('late', { sourceTestName: rows[6].testName }), note('unlinked')];
    const all = analyticsScopeData(rows, notes, 'all');
    expect(all.selected).toHaveLength(7);
    expect(all.partResults).toHaveLength(6);
    expect(all.notes).toHaveLength(3);
    expect(all.listening.count).toBe(6);
    const recent = analyticsScopeData(rows, notes, 'recent');
    expect(recent.selected.map(row => row.id)).toEqual(['7', '6', '5', '4', '3']);
    expect(recent.partResults).toHaveLength(4);
    expect(recent.notes.map(row => row.id)).toEqual(['late']);
    expect(recent.notebookSources).toHaveLength(5);
  });
  it('does not substitute an older result when the newest one lacks Part/section details', () => {
    const first = session('1');
    const latest = session('2', { testName: first.testName, partScores: undefined, scaledListening: undefined, scaledReading: 395 });
    const data = analyticsScopeData([first, latest], [], 'latest');
    expect(data.parts).toEqual([]);
    expect(data.listening.value).toBeNull();
    expect(data.reading.value).toBe(395);
  });
  it('supports notes-only and partial-practice names without treating missing results as zero', () => {
    const rows = [session('1', { sessionType: 'PART_PRACTICE' }), session('2', { deletedAt: 'x' })];
    const data = analyticsScopeData(rows, [note('1', { sourceTestName: 'Notes only' })], 'test:notes only');
    expect(data.resultCount).toBe(0);
    expect(data.names).toEqual(['ETS Test 1', 'Notes only']);
    expect(data.parts).toEqual([]);
    expect(data.listening.value).toBeNull();
    expect(data.notes).toHaveLength(1);
    const latest = analyticsScopeData(rows, [note('unlinked')], 'latest');
    expect(latest.notes).toEqual([]);
    expect(latest.notebookSources).toEqual([]);
  });
  it('rejects malformed Part values, preserves zero correct answers, and never mutates inputs', () => {
    const valid = session('1'); valid.partScores!.part4 = 0;
    const invalid = session('2'); invalid.partScores!.part1 = 7;
    const rows = [valid, invalid], snapshot = JSON.stringify(rows);
    const data = analyticsScopeData(rows, [], 'all');
    expect(data.partResults).toHaveLength(1);
    expect(data.weakest?.key).toBe('part4');
    expect(data.weakest?.accuracy).toBe(0);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
