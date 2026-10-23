import type { StudySession } from '@/shared/types';
import { getPracticeParts, PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';

/** Missing counts stay unknown; complete skill detail fills a missing raw score, never an explicit zero. */
export function skillSummary(session: StudySession, skill: 'listening' | 'reading') {
  const listening = skill === 'listening';
  const scaled = listening ? session.scaledListening : session.scaledReading;
  if (session.sessionType === 'FULL_TEST') {
    const raw = listening ? session.rawListening : session.rawReading;
    const keys = listening ? ['part1', 'part2', 'part3', 'part4'] as const : ['part5', 'part6', 'part7'] as const;
    const complete = keys.every(key => {
      const value = session.partScores?.[key];
      return Number.isInteger(value) && value! >= 0 && value! <= PART_MAX_QUESTIONS[key];
    });
    const correct = raw !== undefined && Number.isInteger(raw) && raw >= 0 && raw <= 100
      ? raw : complete ? keys.reduce((sum, key) => sum + session.partScores![key], 0) : undefined;
    return { scaled, correct, total: 100, accuracy: correct === undefined ? undefined : correct };
  }
  const parts = getPracticeParts(session).filter(part => listening ? part.part <= 4 : part.part >= 5);
  const total = parts.reduce((sum, part) => sum + part.total, 0);
  const correct = parts.length ? parts.reduce((sum, part) => sum + part.correct, 0) : undefined;
  return { scaled, correct, total, accuracy: correct === undefined || !total ? undefined : correct / total * 100 };
}
