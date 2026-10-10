import type { StudySession } from '@/shared/types';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = value as Record<string, unknown>;
    return JSON.stringify(Object.keys(fields).filter(key => fields[key] !== undefined).sort().map(key => [key, stable(fields[key])]));
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Check the opened record against storage before replacing any editable fields. */
export function mergeSessionEdit(latest: StudySession | undefined, original: StudySession, edited: StudySession): StudySession {
  if (!latest || latest.deletedAt) throw new Error('Buổi học đã bị xóa. Nội dung đang nhập được giữ để bạn sao chép.');
  if (latest.id !== original.id || edited.id !== original.id || stable(latest) !== stable(original)) {
    throw new Error('Buổi học đã được sửa ở nơi khác. Hãy đóng và mở lại bản mới nhất trước khi lưu.');
  }
  // A total-only edit must remove old section scores; unknown imported metadata survives.
  const retained = { ...latest };
  for (const key of ['skillType', 'sessionType', 'testName', 'date', 'durationMinutes', 'attemptNumber', 'notes', 'partScores', 'practiceParts',
    'rawListening', 'rawReading', 'scaledListening', 'scaledReading', 'totalScore', 'scoreSource', 'scoreConversionVersion'] as const) {
    delete (retained as Partial<StudySession>)[key];
  }
  return { ...retained, ...edited, id: latest.id, createdAt: latest.createdAt };
}
