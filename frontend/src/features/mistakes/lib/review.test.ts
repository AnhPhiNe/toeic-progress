import { describe, expect, it } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { gradeReview, reviewResultText, reviewStatus } from '@/features/mistakes/lib/review';

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
