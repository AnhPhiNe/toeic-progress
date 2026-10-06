import { MistakeEntry, ErrorCategory, ERROR_CATEGORY_LABELS } from '@/shared/types';
import { getTodayDateString } from '@/shared/data/storage';

/**
 * Một lần tái phạm: nhóm lỗi đã từng được đánh dấu thông suốt, rồi lại sai.
 *
 * Không web luyện đề nào phát hiện được điều này, kể cả về nguyên tắc, vì nó
 * đòi hỏi lịch sử lỗi xuyên nhiều nguồn đề trong nhiều tháng (SPEC 1.4 điểm 2).
 */
export interface RelapseSignal {
  category: ErrorCategory;
  label: string;
  /** Ngày gần nhất người học đánh dấu một thẻ nhóm này là thông suốt */
  masteredAt: string;
  daysSinceMastered: number;
  /** Các thẻ đã thông suốt của nhóm - ứng viên để hạ về ôn lại */
  masteredEntries: MistakeEntry[];
  /** Lỗi mới thuộc nhóm này, ghi SAU ngày trên */
  relapsedEntries: MistakeEntry[];
}

/** Ngày (YYYY-MM-DD) mà một thẻ được coi là đã thông suốt */
function masteryDateOf(m: MistakeEntry): string {
  return m.lastReviewedAt || (m.createdAt || '').slice(0, 10);
}

function daysBetween(fromStr: string, toStr: string): number {
  if (!fromStr || !toStr) return 0;
  const from = new Date(`${fromStr}T00:00:00`).getTime();
  const to = new Date(`${toStr}T00:00:00`).getTime();
  return Math.max(0, Math.round((to - from) / (1000 * 60 * 60 * 24)));
}

/**
 * Tìm các nhóm lỗi bị tái phạm.
 *
 * Mốc so sánh là lần đánh dấu thông suốt GẦN NHẤT của nhóm, không phải lần
 * đầu tiên. Đây là cách siết chặt nhất: chỉ báo động khi người học đã tuyên
 * bố nắm vững rồi mà vẫn sai tiếp, nên hầu như không có báo động giả.
 */
export function detectRelapses(
  mistakes: MistakeEntry[],
  today = getTodayDateString()
): RelapseSignal[] {
  const byCategory = new Map<ErrorCategory, MistakeEntry[]>();
  for (const m of mistakes) {
    const c = m.category || 'OTHER';
    const list = byCategory.get(c);
    if (list) list.push(m);
    else byCategory.set(c, [m]);
  }

  const signals: RelapseSignal[] = [];

  for (const [category, entries] of byCategory) {
    const mastered = entries.filter(m => m.status === 'MASTERED');
    if (mastered.length === 0) continue;

    // Mốc: lần tuyên bố thông suốt gần nhất của nhóm này
    const masteredAt = mastered
      .map(masteryDateOf)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    if (!masteredAt) continue;

    const relapsed = entries.filter(
      m => m.status === 'NEEDS_REVIEW' && (m.createdAt || '').slice(0, 10) > masteredAt
    );
    if (relapsed.length === 0) continue;

    signals.push({
      category,
      label: (ERROR_CATEGORY_LABELS[category] || ERROR_CATEGORY_LABELS.OTHER).label,
      masteredAt,
      daysSinceMastered: daysBetween(masteredAt, today),
      masteredEntries: mastered,
      relapsedEntries: relapsed
    });
  }

  // Nhiều lỗi tái phạm nhất lên đầu
  return signals.sort((a, b) => b.relapsedEntries.length - a.relapsedEntries.length);
}
