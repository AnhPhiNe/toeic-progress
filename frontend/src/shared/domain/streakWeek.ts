import type { DataBundle } from '@/shared/data/dataBundle';
import { calendarDayIndex, validCalendarDate } from '@/shared/domain/dateRange';
import { actualStudyDates, deriveStreak } from '@/shared/domain/streak';

export type WeekdayLabel = 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'CN';
export type StreakDayState = 'done' | 'freeze' | 'missed' | 'today-pending' | 'future';
export interface StreakWeekDay { date: string; label: WeekdayLabel; state: StreakDayState; isToday: boolean }
export interface StreakWeek { days: StreakWeekDay[]; current: number; longest: number; freezesLeft: number }
export interface StreakMilestone { target: number; left: number; progress: number }
export interface WeeklyGoal { done: number; goal: number; met: boolean }

const LABELS: WeekdayLabel[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const BASE_MILESTONES = [3, 7, 10, 14, 21, 30, 50, 75, 100];

const dateFromIndex = (index: number) => new Date(index * 86_400_000).toISOString().slice(0, 10);

/** Monday..Sunday dates of the week containing `today` (all 'YYYY-MM-DD', UTC day arithmetic, no local timezone). */
export function mondayWeekDates(today: string): string[] {
  const index = calendarDayIndex(today);
  // Day index 0 (1970-01-01) is a Thursday, i.e. offset 3 from Monday.
  const monday = index - ((((index + 3) % 7) + 7) % 7);
  return LABELS.map((_, offset) => dateFromIndex(monday + offset));
}

function cleanExtras(extraDoneDates: readonly string[] | undefined, today: string): string[] {
  return [...new Set((extraDoneDates ?? []).filter(date => validCalendarDate(date) && date <= today))];
}

/** Real study dates plus manual habit ticks, never past `today`. */
export function doneDates(bundle: DataBundle, today: string, extraDoneDates?: readonly string[]): Set<string> {
  const done = actualStudyDates(bundle, today);
  for (const date of cleanExtras(extraDoneDates, today)) done.add(date);
  return done;
}

/** deriveStreak, with extra done dates fed in as synthetic vocab logs so they count as study days. Bundle is not mutated. */
export function deriveStreakWithExtras(bundle: DataBundle, today: string, extraDoneDates?: readonly string[]) {
  const extras = cleanExtras(extraDoneDates, today);
  if (!extras.length) return deriveStreak(bundle, today);
  const synthetic = extras.map(date => ({ id: `extra-done:${date}`, date, count: 1, updatedAt: '', deletedAt: null }));
  return deriveStreak({ ...bundle, vocabLog: [...bundle.vocabLog, ...synthetic] }, today);
}

export function streakWeek(bundle: DataBundle, today: string, extraDoneDates?: string[]): StreakWeek {
  const done = doneDates(bundle, today, extraDoneDates);
  const shields = new Set(bundle.shieldDays.filter(item => !item.deletedAt && item.date <= today).map(item => item.date));
  const days = mondayWeekDates(today).map((date, offset): StreakWeekDay => {
    const isToday = date === today;
    let state: StreakDayState;
    if (date > today) state = 'future';
    else if (done.has(date)) state = 'done';
    else if (shields.has(date)) state = 'freeze';
    else state = isToday ? 'today-pending' : 'missed';
    return { date, label: LABELS[offset], state, isToday };
  });
  const streak = deriveStreakWithExtras(bundle, today, extraDoneDates);
  return { days, current: streak.currentStreak, longest: streak.longestStreak, freezesLeft: streak.streakFreezes };
}

/** Milestones 3, 7, 10, 14, 21, 30, 50, 75, 100, then every +50. Reaching a milestone exactly points at the next one. */
export function nextStreakMilestone(current: number): StreakMilestone {
  const value = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  let target = BASE_MILESTONES.find(milestone => milestone > value);
  let previous: number;
  if (target === undefined) {
    target = (Math.floor(value / 50) + 1) * 50;
    previous = target - 50;
  } else {
    previous = BASE_MILESTONES.filter(milestone => milestone <= value).pop() ?? 0;
  }
  return { target, left: target - value, progress: (value - previous) / (target - previous) };
}

/** Distinct done days from this week's Monday through `today`; shield days do not count. */
export function weeklyGoal(bundle: DataBundle, today: string, goalDays = 5, extraDoneDates?: string[]): WeeklyGoal {
  const done = doneDates(bundle, today, extraDoneDates);
  const count = mondayWeekDates(today).filter(date => date <= today && done.has(date)).length;
  return { done: count, goal: goalDays, met: count >= goalDays };
}
