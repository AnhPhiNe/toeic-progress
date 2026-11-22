import { describe, expect, it } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { dueCountOn, missedPick, REVIEW_SESSION_CAP, reviewBatch, reviewRating } from './spacedRepetition';
import { nextReviewLine } from './notebookSummary';

const card = (id: string, fields: Partial<MistakeEntry> = {}) => ({
  id, part: 5, question: 'Q ____', questionContext: 'Q ____', userMistake: '', correctAnswer: '(B) be', answerSource: 'PROVIDED',
  category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', deletedAt: null, ...fields,
}) as MistakeEntry;

describe('wrong pick in review', () => {
  it('gives AGAIN from either button, so review shows a single "Tiếp"', () => {
    expect(missedPick('A', 'B')).toBe(true);
    expect(reviewRating(true, 'A', 'B')).toBe('AGAIN');
    expect(reviewRating(false, 'A', 'B')).toBe('AGAIN');
  });
  it('keeps both ratings after a right pick or without a quiz', () => {
    expect(missedPick('B', 'B')).toBe(false);
    expect(missedPick(null, 'B')).toBe(false);
    expect(reviewRating(true, 'B', 'B')).toBe('GOOD');
    expect(reviewRating(false, 'B', 'B')).toBe('AGAIN');
  });
});

describe('reviewBatch', () => {
  it('caps one session at 15 and reports the rest', () => {
    expect(REVIEW_SESSION_CAP).toBe(15);
    expect(reviewBatch(60)).toEqual({ count: 15, rest: 45 });
    expect(reviewBatch(15)).toEqual({ count: 15, rest: 0 });
    expect(reviewBatch(4)).toEqual({ count: 4, rest: 0 });
    expect(reviewBatch(0)).toEqual({ count: 0, rest: 0 });
  });
});

describe('next review line', () => {
  it('counts what is due tomorrow, overdue and new cards included', () => {
    const cards = [card('a', { nextReviewDate: '2026-11-23' }), card('b', { nextReviewDate: '2026-11-20' }), card('c'),
      card('d', { nextReviewDate: '2026-11-25' }), card('e', { status: 'MASTERED' }), card('f', { deletedAt: '2026-11-21T00:00:00.000Z' })];
    expect(dueCountOn(cards, '2026-11-23')).toBe(3);
    expect(nextReviewLine(cards, '2026-11-22')).toBe('Ngày mai: 3 câu');
    expect(nextReviewLine([card('d', { nextReviewDate: '2026-11-25' })], '2026-11-22')).toBe('Ngày mai chưa có câu nào đến hạn');
  });
});
