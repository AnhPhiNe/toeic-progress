import { describe, expect, it } from 'vitest';
import type { MistakeEntry, StudySession } from '@/shared/types';
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { chestPlan, islandRadius, islandState, partAccuracy, partChests, wrongTrend } from './islands';

const session = (extra: Partial<StudySession> = {}) =>
  ({ id: 's1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS 03', date: '2026-11-11', durationMinutes: 120, totalScore: 700, createdAt: '2026-11-11', ...extra }) as StudySession;
const card = (part: number, questionNumber: number, extra: Partial<MistakeEntry> = {}) =>
  ({ id: `c${questionNumber}`, sessionId: 's1', part, questionNumber, status: 'NEEDS_REVIEW', ...extra }) as MistakeEntry;
const wrong = (o: Partial<Record<PartNumber, number>>) => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, ...o }) as Record<PartNumber, number>;

describe('islands', () => {
  it('dresses an island by accuracy', () => {
    expect(partAccuracy(54, 12)).toBe(78);
    expect(partAccuracy(6, 3)).toBe(50);
    expect(partAccuracy(0, 0)).toBe(0);
    expect(partAccuracy(10, 20)).toBe(0);
    expect([100, 85].map(islandState)).toEqual(['strong', 'strong']);
    expect([84, 75].map(islandState)).toEqual(['ok', 'ok']);
    expect([74, 0].map(islandState)).toEqual(['weak', 'weak']);
  });

  it('sizes islands by question count', () => {
    expect(islandRadius(6)).toBeLessThan(islandRadius(25));
    expect(islandRadius(54)).toBeGreaterThan(islandRadius(39));
  });

  it('reads the direction of the wrong counts', () => {
    expect(wrongTrend([16, 14, 13, 12])).toBe('down');
    expect(wrongTrend([3, 5])).toBe('up');
    expect(wrongTrend([4, 7, 4])).toBe('flat');
    expect(wrongTrend([5])).toBeNull();
  });

  it('opens a chest only when every wrong question has a reviewed card', () => {
    const s = session({ wrongQuestions: [147, 148, 149, 40] });
    const w = wrong({ 7: 3, 3: 1 });
    let c = partChests(s, w, [card(7, 147, { reviewCount: 1 }), card(7, 148, { status: 'MASTERED' }), card(7, 149)]);
    expect(c[7]).toMatchObject({ wrong: 3, reviewed: 2, remaining: 1, open: false });
    c = partChests(s, w, [card(7, 147, { reviewCount: 1 }), card(7, 148, { status: 'MASTERED' }), card(7, 149, { reviewCount: 2 }), card(3, 40, { sessionId: 's2', reviewCount: 3 })]);
    expect(c[7].open).toBe(true);
    expect(c[3]).toMatchObject({ reviewed: 0, open: false });
    expect(c[1]).toMatchObject({ wrong: 0, open: false });
  });

  it('ignores deleted cards and works from Part scores when there is no wrong list', () => {
    const s = session();
    const c = partChests(s, wrong({ 5: 2 }), [card(5, 101, { reviewCount: 1 }), card(5, 102, { reviewCount: 1, deletedAt: 'x' })]);
    expect(c[5]).toMatchObject({ reviewed: 1, remaining: 1, open: false });
    const d = partChests(s, wrong({ 5: 2 }), [card(5, 101, { reviewCount: 1 }), card(5, 102, { reviewCount: 1 })]);
    expect(d[5].open).toBe(true);
    // Older cards carry only the test name.
    const e = partChests(s, wrong({ 5: 1 }), [{ ...card(5, 101, { reviewCount: 1 }), sessionId: undefined, sourceTestName: 'ETS 03' }]);
    expect(e[5].open).toBe(true);
  });

  it('numbers the two worst Parts and promotes the next one when a chest is emptied', () => {
    const s = session();
    const w = wrong({ 7: 12, 3: 11, 4: 7, 1: 3 });
    expect(chestPlan(partChests(s, w, []))).toEqual({ numbered: [7, 3], opened: [] });
    const cards = Array.from({ length: 12 }, (_, i) => card(7, 147 + i, { reviewCount: 1 }));
    expect(chestPlan(partChests(s, w, cards))).toEqual({ numbered: [3, 4], opened: [7] });
  });

  it('breaks ties by lower accuracy and handles tests with nothing wrong', () => {
    expect(chestPlan(partChests(session(), wrong({ 1: 3, 6: 3, 2: 1 }), [])).numbered).toEqual([1, 6]);
    expect(chestPlan(partChests(session(), wrong({}), []))).toEqual({ numbered: [], opened: [] });
    expect(chestPlan(partChests(session(), wrong({ 5: 1 }), [])).numbered).toEqual([5]);
  });
});
