import type { ErrorCategory, MistakeEntry, StudySession } from '@/shared/types';
import { generateUUID } from '@/shared/domain/uuid';
import { draftQuestions, isBlankDraft } from '@/features/mistakes/lib/mistakeDrafts';
import { learnerMistake, type ChoiceLetter, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { normalizeTestName, testNameKey } from '@/features/mistakes/lib/sourceTests';
import { DEFAULT_QUESTIONS } from '@/features/mistakes/lib/captureBatch';
import { normalizeQuestionList, partOfQuestion, questionsOfPart, type PartNumber } from '@/shared/domain/questionNumbers';

/**
 * The questions one capture of a Part looks for: the learner's logged wrong ones in that Part (one passage/audio group
 * when a group is chosen), or the whole Part (or group) when the test has no wrong list there.
 */
export function captureQuestions(plan: { questions: number[]; logged: boolean }, part: PartNumber, group?: { from: number; to: number } | null): number[] {
  const inPart = plan.logged ? plan.questions.filter(number => partOfQuestion(number) === part) : [];
  const inGroup = group ? inPart.filter(number => number >= group.from && number <= group.to) : inPart;
  if (inGroup.length) return inGroup;
  return group ? Array.from({ length: group.to - group.from + 1 }, (_, index) => group.from + index) : questionsOfPart(part);
}

const newestFirst = (a: StudySession, b: StudySession) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '');

/** The test the learner most likely did last: the latest Full Test, else the latest session that has a test name. */
export function latestTestName(sessions: readonly StudySession[]): string {
  const named = sessions.filter(session => !session.deletedAt && normalizeTestName(session.testName)).sort(newestFirst);
  const latest = named.find(session => session.sessionType === 'FULL_TEST') ?? named[0];
  return latest ? normalizeTestName(latest.testName) : '';
}

/** The latest logged session of a test (a retake counts: the newest list wins). */
export function loggedSession(sessions: readonly StudySession[], testName: string): StudySession | undefined {
  const key = testNameKey(testName);
  return sessions.filter(session => !session.deletedAt && testNameKey(session.testName) === key).sort(newestFirst)
    .find(session => (session.wrongQuestions?.length ?? 0) > 0 || draftQuestions(session).length > 0);
}

/** The newest saved session with this test name (any kind), to link a hand-typed note to the test it came from. */
export function sessionIdForTest(sessions: readonly StudySession[], testName: string): string | undefined {
  const key = testNameKey(testName);
  return key ? sessions.filter(session => !session.deletedAt && testNameKey(session.testName) === key).sort(newestFirst)[0]?.id : undefined;
}

/**
 * Wrong questions the learner logged for this test (all Parts 1–7) that have not been recorded yet,
 * or open capture when none was logged or all logged questions were already completed.
 */
export function questionsToFind(
  sessions: readonly StudySession[],
  testName: string,
  existingMistakes: readonly MistakeEntry[] = []
): { questions: number[]; logged: boolean; sessionId?: string } {
  const session = loggedSession(sessions, testName);
  const logged = session ? normalizeQuestionList(session.wrongQuestions?.length ? session.wrongQuestions : draftQuestions(session)) : [];
  if (!logged.length) return { questions: [...DEFAULT_QUESTIONS], logged: false };
  const key = testNameKey(testName);
  const recordedNumbers = new Set(
    existingMistakes
      .filter(card => !card.deletedAt && card.questionNumber !== undefined && !isBlankDraft(card)
        && ((session && card.sessionId === session.id) || (key && testNameKey(card.sourceTestName ?? '') === key)))
      .map(card => card.questionNumber!)
  );
  const unrecorded = logged.filter(number => !recordedNumbers.has(number));
  return unrecorded.length
    ? { questions: unrecorded, logged: true, sessionId: session!.id }
    : { questions: [...DEFAULT_QUESTIONS], logged: false, sessionId: session!.id };
}

export interface ManualEntryFields {
  part: MistakeEntry['part'];
  testName: string;
  sessionId?: string;
  question: string;
  options: string[];
  choice: ChoiceLetter | '';
  answer: ChoiceLetter | '';
  reason: string;
  category: ErrorCategory | '';
  tags: string;
  id?: string;
}

/** A card typed in by hand, in the same shape the old form saved. */
export function buildManualEntry(fields: ManualEntryFields): MistakeEntry {
  const { options, choice, answer } = fields;
  const input: Pick<MistakeInput, 'userChoiceState' | 'userChoice' | 'userReason' | 'options'> = {
    userChoiceState: choice ? 'CHOSEN' : 'UNKNOWN', userChoice: choice, userReason: fields.reason, options };
  const correct = answer ? options.find(option => option.startsWith(`(${answer})`)) ?? '' : '';
  return {
    id: fields.id ?? generateUUID(), createdAt: new Date().toISOString(), status: 'NEEDS_REVIEW', sourceTestName: fields.testName,
    ...(fields.sessionId ? { sessionId: fields.sessionId } : {}), part: fields.part, questionContext: fields.question,
    question: fields.question, context: '', options: options.length ? options : undefined,
    userChoice: choice || undefined, userChoiceState: input.userChoiceState, userReason: fields.reason.trim() ? fields.reason : undefined,
    userMistake: learnerMistake(input), correctAnswer: correct, answerSource: correct ? 'PROVIDED' : 'MISSING',
    answerProvidedBy: correct ? 'SOURCE' : undefined, category: fields.category || 'OTHER',
    tags: fields.tags.split(',').map(value => value.trim()).filter(Boolean).slice(0, 20)
  };
}
