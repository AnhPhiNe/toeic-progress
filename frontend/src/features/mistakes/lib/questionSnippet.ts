import type { MistakeEntry } from '@/shared/types';
import { findFocus } from './passageFocus';

/** "Câu 18", "Câu 18 Part 2", "131." — a question that only repeats its number and Part, already shown by the chips. */
export function isNumberLabel(text: string | null | undefined): boolean {
  return /^\s*(câu|question|q)?\s*\d{1,3}\s*[,.:·-]?\s*(part\s*\d)?\s*[.:]?\s*$/i.test(text ?? '');
}

type SnippetSource = Pick<MistakeEntry, 'question' | 'questionContext' | 'correctAnswer'> & Partial<Pick<MistakeEntry, 'part' | 'context' | 'questionNumber'>>;

/**
 * First non-empty line of the question (or its context), for list rows; falls back to the correct answer.
 * A Part 6 card whose question is only "Câu 131" shows the passage sentence holding its blank instead.
 */
export function questionSnippet(m: SnippetSource): string {
  const first = [m.question, m.questionContext].map(text => (text ?? '').split(/\r?\n/).map(part => part.trim()).find(Boolean)).find(Boolean) ?? '';
  const context = m.context?.trim() ?? '';
  if (m.part === 6 && context && (!first || isNumberLabel(first))) {
    const range = findFocus(context, { part: 6, number: m.questionNumber });
    const sentence = range ? context.slice(range.start, range.end).replace(/\s+/g, ' ').trim() : '';
    if (sentence) return sentence;
  }
  return first || m.correctAnswer?.trim() || 'Câu sai';
}
