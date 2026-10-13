import { describe, it, expect } from 'vitest';
import { analyticsScopeData, analyticsAttemptLabel } from './analyticsScope';
import type { StudySession, MistakeEntry } from '@/shared/types';

const session = (id: string, patch: Partial<StudySession> = {}): StudySession => ({ id, testName: `ETS Test ${id}`,
  skillType: 'LR', sessionType: 'FULL_TEST', date: `2026-10-${id.padStart(2, '0')}`, createdAt: '2026-10-01T00:00:00Z',
  durationMinutes: 120, totalScore: 700, scaledListening: 350, scaledReading: 350,
  partScores: { part1: 5, part2: 20, part3: 30, part4: 20, part5: 25, part6: 10, part7: 40 }, ...patch });
const note = (id: string, patch: Partial<MistakeEntry> = {}): MistakeEntry => ({ id, part: 5, questionContext: 'Reports should ____ submitted.',
  userMistake: '', correctAnswer: '(B) be', category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: '2026-10-01T00:00:00Z', ...patch });

describe('analytics test and attempt selection', () => {
  it('excludes practice-only and SW-only sources without removing a shared Full Test or unknown notes-only source', () => {
    const full = session('1', { testName: 'ETS Full' });
    const practice = session('2', { testName: 'Practice only', sessionType: 'PART_PRACTICE' });
    const shared = session('3', { testName: '  ｅｔｓ Full ', sessionType: 'PART_PRACTICE' });
    const speaking = session('4', { testName: 'SW only', skillType: 'SW' });
    const rows = [full, practice, shared, speaking];
    const notes = [note('practice', { sourceTestName: 'Practice only' }), note('legacy-practice', { sessionId: practice.id }),
      note('shared', { sourceTestName: 'ETS Full' }), note('notes-only', { sourceTestName: 'Notes only' })];
    const snapshot = JSON.stringify({ rows, notes });
    const data = analyticsScopeData(rows, notes, 'practice only');
    expect(data.names).toEqual(['ETS Full', 'Notes only']);
    expect(data.source).toBe('ETS Full');
    expect(data.attempts.map(row => row.session.id)).toEqual(['1']);
    expect(data.notes.map(row => row.id)).toEqual(['shared']);
    expect(JSON.stringify({ rows, notes })).toBe(snapshot);
    expect(analyticsScopeData([practice], [notes[0]]).names).toEqual([]);
  });
  it('does not label a perfect Part as weak when all seven are correct', () => {
    const perfect = session('1', { partScores: { part1: 6, part2: 25, part3: 39, part4: 30, part5: 30, part6: 16, part7: 54 } });
    const data = analyticsScopeData([perfect], [note('1', { sourceTestName: perfect.testName })]);
    expect(data.parts.every(part => part.accuracy === 100)).toBe(true);
    expect(data.weakest).toBeNull();
    expect(data.notes).toHaveLength(1);
  });
  it('defaults to the latest LR test, normalizes source names, and keeps notes across attempts', () => {
    const first = session('1', { testName: 'ETS A', date: '2026-09-13' });
    const retake = session('2', { testName: '  ｅｔｓ  A  ', date: '2026-10-05', scaledListening: 400 });
    const other = session('3', { testName: 'ETS B', date: '2026-10-08' });
    const notes = [note('old', { sessionId: first.id }), note('new', { sourceTestName: 'ETS A', status: 'MASTERED' }),
      note('clear', { sessionId: first.id, sourceTestName: '' }), note('deleted', { sourceTestName: 'ETS A', deletedAt: 'x' })];
    expect(analyticsScopeData([first, retake, other], notes).source).toBe('ETS B');
    const latest = analyticsScopeData([first, retake, other], notes, 'ets a');
    expect(latest.attempt?.id).toBe('2');
    expect(latest.attemptNumber).toBe(2);
    expect(latest.listening.value).toBe(400);
    const old = analyticsScopeData([first, retake, other], notes, 'ets a', '1');
    expect(old.attemptNumber).toBe(1);
    expect(old.listening.value).toBe(350);
    expect(old.notes.map(row => row.id)).toEqual(['old', 'new']);
    expect(old.notes).toEqual(latest.notes);
    expect(old.notebookSources).toEqual(['ETS A']);
  });
  it('never borrows Part or section scores when the selected attempt only contains a total', () => {
    const first = session('1');
    const latest = session('2', { testName: first.testName, partScores: undefined, scaledListening: undefined, scaledReading: undefined, scoreSource: 'MANUAL_TOTAL' });
    const data = analyticsScopeData([first, latest], []);
    expect(data.parts).toEqual([]);
    expect(data.listening.value).toBeNull();
    expect(data.reading.value).toBeNull();
    expect(analyticsScopeData([first, latest], [], 'ets test 1', first.id).parts).toHaveLength(7);
  });
  it('orders same-day attempts deterministically and shares numbering with History without mixing SW or practice', () => {
    const early = session('1', { testName: 'ETS A', date: '2026-10-05', createdAt: '2026-10-05T09:00:00Z', attemptNumber: 3 });
    const late = session('2', { testName: 'ETS A', date: early.date, createdAt: '2026-10-05T10:00:00Z' });
    const rows = [late, session('3', { testName: 'ETS A', skillType: 'SW' }), early,
      session('4', { testName: 'ETS A', sessionType: 'PART_PRACTICE' }), session('5', { testName: 'ETS A', deletedAt: 'x' })];
    const before = JSON.stringify(rows), data = analyticsScopeData(rows, [], 'ets a');
    expect(data.attempts.map(row => [row.session.id, row.number])).toEqual([['2', 4], ['1', 3]]);
    expect(data.latestAttempt).toBe(true);
    expect(analyticsAttemptLabel(4, late.date, true)).toBe('Lần 4 · 05/10/2026 · Mới nhất');
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('ignores a stale or other-test attempt id and returns to the latest available attempt', () => {
    const rows = [session('1', { testName: 'ETS A' }), session('2', { testName: 'ETS A' }), session('3', { testName: 'ETS B' })];
    expect(analyticsScopeData(rows, [], 'ets a', '3').attempt?.id).toBe('2');
    expect(analyticsScopeData(rows, [], 'ets a', 'deleted-id').attempt?.id).toBe('2');
    expect(analyticsScopeData(rows.filter(row => row.id !== '2'), [], 'ets a', '2').attempt?.id).toBe('1');
    expect(analyticsScopeData(rows, [], 'removed-test').source).toBe('ETS B');
  });
  it('supports notes-only sources and never assigns unlinked notes to an unnamed result', () => {
    const data = analyticsScopeData([], [note('1', { sourceTestName: 'Notes only' }), note('other')], 'notes only');
    expect(data.attempts).toEqual([]);
    expect(data.parts).toEqual([]);
    expect(data.listening.value).toBeNull();
    expect(data.notes.map(row => row.id)).toEqual(['1']);
    const unnamed = analyticsScopeData([session('1', { testName: '' }), session('2', { testName: '' })], [note('unlinked')]);
    expect(unnamed.attempts).toHaveLength(1);
    expect(unnamed.notes).toEqual([]);
    expect(unnamed.notebookSources).toEqual([]);
    expect(analyticsScopeData([], [note('unlinked')]).attempt).toBeNull();
  });
  it('rejects malformed selected detail and section values, while keeping valid zero correct answers', () => {
    const valid = session('1'); valid.partScores!.part4 = 0;
    const invalid = session('2', { testName: valid.testName, scaledListening: 0, scaledReading: 500 }); invalid.partScores!.part1 = 7;
    const data = analyticsScopeData([valid, invalid], []);
    expect(data.parts).toEqual([]);
    expect(data.listening.value).toBeNull();
    expect(data.reading.value).toBeNull();
    const old = analyticsScopeData([valid, invalid], [], 'ets test 1', '1');
    expect(old.weakest?.key).toBe('part4');
    expect(old.weakest?.accuracy).toBe(0);
  });

  it('picks the Part that lost the most questions, not the lowest percentage', () => {
    // P1 4/6 is the lowest accuracy (67%) but loses 2 questions; P7 38/54 (70%) loses 16.
    const row = session('1', { partScores: { part1: 4, part2: 19, part3: 31, part4: 24, part5: 22, part6: 13, part7: 38 } });
    const data = analyticsScopeData([row], []);
    expect(data.weakest?.key).toBe('part7');
    expect(data.weakest?.lost).toBe(16);
    expect(data.parts.find(part => part.key === 'part1')?.lost).toBe(2);
  });

  it('breaks a tie in lost questions by lower accuracy and has no weakest Part when nothing is lost', () => {
    const tie = session('1', { partScores: { part1: 6, part2: 25, part3: 39, part4: 30, part5: 27, part6: 13, part7: 54 } });
    expect(analyticsScopeData([tie], []).weakest?.key).toBe('part6');
    const perfect = session('2', { partScores: { part1: 6, part2: 25, part3: 39, part4: 30, part5: 30, part6: 16, part7: 54 } });
    expect(analyticsScopeData([perfect], []).weakest).toBeNull();
  });
});
