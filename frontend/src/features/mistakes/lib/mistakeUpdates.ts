import type { MistakeEntry } from '@/shared/types';
import { gradeReview } from '@/features/mistakes/lib/review';
import { canReview, type ReviewAnswer } from '@/features/mistakes/lib/spacedRepetition';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = value as Record<string, unknown>;
    // JSON storage omits undefined object fields; their absence is not an external edit.
    return JSON.stringify(Object.keys(fields).filter(key => fields[key] !== undefined).sort().map(key => [key, stable(fields[key])]));
  }
  return JSON.stringify(value) ?? 'undefined';
}

export function reviewContentKey(entry: MistakeEntry): string {
  return stable([entry.part, entry.questionContext, entry.question, entry.context, entry.sourceImageIds, entry.options, entry.correctAnswer, entry.answerSource]);
}

export function gradeLatestMistake(latest: MistakeEntry | undefined, snapshot: MistakeEntry, answer: ReviewAnswer): MistakeEntry {
  if (!latest || !canReview(latest)) throw new Error('Thẻ đã bị xóa hoặc chưa có đáp án. Tải lại thẻ để tiếp tục.');
  if (reviewContentKey(latest) !== reviewContentKey(snapshot)) throw new Error('Nội dung thẻ đã thay đổi. Tải lại thẻ trước khi chấm.');
  return gradeReview(latest, answer);
}

function content(entry: MistakeEntry) {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, deletedAt: _deletedAt, status: _status,
    nextReviewDate: _next, reviewStage: _stage, reviewCount: _count, lastReviewedAt: _last, ...fields } = entry;
  return fields;
}

export function mergeMistakeEdit(latest: MistakeEntry | undefined, snapshot: MistakeEntry, edited: MistakeEntry): MistakeEntry {
  if (!latest || latest.deletedAt) throw new Error('Thẻ đã bị xóa. Nội dung đang nhập được giữ để bạn sao chép.');
  if (stable(content(latest)) !== stable(content(snapshot))) throw new Error('Thẻ đã được sửa ở nơi khác. Tải lại thẻ trước khi lưu.');
  return { ...latest, ...content(edited) };
}
