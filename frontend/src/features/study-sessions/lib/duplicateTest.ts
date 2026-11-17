import type { StudySession } from '@/shared/types';
import { testNameKey } from '@/shared/domain/testNames';

/**
 * A live Full Test already logged with the same name (trimmed, case- and whitespace-insensitive) on the same date.
 * Used to warn before saving a second copy of the same result; the newest match is returned.
 */
export function findDuplicateFullTest(sessions: readonly StudySession[], testName: string, date: string, excludeId?: string): StudySession | null {
  const key = testNameKey(testName);
  if (!key || !date) return null;
  let found: StudySession | null = null;
  for (const session of sessions) {
    if (session.deletedAt || session.sessionType !== 'FULL_TEST' || session.id === excludeId) continue;
    if (session.date !== date || testNameKey(session.testName) !== key) continue;
    if (!found || (session.createdAt ?? '') > (found.createdAt ?? '')) found = session;
  }
  return found;
}

/** "hôm nay", "hôm qua" or "ngày 15/11" for the warning line. */
export function duplicateDayLabel(date: string, today: string): string {
  if (date === today) return 'hôm nay';
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (date === y) return 'hôm qua';
  const [, month, day] = date.split('-');
  return `ngày ${Number(day)}/${Number(month)}`;
}
