import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { learnerMistake, parsePastedQuestion, type ChoiceLetter, type MistakeInput } from './mistakeInput';
import { optionLetter } from './userChoice';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { fitsSyncPayload } from './explanationMerge';

/** Shared by the phone and computer screens that fill in a logged test's wrong questions. */
export type Choice = ChoiceLetter | 'BLANK' | '';
/** What the learner has filled in for one card; `ai` holds what a screenshot reading returned. */
type EditableField = 'raw' | 'choice' | 'answer' | 'category';
export interface CardForm { raw: string; choice: Choice; answer: ChoiceLetter | ''; category: ErrorCategory | ''; ai?: AIMistakeParseResult;
  /** Includes explicit clearing: an empty value is still the learner's decision. */
  touched?: Partial<Record<EditableField, boolean>> }
export const EMPTY_FORM: CardForm = { raw: '', choice: '', answer: '', category: '' };

/** Reopening a partially saved row restores its source and confirmed fields. */
export function savedDetailForm(card: MistakeEntry): CardForm {
  const choice = card.userChoiceState === 'BLANK' ? 'BLANK' : card.userChoice ?? '';
  const answer = optionLetter(card.correctAnswer) || '';
  const ai: AIMistakeParseResult | undefined = card.question?.trim() && card.options?.length ? {
    part: card.part, question: card.question, context: card.context ?? '', questionContext: card.questionContext,
    options: card.options, correctAnswer: card.correctAnswer, answerSource: card.answerSource ?? (answer ? 'PROVIDED' : 'MISSING'),
    userChoice: card.userChoice ?? '', userChoiceState: card.userChoiceState, userReason: card.userReason, userMistake: card.userMistake,
    category: card.category, tags: card.tags, trapTip: card.trapTip ?? '', explanation: card.explanation ?? null,
    optionNotes: card.optionNotes ?? [], missingInformation: [], answerDoubt: card.answerDoubt
  } : undefined;
  return { raw: '', choice, answer, category: card.category === 'OTHER' ? '' : card.category, ai,
    touched: { ...(choice ? { choice: true } : {}),
      ...(answer && card.answerSource !== 'AI_PROPOSED' ? { answer: true } : {}) } };
}

export function editDetailForm(current: CardForm, patch: Partial<CardForm>): CardForm {
  const touched = { ...current.touched };
  for (const field of ['raw', 'choice', 'answer', 'category'] as const) if (Object.prototype.hasOwnProperty.call(patch, field)) touched[field] = true;
  const next = { ...current, ...patch, touched };
  if (current.ai && (['raw', 'choice', 'answer'] as const).some(field => Object.prototype.hasOwnProperty.call(patch, field) && patch[field] !== current[field])) {
    next.ai = { ...current.ai, explanation: null, optionNotes: [], trapTip: '', tags: [], answerDoubt: '' };
    if (!touched.category) next.category = '';
  }
  return next;
}

/** Screenshot defaults only fill fields the learner has never edited. */
export function withReadResult(current: CardForm, draft: AIMistakeParseResult): CardForm {
  const next = fromAI(draft);
  for (const field of ['raw', 'choice', 'answer', 'category'] as const) {
    if (current.touched?.[field] || current[field]) Object.assign(next, { [field]: current[field] });
  }
  return { ...next, touched: current.touched };
}

/** What the explanation request sends for a question read from a screenshot (must match what was read). */
export function explainInput(draft: AIMistakeParseResult, part: MistakeEntry['part']): MistakeInput {
  const choice = draft.userChoice || '';
  return { question: draft.question ?? '', options: draft.options, context: draft.context ?? '', part,
    userChoiceState: draft.userChoiceState === 'BLANK' ? 'BLANK' : choice ? 'CHOSEN' : 'UNKNOWN', userChoice: choice, userReason: draft.userReason ?? '',
    sourceAnswer: draft.answerSource === 'PROVIDED' ? optionLetter(draft.correctAnswer) : '' };
}

/** The effective form input, so a response for an earlier choice/key is never presented as current. */
export function detailExplanationInput(form: CardForm, part: MistakeEntry['part']): MistakeInput | null {
  if (!form.ai) return null;
  const input = explainInput(form.ai, part);
  if (form.touched?.raw && form.raw.trim()) {
    const parsed = parsePastedQuestion(form.raw, part);
    if (parsed.error) return null;
    input.question = parsed.question; input.options = parsed.options;
  }
  if (form.touched?.choice) {
    input.userChoice = form.choice === 'BLANK' ? '' : form.choice;
    input.userChoiceState = form.choice === 'BLANK' ? 'BLANK' : form.choice ? 'CHOSEN' : 'UNKNOWN';
  }
  if (form.touched?.answer) input.sourceAnswer = form.answer;
  return input;
}

/** A question can be explained with the reading's ticket when the page gave its text and options. */
export function canExplainRead(draft: AIMistakeParseResult, part: MistakeEntry['part']): boolean {
  return part !== 1 && Boolean(draft.question?.trim()) && draft.options.length >= 2;
}

