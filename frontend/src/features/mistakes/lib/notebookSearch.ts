import type { MistakeEntry } from '@/shared/types';
import { compareReviewPriority, isDueForReview } from './spacedRepetition';

/** Sổ tay search: the card's own text, the learner's note and Sóc's explanation, ignoring case. */
export function matchesSearch(m: MistakeEntry, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const ex = m.explanation;
  return [m.question, m.questionContext, m.context, m.userMistake, m.userReason, m.correctAnswer, m.trapTip, m.sourceTestName, ...(m.tags ?? []),
    ex?.quickTip, ex?.analysis, ex?.evidence, ex?.paraphrase, ex?.translation, ex?.keyVocabulary]
    .some(value => typeof value === 'string' && value.toLowerCase().includes(q));
}

/** Due cards first, longest overdue on top (the review queue order); the others keep their order. */
export function dueFirst<T extends MistakeEntry>(cards: readonly T[], today?: string): T[] {
  const due = cards.filter(m => isDueForReview(m, today)).sort(compareReviewPriority);
  return [...due, ...cards.filter(m => !isDueForReview(m, today))];
}
