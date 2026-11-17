import type { MistakeEntry } from '@/shared/types';

/** First non-empty line of the question (or its context), for list rows; falls back to the correct answer. */
export function questionSnippet(m: Pick<MistakeEntry, 'question' | 'questionContext' | 'correctAnswer'>): string {
  for (const text of [m.question, m.questionContext]) {
    const line = (text ?? '').split(/\r?\n/).map(part => part.trim()).find(Boolean);
    if (line) return line;
  }
  return m.correctAnswer?.trim() || 'Câu sai';
}
