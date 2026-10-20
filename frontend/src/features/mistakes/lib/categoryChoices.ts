import type { ErrorCategory } from '@/shared/types';

/** Short labels for choosing why a question went wrong. */
export const CATEGORY_CHOICES: Record<ErrorCategory, string> = {
  VOCABULARY_TRAP: 'Từ vựng / Paraphrase', ADVANCED_GRAMMAR: 'Ngữ pháp',
  LISTENING_SPEED: 'Nghe / Nối âm', TIME_PRESSURE: 'Thiếu thời gian',
  CARELESS_DISTRACTION: 'Mất tập trung / Đọc ẩu', OTHER: 'Khác',
};
