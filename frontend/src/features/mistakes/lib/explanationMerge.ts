import type { MistakeEntry } from '@/shared/types';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { optionLetter } from './userChoice';

/**
 * Adds an AI explanation to a card without overriding what the learner or the test page already gave:
 * the answer is only filled when missing, the error type only when still "Khác", tags only when empty.
 */
export function mergeExplanation(card: MistakeEntry, draft: AIMistakeParseResult): MistakeEntry {
  const answer = (card.answerSource === 'MISSING' || !card.correctAnswer.trim()) && draft.answerSource !== 'MISSING'
    ? { correctAnswer: draft.correctAnswer, answerSource: draft.answerSource } : {};
  // AI disagrees with the answer the page gave: keep the page's answer but let the learner check it.
  const doubt = draft.answerDoubt && card.answerSource === 'PROVIDED' && optionLetter(card.correctAnswer) !== draft.answerDoubt
    ? { answerDoubt: draft.answerDoubt } : {};
  return {
    ...card, explanation: draft.explanation ?? undefined, optionNotes: draft.optionNotes, trapTip: draft.trapTip,
    tags: card.tags.length ? card.tags : draft.tags, category: card.category === 'OTHER' ? draft.category : card.category, ...answer, ...doubt
  };
}
