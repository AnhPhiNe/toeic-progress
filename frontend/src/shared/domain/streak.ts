import type { DataBundle, VocabLog } from '@/shared/data/dataBundle';
import type { StudySession, PacingRun } from '@/shared/types';

function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function actualStudyDates(bundle: { sessions: StudySession[]; vocabLog: VocabLog[]; pacingRuns: PacingRun[] }, today: string) {
  const actual = new Set<string>();
  for (const session of bundle.sessions) if (!session.deletedAt && session.date <= today) actual.add(session.date);
  for (const log of bundle.vocabLog) if (!log.deletedAt && log.count > 0 && log.date <= today) actual.add(log.date);
  for (const run of bundle.pacingRuns) if (!run.deletedAt && (run.actualMinutes > 0 || (run.actualSeconds || 0) > 0) && run.date <= today) actual.add(run.date);
  return actual;
}

export function deriveStreak(bundle: DataBundle, today: string) {
  const actual = actualStudyDates(bundle, today);
  const shieldDates = new Set(bundle.shieldDays.filter(item => !item.deletedAt && item.date <= today).map(item => item.date));
  const covered = [...new Set([...actual, ...shieldDates])].sort();
  let longest = 0;
  let run = 0;
  let previous = Number.NEGATIVE_INFINITY;
  for (const date of covered) {
    const day = dayNumber(date);
    run = day === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const lastCoveredDay = covered.length ? dayNumber(covered[covered.length - 1]) : Number.NEGATIVE_INFINITY;
  const currentStreak = lastCoveredDay >= dayNumber(today) - 1 ? run : 0;
  const lastStudyDate = [...actual].sort().pop() || '';
  const shieldAllowance = bundle.profile.shieldAllowance ?? bundle.profile.streakFreezes + shieldDates.size;
  const streakFreezes = Math.max(0, shieldAllowance - shieldDates.size);
  return { currentStreak, longestStreak: Math.max(longest, bundle.profile.longestStreak || 0), lastStudyDate, streakFreezes };
}
