import type { MistakeEntry, StudySession } from '@/shared/types';

export function normalizeTestName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function testNameKey(name: string): string {
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
