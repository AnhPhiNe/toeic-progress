import type { ErrorCategory, MistakeEntry, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { collectTestNames, testNameKey } from '@/shared/domain/testNames';
import { computeSessionAttemptMap } from '@/shared/data/storage';
import { mistakeTestName } from '@/features/mistakes/lib/sourceTests';

export const PART_KEYS = ['part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'] as const;

function hasParts(session: StudySession): boolean {
  return !!session.partScores && PART_KEYS.every(key => Number.isInteger(session.partScores?.[key])
    && session.partScores![key] >= 0 && session.partScores![key] <= PART_MAX_QUESTIONS[key]);
}
function validSection(score: number | undefined): score is number {
  return Number.isFinite(score) && score! >= 5 && score! <= 495;
}

/** One test, one scored attempt; notebook notes remain grouped by source name. */
export function analyticsScopeData(sessions: StudySession[], mistakes: MistakeEntry[], sourceKey?: string | null, attemptId?: string | null) {
  const fullTests = sessions.filter(session => !session.deletedAt && session.skillType === 'LR' && session.sessionType === 'FULL_TEST');
  const results = [...fullTests].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '') || b.id.localeCompare(a.id));
  const fullTestKeys = new Set(results.map(session => testNameKey(session.testName)));
  const otherSourceKeys = new Set(sessions.filter(session => !session.deletedAt
    && (session.skillType !== 'LR' || session.sessionType !== 'FULL_TEST')).map(session => testNameKey(session.testName)));
  // Known practice-only sources do not belong in Full Test analysis. A shared name with a Full Test remains eligible.
  const names = collectTestNames(fullTests, mistakes).filter(name => fullTestKeys.has(testNameKey(name)) || !otherSourceKeys.has(testNameKey(name)));
  const source = names.find(name => testNameKey(name) === sourceKey) ?? results[0]?.testName ?? names[0] ?? '';
  const key = testNameKey(source);
  // Unnamed legacy tests remain independent; unassigned notes are not assumed to belong to them.
  const sourceResults = key ? results.filter(result => testNameKey(result.testName) === key) : results.slice(0, 1);
  const metadata = computeSessionAttemptMap(results);
  const attempts = sourceResults.map((session, index) => ({ session, number: metadata[session.id].attemptNumber, latest: index === 0 }));
  const selected = attempts.find(row => row.session.id === attemptId) ?? attempts[0];
  const attempt = selected?.session ?? null;
  const linkedNames = new Map(sessions.filter(session => !session.deletedAt).map(session => [session.id, session.testName]));
  const notes = mistakes.filter(mistake => !mistake.deletedAt && Boolean(key)
    && testNameKey(mistakeTestName(mistake, linkedNames)) === key);
  const parts = attempt && hasParts(attempt) ? PART_KEYS.map(partKey => {
    const correct = attempt.partScores![partKey];
    return { key: partKey, code: partKey.replace('part', 'P'), correct, max: PART_MAX_QUESTIONS[partKey], accuracy: correct / PART_MAX_QUESTIONS[partKey] * 100 };
  }) : [];
  const weakest = parts.filter(part => part.accuracy < 100).reduce<typeof parts[number] | null>((lowest, part) => !lowest || part.accuracy < lowest.accuracy ? part : lowest, null);
  const section = (score: number | undefined) => ({ value: validSection(score) ? score : null });
  const counts = new Map<ErrorCategory, number>();
  for (const note of notes) {
    const category = Object.prototype.hasOwnProperty.call(ERROR_CATEGORY_LABELS, note.category) ? note.category : 'OTHER';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const errors = [...counts].map(([category, count]) => ({ category, count, percent: count / notes.length * 100 }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return { names, source, sourceKey: key, attempts, attempt, attemptNumber: selected?.number ?? null, latestAttempt: selected?.latest ?? false,
    parts, weakest, listening: section(attempt?.scaledListening), reading: section(attempt?.scaledReading), notes, errors,
    notebookSources: key ? [source] : [] };
}

export function formatAnalyticsNumber(value: number): string {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

export function analyticsAttemptLabel(number: number, date: string, latest = false): string {
  return `Lần ${number} · ${date.split('-').reverse().join('/')}${latest ? ' · Mới nhất' : ''}`;
}
