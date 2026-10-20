import type { MistakeEntry } from '@/shared/types';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { getUserChoice, optionLetter } from './userChoice';
import type { MistakeInput } from './mistakeInput';

/** Includes sync metadata and conservative whitespace overhead from the backend's JSON serializer. */
export function fitsSyncPayload(card: MistakeEntry): boolean {
  return new TextEncoder().encode(JSON.stringify({ ...card, updatedAt: new Date().toISOString(), deletedAt: null }, null, 1)).byteLength <= 32768;
}

/** The wording and learner/source facts used to write a queued explanation must still be current. */
export function sameExplanationInput(current: MistakeInput, original: MistakeInput): boolean {
  return current.part === original.part
    && current.question.trim() === original.question.trim()
    && current.context.trim() === original.context.trim()
    && JSON.stringify(current.options.map(option => option.trim())) === JSON.stringify(original.options.map(option => option.trim()))
    && current.userChoiceState === original.userChoiceState && current.userChoice === original.userChoice
    && current.userReason.trim() === original.userReason.trim() && current.sourceAnswer === original.sourceAnswer
    && (!original.errorCategory || current.errorCategory === original.errorCategory);
}

export function matchesExplanationCard(card: MistakeEntry, original: MistakeInput): boolean {
  if (card.deletedAt) return false;
  const choice = getUserChoice(card);
  return sameExplanationInput({
    question: card.question ?? card.questionContext, context: card.context ?? '', options: card.options ?? [], part: card.part,
    userChoiceState: card.userChoiceState ?? (choice ? 'CHOSEN' : 'UNKNOWN'), userChoice: choice,
    userReason: card.userReason ?? '', sourceAnswer: card.answerSource === 'PROVIDED' ? optionLetter(card.correctAnswer) : '',
    errorCategory: card.category
  }, original);
}

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
