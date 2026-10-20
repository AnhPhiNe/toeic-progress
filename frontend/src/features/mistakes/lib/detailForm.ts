import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { learnerMistake, parsePastedQuestion, type ChoiceLetter, type MistakeInput } from './mistakeInput';
import { optionLetter } from './userChoice';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';

/** Shared by the phone and computer screens that fill in a logged test's wrong questions. */
export type Choice = ChoiceLetter | 'BLANK' | '';
/** What the learner has filled in for one card; `ai` holds what a screenshot reading returned. */
export interface CardForm { raw: string; choice: Choice; answer: ChoiceLetter | ''; category: ErrorCategory | ''; ai?: AIMistakeParseResult }
export const EMPTY_FORM: CardForm = { raw: '', choice: '', answer: '', category: '' };

/** What the explanation request sends for a question read from a screenshot (must match what was read). */
export function explainInput(draft: AIMistakeParseResult, part: MistakeEntry['part']): MistakeInput {
  const choice = draft.userChoice || '';
  return { question: draft.question ?? '', options: draft.options, context: draft.context ?? '', part,
    userChoiceState: choice ? 'CHOSEN' : 'UNKNOWN', userChoice: choice, userReason: '',
    sourceAnswer: draft.answerSource === 'PROVIDED' ? optionLetter(draft.correctAnswer) : '' };
}

/** A question can be explained with the reading's ticket when the page gave its text and options. */
export function canExplainRead(draft: AIMistakeParseResult, part: MistakeEntry['part']): boolean {
  return part !== 1 && Boolean(draft.question?.trim()) && draft.options.length >= 2;
}

export function fromAI(draft: AIMistakeParseResult): CardForm {
  const answer = draft.answerSource === 'MISSING' ? '' : optionLetter(draft.correctAnswer);
  return { raw: '', choice: draft.userChoiceState === 'CHOSEN' && draft.userChoice ? draft.userChoice : '', answer: answer || '', category: draft.explanation ? draft.category : '', ai: draft };
}

/** An explanation that arrives while the card is still open: fill what the learner has not set. */
export function withArrivedExplanation(current: CardForm, draft: AIMistakeParseResult): CardForm {
  if (!current.ai) return current;
  const answer = current.answer || (draft.answerSource === 'MISSING' ? '' : optionLetter(draft.correctAnswer));
  const pageAnswer = current.ai.answerSource !== 'MISSING';
  return { ...current, category: current.category || draft.category, answer,
    ai: { ...current.ai, explanation: draft.explanation, optionNotes: draft.optionNotes, trapTip: draft.trapTip, tags: draft.tags, answerDoubt: draft.answerDoubt,
      ...(pageAnswer ? {} : { correctAnswer: draft.correctAnswer, answerSource: draft.answerSource }) } };
}

/** AI's different answer while the learner still has the page's one; cleared by switching or by keeping the page's. */
export function openDoubt(value: CardForm): ChoiceLetter | '' {
  const doubt = value.ai?.answerDoubt;
  return doubt && value.answer && doubt !== value.answer ? doubt : '';
}

/** Nothing filled in yet, so saving would not change the card. */
export function isEmptyForm(value: CardForm): boolean {
  return !value.ai && !value.raw.trim() && !value.choice && !value.answer && !value.category;
}

/** The saved card, or a message saying what to fix. */
export function buildDetailEntry(target: MistakeEntry, value: CardForm): MistakeEntry | string {
  const pasted = !value.ai && value.raw.trim() ? parsePastedQuestion(value.raw, target.part) : null;
  if (pasted?.error) return pasted.error;
  if (value.choice && value.choice === value.answer) return 'Đáp án bạn chọn trùng đáp án đúng.';
  if (isEmptyForm(value)) return 'Điền ít nhất một mục, hoặc bấm Bỏ qua.';
  const options = value.ai?.options ?? pasted?.options ?? target.options ?? [];
  const question = value.ai ? value.ai.question ?? '' : pasted?.question ?? target.question ?? '';
  const context = value.ai ? value.ai.context ?? '' : target.context ?? '';
  const chosen = value.choice === 'BLANK' || value.choice === '' ? undefined : value.choice;
  const state = value.choice === 'BLANK' ? 'BLANK' : chosen ? 'CHOSEN' : target.userChoiceState ?? 'UNKNOWN';
  const aiLetter = value.ai && value.ai.answerSource !== 'MISSING' ? optionLetter(value.ai.correctAnswer) : '';
  const answerFields = value.answer
    ? { correctAnswer: options.find(option => option.startsWith(`(${value.answer})`)) ?? `(${value.answer})`,
        ...(value.ai && aiLetter === value.answer ? { answerSource: value.ai.answerSource, answerProvidedBy: value.ai.answerSource === 'PROVIDED' ? 'SOURCE' as const : undefined }
          : { answerSource: 'PROVIDED' as const, answerProvidedBy: value.ai ? 'LEARNER' as const : 'SOURCE' as const }) }
    : value.ai ? { correctAnswer: '', answerSource: 'MISSING' as const } : {};
  return {
    ...target, question, context, questionContext: [question, context].filter(Boolean).join('\n\n'), options,
    userChoice: state === 'CHOSEN' ? chosen ?? target.userChoice : undefined, userChoiceState: state,
    userMistake: learnerMistake({ userChoiceState: state, userChoice: chosen ?? target.userChoice ?? '', userReason: target.userReason ?? '', options }),
    ...answerFields,
    ...(value.ai ? { optionNotes: value.ai.optionNotes, explanation: value.ai.explanation ?? undefined, trapTip: value.ai.trapTip, tags: value.ai.tags } : {}),
    answerDoubt: openDoubt(value) || undefined,
    category: value.category || target.category
  };
}
