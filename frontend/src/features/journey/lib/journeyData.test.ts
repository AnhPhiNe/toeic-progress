import { describe, expect, it } from 'vitest';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { notebookQuestions, testStory, wrongCountsByPart } from './journeyData';

const t = (id: string, date: string, totalScore: number, extra: Partial<StudySession> = {}) =>
  ({ id, skillType: 'LR', sessionType: 'FULL_TEST', testName: extra.testName ?? `Test ${id}`, date, durationMinutes: 120, totalScore, scaledListening: 300, scaledReading: totalScore - 300, createdAt: date, ...extra }) as StudySession;

describe('journeyData', () => {
  it('counts wrong answers per Part from the list or from Part scores', () => {
    expect(wrongCountsByPart(t('a', '2026-11-01', 700, { wrongQuestions: [1, 7, 8, 200] }))).toEqual({ 1: 1, 2: 2, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1 });
    expect(wrongCountsByPart(t('b', '2026-11-01', 700, { partScores: { part1: 6, part2: 20, part3: 30, part4: 25, part5: 28, part6: 16, part7: 40 } }))?.[7]).toBe(14);
    expect(wrongCountsByPart(t('c', '2026-11-01', 700))).toBeNull();
  });

  it('tells the story of each test for its ticket', () => {
    const list = [t('1', '2026-10-01', 620), t('2', '2026-10-08', 700, { testName: 'X' }), t('3', '2026-10-15', 680), t('4', '2026-10-20', 710, { testName: 'X' }), t('5', '2026-10-25', 805)];
    expect(testStory(list[0], list, 800)).toMatchObject({ kind: 'first', delta: 0, first: 620 });
    expect(testStory(list[1], list, 800)).toMatchObject({ kind: 'rec', delta: 80 });
    expect(testStory(list[2], list, 800)).toMatchObject({ kind: 'down', delta: -20 });
    expect(testStory(list[3], list, 800).earlier?.id).toBe('2');
    expect(testStory(list[4], list, 800)).toMatchObject({ kind: 'goal', isBest: true });
  });

  it('finds wrong questions that already have a notebook card', () => {
    const s = t('9', '2026-11-01', 700, { wrongQuestions: [112, 118] });
    const cards = [{ sessionId: '9', questionNumber: 112 }, { sessionId: '9', questionNumber: 118, deletedAt: 'x' }, { sessionId: '8', questionNumber: 140 }] as MistakeEntry[];
    expect([...notebookQuestions(s, cards)]).toEqual([112]);
  });
});
