import type { MistakeEntry, StudySession } from '@/shared/types';
import { testNameKey } from '@/shared/domain/testNames';
import { mistakeTestName } from '@/features/mistakes/lib/sourceTests';

export function compareSessionDate(a: StudySession, b: StudySession): number {
  return (a.date || '').localeCompare(b.date || '')
    || (a.createdAt || '').localeCompare(b.createdAt || '')
    || (a.id || '').localeCompare(b.id || '');
}

/** Previous scored Full Test in chronological order, independent of table search/sort. */
export function previousScoreMap(sessions: StudySession[]): Map<string, StudySession> {
  const scored = sessions.filter(session => !session.deletedAt && session.sessionType === 'FULL_TEST'
    && session.skillType === 'LR' && Number.isFinite(session.totalScore) && session.totalScore! >= 10 && session.totalScore! <= 990)
    .sort(compareSessionDate);
  return new Map(scored.slice(1).map((session, index) => [session.id, scored[index]]));
}

/** Legacy session references remain readable; an explicit empty source stays cleared. */
export function sourceMistakes(session: StudySession, sessions: StudySession[], mistakes: MistakeEntry[]): MistakeEntry[] {
  const names = new Map(sessions.filter(item => !item.deletedAt).map(item => [item.id, item.testName]));
  const key = testNameKey(session.testName);
  return mistakes.filter(mistake => !mistake.deletedAt && (key
    ? testNameKey(mistakeTestName(mistake, names)) === key
    : mistake.sessionId === session.id && typeof mistake.sourceTestName !== 'string'));
}

export function historyDate(date: string): string {
  if (!date) return '—';
  const [year, month, day] = date.split('-');
  return day ? `${day}/${month}/${year}` : date;
}

export function historyDuration(minutes?: number): string {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return '0 phút';
  return minutes < 1 ? `${Math.round(minutes * 60)} giây` : `${minutes.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} phút`;
}
