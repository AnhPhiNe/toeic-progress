import type { MistakeEntry, StudySession } from '@/shared/types';
import { normalizeQuestionList, partOfQuestion } from '@/shared/domain/questionNumbers';
import { canReview } from './spacedRepetition';

/** A card waits for content when it cannot be reviewed yet: no question text or no correct answer. */
export function needsSupplement(mistake: MistakeEntry): boolean {
  return !mistake.deletedAt && !canReview(mistake);
}

/** Drafts get a stable id per session and question, so two devices saving the same test create the same card. */
export function draftMistakeId(sessionId: string, question: number): string {
  return `draft:${sessionId}:${question}`;
}

/**
 * Only Reading questions get a draft card. Listening has no audio in the app, and its transcript alone answers the
 * question, so a card would not train listening; its wrong answers still count in the score and per-Part results.
 */
export const DETAIL_FIRST_PART = 5;
const wantsDraft = (question: number) => (partOfQuestion(question) ?? 0) >= DETAIL_FIRST_PART;
/** The wrong questions of a test that get a card in the notebook. */
export const draftQuestions = (session: Pick<StudySession, 'wrongQuestions'>) => normalizeQuestionList(session.wrongQuestions ?? []).filter(wantsDraft);

/** Nothing has been added to the draft yet, so removing it loses no work. */
function untouched(mistake: MistakeEntry): boolean {
  return !mistake.questionContext.trim() && !mistake.question?.trim() && !mistake.context?.trim() && !mistake.sourceImageIds?.length
    && !mistake.userChoice && !mistake.userMistake.trim() && !mistake.correctAnswer.trim() && !mistake.userReason?.trim()
    && !mistake.trapTip?.trim() && !mistake.options?.length && mistake.category === 'OTHER' && !mistake.reviewCount;
}

/** A draft created by logging a test that the learner has not filled in yet; it is not a recorded mistake. */
export function isBlankDraft(mistake: MistakeEntry): boolean {
  return Boolean(mistake.sessionId) && mistake.questionNumber !== undefined && untouched(mistake);
}

/** A blank Listening draft from before Listening stopped getting drafts; kept out of view until the test is saved again. */
export function isRetiredDraft(mistake: MistakeEntry): boolean {
  return isBlankDraft(mistake) && mistake.part < DETAIL_FIRST_PART;
}

export function createDraftMistake(session: Pick<StudySession, 'id' | 'testName'>, question: number, now: string): MistakeEntry {
  const part = partOfQuestion(question);
  if (!part) throw new Error('Số câu phải từ 1 đến 200.');
  return {
    id: draftMistakeId(session.id, question), sessionId: session.id, sourceTestName: session.testName, part, questionNumber: question,
    questionContext: '', question: '', userMistake: '', correctAnswer: '', answerSource: 'MISSING', userChoiceState: 'UNKNOWN',
    category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: now, updatedAt: now, deletedAt: null
  };
}

/**
 * Brings the session's cards in line with its wrong-question list: a card for each new number, and untouched drafts
 * for numbers that are no longer wrong are removed. Cards the learner has worked on are always kept.
 */
export function syncDraftMistakes(session: Pick<StudySession, 'id' | 'testName' | 'wrongQuestions'>, mistakes: MistakeEntry[], now = new Date().toISOString()) {
  const wrong = new Set(draftQuestions(session));
  const linked = mistakes.filter(mistake => !mistake.deletedAt && mistake.sessionId === session.id && mistake.questionNumber !== undefined);
  const covered = new Set(linked.map(mistake => mistake.questionNumber));
  const add = [...wrong].filter(question => !covered.has(question)).map(question => createDraftMistake(session, question, now));
  const removeIds = linked.filter(mistake => !wrong.has(mistake.questionNumber!) && untouched(mistake)).map(mistake => mistake.id);
  return { add, removeIds };
}

/** The drafts of one session in question order, for the "ghi chi tiết" flow. */
export function sessionDrafts(sessionId: string, mistakes: MistakeEntry[]): MistakeEntry[] {
  return mistakes.filter(mistake => mistake.sessionId === sessionId && mistake.questionNumber !== undefined && needsSupplement(mistake) && !isRetiredDraft(mistake))
    .sort((a, b) => a.questionNumber! - b.questionNumber!);
}

/** The notebook after `syncDraftMistakes`: new drafts first, untouched drafts that are no longer wrong dropped. */
export function applyDraftSync(session: Pick<StudySession, 'id' | 'testName' | 'wrongQuestions'>, mistakes: MistakeEntry[], now?: string): MistakeEntry[] {
  const { add, removeIds } = syncDraftMistakes(session, mistakes, now);
  if (!add.length && !removeIds.length) return mistakes;
  const removed = new Set(removeIds);
  return [...add, ...mistakes.filter(mistake => !removed.has(mistake.id))];
}
