import type { MistakeEntry, StudySession } from '@/shared/types';
import { PART_NUMBERS, questionsOfPart, wrongQuestionsByPart, type PartNumber } from '@/shared/domain/questionNumbers';
import { scoredFullTests } from './scoreJourney';

export const PART_NAMES: Record<PartNumber, string> = {
  1: 'Mô tả tranh', 2: 'Hỏi đáp', 3: 'Hội thoại', 4: 'Bài nói', 5: 'Điền câu', 6: 'Điền đoạn', 7: 'Đọc hiểu'
};
export const partSize = (part: PartNumber) => questionsOfPart(part).length;

/** Wrong answers per Part: from the wrong list, else from Part correct counts; null when the test has neither. */
export function wrongCountsByPart(session: StudySession): Record<PartNumber, number> | null {
  if (session.wrongQuestions) {
    const byPart = wrongQuestionsByPart(session.wrongQuestions);
    return Object.fromEntries(PART_NUMBERS.map(p => [p, byPart[p].length])) as Record<PartNumber, number>;
  }
  const scores = session.partScores;
  if (!scores) return null;
  return Object.fromEntries(PART_NUMBERS.map(p => [p, Math.max(0, partSize(p) - (scores[`part${p}` as keyof typeof scores] ?? 0))])) as Record<PartNumber, number>;
}

/** Full tests, oldest first (same order the chart uses). */
export const fullTests = (sessions: StudySession[]) => scoredFullTests(sessions);

export type TicketKind = 'first' | 'rec' | 'goal' | 'up' | 'down';

export interface TestStory {
  kind: TicketKind;
  /** Change from the previous full test; 0 for the first one. */
  delta: number;
  /** Score of the first full test (the ticket's take-off point). */
  first: number;
  isBest: boolean;
  /** Earlier attempt of the same test, for "làm lại". */
  earlier?: StudySession;
}

const sameTest = (a: StudySession, b: StudySession) => a.testName.trim().toLowerCase() === b.testName.trim().toLowerCase();

export function testStory(session: StudySession, sessions: StudySession[], target: number): TestStory {
  const list = fullTests(sessions);
  const index = list.findIndex(s => s.id === session.id);
  const prev = index > 0 ? list[index - 1] : undefined;
  const score = session.totalScore ?? 0;
  const first = list[0]?.totalScore ?? score;
  const bestBefore = Math.max(-Infinity, ...list.slice(0, Math.max(0, index)).map(s => s.totalScore ?? 0));
  const best = Math.max(...list.map(s => s.totalScore ?? 0));
  const delta = prev ? score - (prev.totalScore ?? 0) : 0;
  const earlier = list.slice(0, Math.max(0, index)).find(s => sameTest(s, session));
  const kind: TicketKind = index <= 0 ? 'first' : score >= target ? 'goal' : score > bestBefore ? 'rec' : delta < 0 ? 'down' : 'up';
  return { kind, delta, first, isBest: score === best, earlier };
}

/** Wrong question numbers of this test that already have a card in Sổ tay. */
export function notebookQuestions(session: StudySession, mistakes: MistakeEntry[]): Set<number> {
  const out = new Set<number>();
  for (const card of mistakes) {
    if (card.deletedAt || !card.questionNumber) continue;
    if (card.sessionId === session.id || (!card.sessionId && card.sourceTestName && card.sourceTestName === session.testName)) out.add(card.questionNumber);
  }
  return out;
}

export const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
