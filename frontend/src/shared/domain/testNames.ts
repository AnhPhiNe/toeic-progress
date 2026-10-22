import type { MistakeEntry, StudySession } from '@/shared/types';

export function normalizeTestName(name?: string | null): string {
  return (name || '').trim().replace(/\s+/g, ' ');
}

export function testNameKey(name?: string | null): string {
  return normalizeTestName(name).normalize('NFKC').toLocaleLowerCase('vi');
}

export function uniqueTestNames(names: Iterable<string>): string[] {
  const unique = new Map<string, string>();
  for (const name of names) {
    const value = normalizeTestName(name);
    if (value && value.length <= 300 && !unique.has(testNameKey(value))) unique.set(testNameKey(value), value);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
}

/** A name is shared across notes and scores; it never creates a scored session. */
export function collectTestNames(sessions: StudySession[], mistakes: MistakeEntry[]): string[] {
  const activeSessions = sessions.filter(session => !session.deletedAt);
  const linkedNames = new Map(activeSessions.map(session => [session.id, session.testName]));
  return uniqueTestNames([
    ...activeSessions.map(session => session.testName),
    ...mistakes.filter(mistake => !mistake.deletedAt).map(mistake => typeof mistake.sourceTestName === 'string'
      ? mistake.sourceTestName : linkedNames.get(mistake.sessionId ?? '') ?? '')
  ]);
}

/**
 * The test a learner most likely did next: the latest Full Test's name with its trailing number raised by one
 * ("ETS 2024 Test 03" -> "ETS 2024 Test 04"). Empty when there is no numbered name or that test is already logged.
 */
export function suggestNextTestName(sessions: StudySession[]): string {
  const fullTests = sessions.filter(session => !session.deletedAt && session.sessionType === 'FULL_TEST' && normalizeTestName(session.testName));
  const latest = [...fullTests].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  const match = latest && /^(.*?)(\d+)(\D*)$/.exec(normalizeTestName(latest.testName));
  if (!match) return '';
  const next = String(Number(match[2]) + 1).padStart(match[2].length, '0');
  const name = `${match[1]}${next}${match[3]}`;
  return fullTests.some(session => testNameKey(session.testName) === testNameKey(name)) || name.length > 300 ? '' : name;
}
