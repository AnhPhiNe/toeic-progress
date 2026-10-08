import type { ErrorCategory, MistakeEntry, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { collectTestNames, testNameKey } from '@/shared/domain/testNames';
import { mistakeTestName } from '@/features/mistakes/lib/sourceTests';

export const PART_KEYS = ['part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'] as const;
export type AnalyticsScope = 'latest' | 'recent' | 'all' | `test:${string}`;

function hasParts(session: StudySession): boolean {
  return !!session.partScores && PART_KEYS.every(key => Number.isInteger(session.partScores?.[key])
    && session.partScores![key] >= 0 && session.partScores![key] <= PART_MAX_QUESTIONS[key]);
}
function validSection(score: number | undefined): score is number {
  return Number.isFinite(score) && score! >= 5 && score! <= 495;
}

/** Presentation scope only. Dashboard/plan first-attempt statistics keep their own rules. */
export function analyticsScopeData(sessions: StudySession[], mistakes: MistakeEntry[], scope: AnalyticsScope) {
  const results = sessions.filter(session => !session.deletedAt && session.skillType === 'LR'
    && session.sessionType === 'FULL_TEST' && (hasParts(session) || validSection(session.scaledListening)
      || validSection(session.scaledReading) || (Number.isFinite(session.totalScore) && session.totalScore! >= 10 && session.totalScore! <= 990)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const names = collectTestNames(sessions, mistakes);
  const source = scope === 'latest' ? results[0]?.testName ?? ''
    : scope.startsWith('test:') ? names.find(name => `test:${testNameKey(name)}` === scope) ?? '' : null;
  const single = source !== null;
  const selected = single ? (scope === 'latest' ? results.slice(0, 1)
    : results.filter(result => testNameKey(result.testName) === testNameKey(source)).slice(0, 1))
    : scope === 'recent' ? results.slice(0, 5) : results;
  // A source name groups notes across attempts. No new attempt links are introduced.
  const sourceKeys = new Set((single ? [source] : selected.map(result => result.testName)).map(testNameKey));
  const linkedNames = new Map(sessions.filter(session => !session.deletedAt).map(session => [session.id, session.testName]));
  const notes = mistakes.filter(mistake => !mistake.deletedAt && (scope === 'all'
    || (scope !== 'latest' || results.length > 0) && sourceKeys.has(testNameKey(mistakeTestName(mistake, linkedNames)))));
  const partResults = selected.filter(hasParts);
  const parts = partResults.length ? PART_KEYS.map(key => {
    const correct = partResults.reduce((sum, result) => sum + result.partScores![key], 0) / partResults.length;
    return { key, code: key.replace('part', 'P'), correct, max: PART_MAX_QUESTIONS[key], accuracy: correct / PART_MAX_QUESTIONS[key] * 100 };
  }) : [];
  const weakest = parts.reduce<typeof parts[number] | null>((lowest, part) => !lowest || part.accuracy < lowest.accuracy ? part : lowest, null);
  const section = (key: 'scaledListening' | 'scaledReading') => {
    const scores = selected.map(result => result[key]).filter(validSection);
    return { value: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null, count: scores.length };
  };
  const counts = new Map<ErrorCategory, number>();
  for (const note of notes) {
    const category = Object.prototype.hasOwnProperty.call(ERROR_CATEGORY_LABELS, note.category) ? note.category : 'OTHER';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const errors = [...counts].map(([category, count]) => ({ category, count, percent: count / notes.length * 100 }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return { names, resultCount: results.length, single, source, selected, partResults, parts, weakest,
    listening: section('scaledListening'), reading: section('scaledReading'), notes, errors,
    notebookSources: scope === 'all' ? undefined : scope === 'latest' && !selected.length ? []
      : single ? [source] : [...new Set(selected.map(result => result.testName))] };
}

export function formatAnalyticsNumber(value: number): string {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}
