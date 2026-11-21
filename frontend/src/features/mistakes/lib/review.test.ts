import { describe, expect, it } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { gradeReview, reviewResultText, reviewStatus } from '@/features/mistakes/lib/review';
import { getStageLabel, reviewRating } from './spacedRepetition';

const TODAY = '2026-10-07';
const card = (changes: Partial<MistakeEntry> = {}): MistakeEntry => ({
  id: 'm1', part: 5, questionContext: 'Reports should ____ submitted.', userMistake: '(A) are', userChoice: 'A',
  correctAnswer: '(B) be', options: ['(A) are', '(B) be'], category: 'ADVANCED_GRAMMAR', tags: [],
  status: 'NEEDS_REVIEW', createdAt: '2026-10-01T00:00:00.000Z', ...changes
});

describe('review status', () => {
  it('describes when the card is due', () => {
    expect(reviewStatus(card(), TODAY).label).toBe('Đến hạn hôm nay');
    expect(reviewStatus(card({ nextReviewDate: '2026-10-05' }), TODAY)).toEqual({ kind: 'overdue', label: 'Quá hạn ôn 2 ngày' });
    expect(reviewStatus(card({ nextReviewDate: '2026-10-08' }), TODAY).label).toBe('Ôn ngày mai');
    expect(reviewStatus(card({ nextReviewDate: '2026-10-10' }), TODAY)).toEqual({ kind: 'scheduled', label: 'Ôn sau 3 ngày' });
    expect(reviewStatus(card({ status: 'MASTERED' }), TODAY).kind).toBe('mastered');
  });
});

describe('grading a review', () => {
  it.each([
    ['AGAIN', 0, '2026-10-08'],
    ['HARD', 2, '2026-10-11'],
    ['GOOD', 3, '2026-10-21'],
    ['EASY', 4, '2026-11-06']
  ] as const)('gives %s its own persisted stage and next date', (rating, stage, date) => {
    const before = card({ reviewStage: 2, reviewCount: 3, nextReviewDate: TODAY });
    const after = gradeReview(before, rating, TODAY);
    expect(after).toMatchObject({ reviewStage: stage, nextReviewDate: date, reviewCount: 4, status: 'NEEDS_REVIEW' });
    expect(after.lastReviewedAt).toMatch(/T.*Z$/);
    expect(before.reviewCount).toBe(3);
    expect(getStageLabel(after)).toBe(`Bậc ${stage + 1}/5 · hẹn ${date.split('-').reverse().join('/')}`);
  });

  it('keeps HARD at the final stage and only masters after GOOD/EASY pass it', () => {
    const final = card({ reviewStage: 4, nextReviewDate: TODAY });
    expect(gradeReview(final, 'HARD', TODAY)).toMatchObject({ status: 'NEEDS_REVIEW', reviewStage: 4, nextReviewDate: '2026-10-22' });
    for (const rating of ['GOOD', 'EASY'] as const) {
      expect(gradeReview(final, rating, TODAY)).toMatchObject({ status: 'MASTERED', reviewStage: 4, nextReviewDate: undefined });
    }
    const almost = card({ reviewStage: 3, nextReviewDate: TODAY });
    expect(gradeReview(almost, 'GOOD', TODAY).status).toBe('NEEDS_REVIEW');
    expect(gradeReview(almost, 'EASY', TODAY).status).toBe('MASTERED');
  });

  it('uses one day for HARD on a stage-0 card so HARD never spaces longer than stage 0', () => {
    expect(gradeReview(card({ reviewStage: 0 }), 'HARD', TODAY)).toMatchObject({ reviewStage: 0, nextReviewDate: '2026-10-08' });
  });

  it('maps quiz misses to AGAIN even when the learner clicks Hiểu rồi', () => {
    expect(reviewRating(true, 'A', 'B')).toBe('AGAIN');
    expect(reviewRating(false, 'B', 'B')).toBe('AGAIN');
    expect(reviewRating(true, 'B', 'B')).toBe('GOOD');
    expect(reviewRating(true, null, '')).toBe('GOOD');
  });

  it.each([
    [99, 4, '2026-10-22'],
    [-2, 0, '2026-10-08'],
    [2.8, 2, '2026-10-11'],
    [Number.NaN, 0, '2026-10-08'],
    [Number.POSITIVE_INFINITY, 0, '2026-10-08']
  ])('bounds legacy stage %s before computing a HARD interval', (storedStage, stage, date) => {
    const after = gradeReview(card({ reviewStage: storedStage }), 'HARD', TODAY);
    expect(after).toMatchObject({ reviewStage: stage, nextReviewDate: date, status: 'NEEDS_REVIEW' });
    expect(getStageLabel({ ...after, reviewStage: storedStage })).toContain(`Bậc ${stage + 1}/5`);
  });

  it.each(['HARD', 'GOOD', 'EASY'] as const)('does not accelerate early or mastered cards with %s', rating => {
    for (const before of [card({ nextReviewDate: '2026-10-15', reviewStage: 2 }), card({ status: 'MASTERED', reviewStage: 4 })]) {
      expect(gradeReview(before, rating, TODAY)).toBe(before);
      expect(reviewResultText(before, before, rating, '', TODAY)).toContain('lịch ôn giữ nguyên');
      expect(gradeReview(before, 'AGAIN', TODAY)).toMatchObject({ status: 'NEEDS_REVIEW', reviewStage: 0, nextReviewDate: '2026-10-08' });
    }
  });

  it('moves a due card along the schedule', () => {
    const after = gradeReview(card({ reviewStage: 0 }), true, TODAY);
    expect(after.reviewStage).toBe(1);
    expect(after.nextReviewDate).toBe('2026-10-10');
    expect(reviewResultText(card(), after, true, 'B', TODAY)).toBe('Đúng · ôn sau 3 ngày');
  });

  it('does not let early practice push a card forward, but a wrong answer resets it', () => {
    const early = card({ reviewStage: 2, nextReviewDate: '2026-10-12' });
    expect(gradeReview(early, true, TODAY)).toBe(early);
    expect(reviewResultText(early, early, true, 'B', TODAY)).toBe('Đúng · lịch ôn giữ nguyên');
    const reset = gradeReview(early, false, TODAY);
    expect(reset.reviewStage).toBe(0);
    expect(reset.nextReviewDate).toBe('2026-10-08');
  });

  it('reopens a mastered card answered wrongly', () => {
    const after = gradeReview(card({ status: 'MASTERED' }), false, TODAY);
    expect(after.status).toBe('NEEDS_REVIEW');
    expect(after.nextReviewDate).toBe('2026-10-08');
  });

  it('notices when the learner repeats the same mistake', () => {
    const after = gradeReview(card(), false, TODAY);
    expect(reviewResultText(card(), after, false, 'A', TODAY)).toBe('Vẫn nhầm như lần trước · ôn lại ngày mai');
    expect(reviewResultText(card(), after, false, 'C', TODAY)).toBe('Chưa đúng · ôn lại ngày mai');
  });
});
