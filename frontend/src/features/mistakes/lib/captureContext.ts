import type { ErrorCategory, MistakeEntry, StudySession } from '@/shared/types';
import { generateUUID } from '@/shared/domain/uuid';
import { draftQuestions } from '@/features/mistakes/lib/mistakeDrafts';
import { learnerMistake, type ChoiceLetter, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { normalizeTestName, testNameKey } from '@/features/mistakes/lib/sourceTests';
import { DEFAULT_QUESTIONS } from '@/features/mistakes/lib/captureBatch';

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
    .find(session => draftQuestions(session).length > 0);
}

/** The newest saved session with this test name (any kind), to link a hand-typed note to the test it came from. */
export function sessionIdForTest(sessions: readonly StudySession[], testName: string): string | undefined {
  const key = testNameKey(testName);
  return key ? sessions.filter(session => !session.deletedAt && testNameKey(session.testName) === key).sort(newestFirst)[0]?.id : undefined;
}

/** Part 5–7 questions the learner logged as wrong for this test, or the whole Reading range when none was logged. */
export function questionsToFind(sessions: readonly StudySession[], testName: string): { questions: number[]; logged: boolean; sessionId?: string } {
  const session = loggedSession(sessions, testName);
  const logged = session ? draftQuestions(session) : [];
  return logged.length ? { questions: logged, logged: true, sessionId: session!.id } : { questions: [...DEFAULT_QUESTIONS], logged: false };
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
