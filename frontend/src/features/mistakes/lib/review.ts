import type { MistakeEntry } from '@/shared/types';
import { getTodayDateString } from '@/shared/data/storage';
import { applyReviewResult, isDueForReview, canReview } from '@/features/mistakes/lib/spacedRepetition';
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
  if (!mistake.nextReviewDate) return { kind: 'due', label: 'Cần ôn' };
  const days = daysBetween(today, mistake.nextReviewDate);
  if (days < 0) return { kind: 'overdue', label: `Quá hạn ${-days} ngày` };
  if (days === 0) return { kind: 'due', label: 'Cần ôn' };
  return { kind: 'scheduled', label: days === 1 ? 'Ôn ngày mai' : `Ôn sau ${days} ngày` };
}

/**
 * Apply one graded answer. A due card follows the spaced schedule. Practising a card
 * early (or a mastered card) only changes it when the answer is wrong, so a card
 * cannot be pushed to "mastered" by answering it several times in one day.
 */
export function gradeReview(mistake: MistakeEntry, correct: boolean, today = getTodayDateString()): MistakeEntry {
  if (!canReview(mistake)) return mistake;
  if (mistake.status !== 'MASTERED' && isDueForReview(mistake, today)) {
    return applyReviewResult(mistake, correct, today);
  }
  if (correct) return mistake;
  return applyReviewResult({ ...mistake, status: 'NEEDS_REVIEW' }, false, today);
}

/** One-line result shown after answering, e.g. "Đúng · ôn sau 3 ngày". */
export function reviewResultText(
  before: MistakeEntry,
  after: MistakeEntry,
  correct: boolean,
  chosen: string,
  today = getTodayDateString()
): string {
  if (correct) {
    if (after === before) return 'Đúng · lịch ôn giữ nguyên';
    if (after.status === 'MASTERED') return 'Đúng · thẻ đã thông suốt';
    return `Đúng · ${reviewStatus(after, today).label.toLowerCase()}`;
  }
  const repeated = Boolean(chosen) && chosen === (before.userChoice || optionLetter(before.userMistake));
  return `${repeated ? 'Vẫn nhầm như lần trước' : 'Chưa đúng'} · ôn lại ngày mai`;
}