export function fromAI(draft: AIMistakeParseResult): CardForm {
  const answer = draft.answerSource === 'MISSING' ? '' : optionLetter(draft.correctAnswer);
  return { raw: '', choice: draft.userChoiceState === 'BLANK' ? 'BLANK' : draft.userChoiceState === 'CHOSEN' && draft.userChoice ? draft.userChoice : '', answer: answer || '', category: draft.explanation ? draft.category : '', ai: draft };
}

/** An explanation that arrives while the card is still open: fill what the learner has not set. */
export function withArrivedExplanation(current: CardForm, draft: AIMistakeParseResult): CardForm {
  if (!current.ai) return current;
  const answer = current.touched?.answer ? current.answer : current.answer || (draft.answerSource === 'MISSING' ? '' : optionLetter(draft.correctAnswer));
  const pageAnswer = current.ai.answerSource !== 'MISSING';
  return { ...current, category: current.touched?.category ? current.category : current.category || draft.category, answer,
    ai: { ...current.ai, explanation: draft.explanation, optionNotes: draft.optionNotes, trapTip: draft.trapTip, tags: draft.tags, answerDoubt: draft.answerDoubt,
      ...(pageAnswer ? {} : { correctAnswer: draft.correctAnswer, answerSource: draft.answerSource }) } };
}

/** AI's different answer while the learner still has the page's one; cleared by switching or by keeping the page's. */
export function openDoubt(value: CardForm): ChoiceLetter | '' {
  const doubt = value.ai?.answerDoubt;
  return doubt && value.answer && doubt !== value.answer ? doubt : '';
}

/** True when the learner's choice matches the right answer (e.g. an ungraded page solved by AI). */
export function isRightForm(value: CardForm | undefined): boolean {
  return Boolean(value && value.choice && value.choice !== 'BLANK' && value.answer && value.choice === value.answer);
}

/** Nothing filled in yet, so saving would not change the card. */
export function isEmptyForm(value: CardForm): boolean {
  return !value.ai && !value.raw.trim() && !value.choice && !value.answer && !value.category && !Object.keys(value.touched ?? {}).length;
}

/** The saved card, or a message saying what to fix. */
export function buildDetailEntry(target: MistakeEntry, value: CardForm): MistakeEntry | string {
  const pasted = value.raw.trim() ? parsePastedQuestion(value.raw, target.part) : null;
  if (pasted?.error) return pasted.error;
  if (value.choice && value.choice === value.answer) return 'Đáp án bạn chọn trùng đáp án đúng.';
  if (isEmptyForm(value)) return 'Điền ít nhất một mục, hoặc bấm Bỏ qua.';
  const options = pasted?.options ?? value.ai?.options ?? target.options ?? [];
  const question = pasted?.question ?? (value.ai ? value.ai.question ?? '' : target.question ?? '');
  const context = value.ai ? value.ai.context ?? '' : target.context ?? '';
  const chosen = value.choice === 'BLANK' || value.choice === '' ? undefined : value.choice;
  const state = value.choice === 'BLANK' ? 'BLANK' : chosen ? 'CHOSEN' : value.touched?.choice ? 'UNKNOWN' : target.userChoiceState ?? 'UNKNOWN';
  const aiLetter = value.ai && value.ai.answerSource !== 'MISSING' ? optionLetter(value.ai.correctAnswer) : '';
  const answerFields = value.answer
    ? { correctAnswer: options.find(option => option.startsWith(`(${value.answer})`)) ?? `(${value.answer})`,
        ...(value.ai && aiLetter === value.answer ? { answerSource: value.ai.answerSource, answerProvidedBy: value.ai.answerSource === 'PROVIDED' ? 'SOURCE' as const : undefined }
          : { answerSource: 'PROVIDED' as const, answerProvidedBy: value.ai ? 'LEARNER' as const : 'SOURCE' as const }) }
    : value.ai || value.touched?.answer ? { correctAnswer: '', answerSource: 'MISSING' as const, answerProvidedBy: undefined } : {};
  const entry: MistakeEntry = {
    ...target, question, context, questionContext: [question, context].filter(Boolean).join('\n\n'), options,
    userChoice: state === 'CHOSEN' ? chosen ?? target.userChoice : undefined, userChoiceState: state,
    userMistake: learnerMistake({ userChoiceState: state, userChoice: chosen ?? target.userChoice ?? '', userReason: target.userReason ?? '', options }),
    ...answerFields,
    ...(value.ai ? { optionNotes: value.ai.optionNotes, explanation: value.ai.explanation ?? undefined, trapTip: value.ai.trapTip, tags: value.ai.tags } : {}),
    answerDoubt: openDoubt(value) || undefined,
    category: value.category || (value.touched?.category ? 'OTHER' : target.category)
  };
  return fitsSyncPayload(entry) ? entry : 'Nội dung câu này quá dài để đồng bộ. Hãy rút gọn phần giải thích hoặc chia nội dung thành thẻ riêng; nội dung đang nhập vẫn được giữ.';
}
