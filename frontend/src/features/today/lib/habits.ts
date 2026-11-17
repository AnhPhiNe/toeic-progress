import type { Habit, MistakeEntry, UserProfile } from '@/shared/types';
import { localDate } from './todayTasks';
import { suggestionStudyDates } from './suggestedTasks';

export const MAX_HABITS = 3;
export const HABIT_TITLE_MAX = 40;
/** Ticks older than this are dropped so the synced profile stays small. */
const KEEP_DAYS = 120;

function cutoff(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - KEEP_DAYS * 86400000);
  return t.toISOString().slice(0, 10);
}

export function addHabit(profile: UserProfile, title: string, id: string): UserProfile {
  const clean = title.trim().slice(0, HABIT_TITLE_MAX);
  const habits = profile.habits ?? [];
  if (!clean || habits.length >= MAX_HABITS) return profile;
  return { ...profile, habits: [...habits, { id, title: clean, doneDates: [] }] };
}

export function removeHabit(profile: UserProfile, id: string): UserProfile {
  return { ...profile, habits: (profile.habits ?? []).filter(h => h.id !== id) };
}

export function toggleHabit(profile: UserProfile, id: string, today: string): UserProfile {
  const min = cutoff(today);
  const habits = (profile.habits ?? []).map(h => {
    if (h.id !== id) return h;
    const kept = h.doneDates.filter(date => date >= min && date !== today);
    return { ...h, doneDates: h.doneDates.includes(today) ? kept : [...kept, today].sort() };
  });
  return { ...profile, habits };
}

export const habitDoneToday = (habit: Habit, today: string) => habit.doneDates.includes(today);

/**
 * Days that count for the streak beyond logged results: habit ticks, ticked
 * suggestions from Sóc and mistake reviews (only the latest review per card is stored).
 */
export function extraStudyDates(profile: UserProfile, mistakes: MistakeEntry[]): string[] {
  const dates = new Set<string>();
  for (const habit of profile.habits ?? []) for (const date of habit.doneDates) dates.add(date);
  for (const date of suggestionStudyDates(profile)) dates.add(date);
  for (const card of mistakes) {
    if (card.deletedAt || !card.lastReviewedAt) continue;
    const date = localDate(card.lastReviewedAt);
    if (date) dates.add(date);
  }
  return [...dates];
}

export function clampWeeklyGoal(days: number | undefined): number {
  return Math.min(7, Math.max(1, Math.round(days ?? 5)));
}
