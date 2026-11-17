import type { PacingRun, ReadingPartType, SuggestedTask, UserProfile } from '@/shared/types';
import type { TodayTask } from './todayTasks';

/** A suggestion not done within this many days quietly leaves Hôm nay. */
export const SUGGESTION_DAYS = 7;
/** Done ones are kept this long so their day keeps counting for the streak (same as habit ticks). */
const KEEP_DONE_DAYS = 120;
const MAX_STORED = 40;

const TIMER_MODES: Record<number, readonly ReadingPartType[]> = {
  5: ['PART_5', 'FULL_READING'],
  6: ['PART_6', 'FULL_READING'],
  7: ['PART_7', 'PART_7_SINGLE', 'PART_7_MULTI', 'FULL_READING'],
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

export const suggestionId = (attemptId: string, part: number | null, kind: SuggestedTask['kind']) => `${attemptId}:${part ?? 0}:${kind}`;

/** Still waiting (not done, not older than 7 days) or done today; everything else is gone. */
function alive(task: SuggestedTask, today: string): boolean {
  if (task.doneDate) return task.doneDate === today;
  return task.addedDate > addDays(today, -SUGGESTION_DAYS);
}

/** Done when ticked, or (timer kind) when that Part was timed since it was added. Returns the day it was done. */
export function suggestionDoneDate(task: SuggestedTask, pacingRuns: readonly PacingRun[], today: string): string | null {
  if (task.doneDate) return task.doneDate;
  if (task.kind !== 'timer' || !task.part) return null;
  const modes = TIMER_MODES[task.part] ?? [];
  const run = pacingRuns.filter(r => !r.deletedAt && r.partType && modes.includes(r.partType) && r.date >= task.addedDate && r.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return run ? run.date : null;
}

export interface SuggestionView { task: SuggestedTask; done: boolean }

/** What Hôm nay shows today, oldest first. A timer done on an earlier day is gone, like a ticked one. */
export function suggestionsToday(profile: UserProfile, pacingRuns: readonly PacingRun[], today: string): SuggestionView[] {
  const out: SuggestionView[] = [];
  for (const task of profile.suggestedTasks ?? []) {
    const doneOn = suggestionDoneDate(task, pacingRuns, today);
    if (doneOn ? doneOn !== today : !alive(task, today)) continue;
    out.push({ task, done: Boolean(doneOn) });
  }
  return out;
}

/** Worth storing: still open, or done recently enough to matter for the streak. */
const worthKeeping = (task: SuggestedTask, today: string) =>
  task.doneDate ? task.doneDate > addDays(today, -KEEP_DONE_DAYS) : alive(task, today);

/** Adds once per id (an expired copy is replaced); old entries are dropped so the synced profile stays small. */
export function addSuggestion(profile: UserProfile, task: Omit<SuggestedTask, 'addedDate' | 'doneDate'>, today: string): UserProfile {
  const kept = (profile.suggestedTasks ?? []).filter(t => worthKeeping(t, today));
  if (kept.some(t => t.id === task.id && alive(t, today))) return { ...profile, suggestedTasks: kept };
  return { ...profile, suggestedTasks: [...kept.filter(t => t.id !== task.id), { ...task, addedDate: today }].slice(-MAX_STORED) };
}

export function toggleSuggestion(profile: UserProfile, id: string, today: string): UserProfile {
  return { ...profile, suggestedTasks: (profile.suggestedTasks ?? []).map(t => t.id !== id ? t
    : t.doneDate ? (({ doneDate: _drop, ...rest }) => rest)(t) : { ...t, doneDate: today }) };
}

/** True while the suggestion is still on Hôm nay (so the advice button shows "Đã thêm"). */
export function hasSuggestion(profile: UserProfile, id: string, today: string): boolean {
  return (profile.suggestedTasks ?? []).some(t => t.id === id && alive(t, today));
}

/** Ticked suggestions count for the streak like habits. */
export function suggestionStudyDates(profile: UserProfile): string[] {
  return (profile.suggestedTasks ?? []).flatMap(t => t.doneDate ? [t.doneDate] : []);
}

/** "Bấm giờ Part 7 · 20′" */
export const suggestionLabel = (task: SuggestedTask) => `${task.title} · ${task.minutes}′`;
/** "Sóc gợi ý từ đề 11/11" */
export const suggestionFrom = (task: SuggestedTask) => `Sóc gợi ý từ đề ${task.testDate.slice(8, 10)}/${task.testDate.slice(5, 7)}`;

/** Sóc's own "Bấm giờ Part N" would repeat a suggestion for the same Part; the suggestion (with its test) wins. */
export function withoutRepeatedTimers(tasks: TodayTask[], suggestions: SuggestionView[]): TodayTask[] {
  const parts = new Set(suggestions.filter(v => v.task.kind === 'timer').map(v => v.task.part));
  return tasks.filter(t => !(t.kind === 'PART_TIMER' && parts.has(t.part ?? null)));
}
