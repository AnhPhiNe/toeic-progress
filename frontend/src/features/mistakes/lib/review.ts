import type { MistakeEntry } from '@/shared/types';
import { getTodayDateString } from '@/shared/data/storage';
import { applyReviewResult, isDueForReview, canReview, normalizeReviewRating, type ReviewAnswer } from '@/features/mistakes/lib/spacedRepetition';
import { optionLetter } from '@/features/mistakes/lib/userChoice';

export type ReviewStatusKind = 'mastered' | 'overdue' | 'due' | 'scheduled' | 'incomplete';

export interface ReviewStatus {
  kind: ReviewStatusKind;
  label: string;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** One short status for the notebook row: when the card is due next. */
export function reviewStatus(mistake: MistakeEntry, today = getTodayDateString()): ReviewStatus {
  if (!canReview(mistake)) return { kind: 'incomplete', label: 'Chưa có đáp án' };
  if (mistake.status === 'MASTERED') return { kind: 'mastered', label: 'Đã thuộc' };
  if (!mistake.nextReviewDate) return { kind: 'due', label: 'Đến hạn hôm nay' };
  const days = daysBetween(today, mistake.nextReviewDate);
  if (days < 0) return { kind: 'overdue', label: `Quá hạn ôn ${-days} ngày` };
  if (days === 0) return { kind: 'due', label: 'Đến hạn hôm nay' };
  return { kind: 'scheduled', label: days === 1 ? 'Ôn ngày mai' : `Ôn sau ${days} ngày` };
}

/**
 * Apply one graded answer. A due card follows the spaced schedule. Practising a card
 * early (or a mastered card) only changes it when the answer is wrong, so a card
 * cannot be pushed to "mastered" by answering it several times in one day.
 */
export function gradeReview(mistake: MistakeEntry, answer: ReviewAnswer, today = getTodayDateString()): MistakeEntry {
  if (!canReview(mistake)) return mistake;
  if (mistake.status !== 'MASTERED' && isDueForReview(mistake, today)) {
    return applyReviewResult(mistake, answer, today);
  }
  if (normalizeReviewRating(answer) !== 'AGAIN') return mistake;
  return applyReviewResult({ ...mistake, status: 'NEEDS_REVIEW' }, false, today);
}

/** One-line result shown after answering, e.g. "Đúng · ôn sau 3 ngày". */
export function reviewResultText(
  before: MistakeEntry,
  after: MistakeEntry,
  answer: ReviewAnswer,
  chosen: string,
  today = getTodayDateString()
): string {
  const rating = normalizeReviewRating(answer);
  const label = typeof answer === 'boolean' ? answer ? 'Đúng' : 'Chưa đúng'
    : { AGAIN: 'Quên', HARD: 'Khó', GOOD: 'Tốt', EASY: 'Dễ' }[rating];
  if (rating !== 'AGAIN') {
    if (after === before) return `${label} · lịch ôn giữ nguyên`;
    if (after.status === 'MASTERED') return `${label} · thẻ đã thông suốt`;
    return `${label} · ${reviewStatus(after, today).label.toLowerCase()}`;
  }
  const repeated = Boolean(chosen) && chosen === (before.userChoice || optionLetter(before.userMistake));
  return `${repeated ? 'Vẫn nhầm như lần trước' : label} · ôn lại ngày mai`;
}
