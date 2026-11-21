import { MistakeEntry } from '@/shared/types';
import { getTodayDateString } from '@/shared/data/storage';

/**
 * Bậc giãn cách theo SPEC mục 4.6: nhớ thì giãn ra, quên thì quay về bậc đầu.
 * Chỉ số mảng là bậc hiện tại, giá trị là số ngày tới lần ôn kế tiếp.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;
export const MAX_REVIEW_STAGE = REVIEW_INTERVALS_DAYS.length - 1;

/** Four recall choices; booleans retain the original quiz-answer behaviour. */
export type ReviewRating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
export type ReviewAnswer = boolean | ReviewRating;
export function normalizeReviewRating(answer: ReviewAnswer): ReviewRating {
  return typeof answer === 'boolean' ? answer ? 'GOOD' : 'AGAIN' : answer;
}

/**
 * Map self-check buttons + quiz pick onto an SRS rating.
 * Choosing a wrong quiz option always schedules AGAIN (tomorrow): understanding an explanation
 * passively after a miss must still be verified by active recall on the next day.
 */
export function reviewRating(understood: boolean, picked: string | null, answer: string): ReviewRating {
  if (!understood) return 'AGAIN';
  if (picked !== null && picked !== answer) return 'AGAIN';
  return 'GOOD';
}

function boundedReviewStage(stage: number | undefined): number {
  return typeof stage === 'number' && Number.isFinite(stage)
    ? Math.max(0, Math.min(MAX_REVIEW_STAGE, Math.floor(stage))) : 0;
}

export function canReview(mistake: MistakeEntry): boolean {
  const hasQuestion = mistake.question !== undefined ? Boolean(mistake.question.trim()) : Boolean(mistake.questionContext?.trim());
  return !mistake.deletedAt && hasQuestion && mistake.answerSource !== 'MISSING' && Boolean(mistake.correctAnswer?.trim());
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Một lỗi đến hạn ôn khi chưa thông suốt VÀ đã tới ngày hẹn.
 * Bản ghi cũ chưa có lịch thì coi như đến hạn ngay - không cần migrate.
 */
export function isDueForReview(mistake: MistakeEntry, today = getTodayDateString()): boolean {
  if (!canReview(mistake) || mistake.status === 'MASTERED') return false;
  if (!mistake.nextReviewDate) return true;
  return mistake.nextReviewDate <= today;
}

/** Keep the same queue priority for all-card and explicitly selected review sessions. */
export function compareReviewPriority(a: MistakeEntry, b: MistakeEntry): number {
  const aDate = a.nextReviewDate || '';
  const bDate = b.nextReviewDate || '';
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return (a.createdAt || '').localeCompare(b.createdAt || '');
}

/**
 * Danh sách thẻ cần ôn, quá hạn lâu nhất lên trước (SPEC mục 4.6).
 * Thẻ chưa có lịch xếp trước thẻ đã có, vì chúng chưa từng được ôn lần nào.
 */
export function getDueMistakes(mistakes: MistakeEntry[], today = getTodayDateString()): MistakeEntry[] {
  return mistakes
    .filter(m => isDueForReview(m, today))
    .sort(compareReviewPriority);
}

/**
 * Áp kết quả tự chấm của một lần ôn lên bản ghi.
 * A small, bounded schedule, not an implementation of SM-2 or FSRS:
 * AGAIN resets for tomorrow; HARD keeps the stage with a shorter interval;
 * GOOD advances one stage; EASY advances two. Passing the final stage masters.
 */
export function applyReviewResult(
  mistake: MistakeEntry,
  answer: ReviewAnswer,
  today = getTodayDateString()
): MistakeEntry {
  const currentStage = boundedReviewStage(mistake.reviewStage);
  const reviewCount = (mistake.reviewCount ?? 0) + 1;
  const lastReviewedAt = new Date().toISOString();
  const rating = normalizeReviewRating(answer);

  if (rating === 'AGAIN') {
    return {
      ...mistake,
      status: 'NEEDS_REVIEW',
      reviewStage: 0,
      reviewCount,
      lastReviewedAt,
      nextReviewDate: addDays(today, REVIEW_INTERVALS_DAYS[0])
    };
  }

  if (rating === 'HARD') {
    return {
      ...mistake,
      status: 'NEEDS_REVIEW',
      reviewStage: currentStage,
      reviewCount,
      lastReviewedAt,
      nextReviewDate: addDays(today, Math.max(1, Math.ceil(REVIEW_INTERVALS_DAYS[currentStage] / 2)))
    };
  }

  const nextStage = currentStage + (rating === 'EASY' ? 2 : 1);
  if (nextStage > MAX_REVIEW_STAGE) {
    return {
      ...mistake,
      status: 'MASTERED',
      reviewStage: MAX_REVIEW_STAGE,
      reviewCount,
      lastReviewedAt,
      nextReviewDate: undefined
    };
  }

  return {
    ...mistake,
    status: 'NEEDS_REVIEW',
    reviewStage: nextStage,
    reviewCount,
    lastReviewedAt,
    nextReviewDate: addDays(today, REVIEW_INTERVALS_DAYS[nextStage])
  };
}

/** Nhãn mô tả bậc hiện tại, để người học thấy mình đang ở đâu trong lịch */
export function getStageLabel(mistake: MistakeEntry): string {
  if (mistake.status === 'MASTERED') return 'Đã thông suốt';
  const stage = boundedReviewStage(mistake.reviewStage);
  if (!mistake.lastReviewedAt) return 'Chưa ôn lần nào';
  // HARD can use a different interval at the same stage, so show the actual date.
  const due = mistake.nextReviewDate?.split('-').reverse().join('/');
  return `Bậc ${stage + 1}/${REVIEW_INTERVALS_DAYS.length}${due ? ` · hẹn ${due}` : ''}`;
}
