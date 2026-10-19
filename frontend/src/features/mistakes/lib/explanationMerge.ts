import type { MistakeEntry } from '@/shared/types';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';

/**
 * Adds an AI explanation to a card without overriding what the learner or the test page already gave:
 * the answer is only filled when missing, the error type only when still "Khác", tags only when empty.
 */
export function mergeExplanation(card: MistakeEntry, draft: AIMistakeParseResult): MistakeEntry {
  const answer = (card.answerSource === 'MISSING' || !card.correctAnswer.trim()) && draft.answerSource !== 'MISSING'
    ? { correctAnswer: draft.correctAnswer, answerSource: draft.answerSource } : {};
  return {
    ...card, explanation: draft.explanation ?? undefined, optionNotes: draft.optionNotes, trapTip: draft.trapTip,
    tags: card.tags.length ? card.tags : draft.tags, category: card.category === 'OTHER' ? draft.category : card.category, ...answer
  };
}
