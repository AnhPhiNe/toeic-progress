import { MistakeEntry } from '@/shared/types';
import { getTodayDateString } from '@/shared/data/storage';

/**
 * Bậc giãn cách theo SPEC mục 4.6: nhớ thì giãn ra, quên thì quay về bậc đầu.
 * Chỉ số mảng là bậc hiện tại, giá trị là số ngày tới lần ôn kế tiếp.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;
export const MAX_REVIEW_STAGE = REVIEW_INTERVALS_DAYS.length - 1;

export function canReview(mistake: MistakeEntry): boolean {
  return !mistake.deletedAt && mistake.answerSource !== 'MISSING' && Boolean(mistake.correctAnswer.trim());
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
 * Nhớ: lên một bậc, hẹn xa hơn. Hết bậc mà vẫn nhớ thì coi như thông suốt.
 * Quên: về bậc đầu, hẹn lại ngày mai.
 */
export function applyReviewResult(
  mistake: MistakeEntry,
  remembered: boolean,
  today = getTodayDateString()
): MistakeEntry {
  const currentStage = mistake.reviewStage ?? 0;
  const reviewCount = (mistake.reviewCount ?? 0) + 1;
  const lastReviewedAt = new Date().toISOString();

  if (!remembered) {
    return {
      ...mistake,
      status: 'NEEDS_REVIEW',
      reviewStage: 0,
      reviewCount,
      lastReviewedAt,
      nextReviewDate: addDays(today, REVIEW_INTERVALS_DAYS[0])
    };
  }

  // Đã ở bậc cuối mà vẫn nhớ: tốt nghiệp khỏi lịch ôn
  if (currentStage >= MAX_REVIEW_STAGE) {
    return {
      ...mistake,
      status: 'MASTERED',
      reviewStage: MAX_REVIEW_STAGE,
      reviewCount,
      lastReviewedAt,
      nextReviewDate: undefined
    };
  }

  const nextStage = currentStage + 1;
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
  const stage = mistake.reviewStage ?? 0;
  if (!mistake.lastReviewedAt) return 'Chưa ôn lần nào';
  return `Bậc ${stage + 1}/${REVIEW_INTERVALS_DAYS.length} · hẹn ${REVIEW_INTERVALS_DAYS[stage]} ngày`;
}
