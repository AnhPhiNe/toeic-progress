import type { PacingRun } from '@/shared/types';
import type { PacingMode } from './pacingModel';
import { isTooShortRun, runSeconds } from './pacingStats';

/** Pure helpers behind the bakery-themed Luyện tập page (design/previews/mock-practice-bakery.html). */

export type Dish = 'cupcake' | 'cookies' | 'layer' | 'tiers' | 'croissant';
const DISHES: Partial<Record<PacingMode, { dish: Dish; name: string }>> = {
  PART_5: { dish: 'cupcake', name: 'Cupcake' },
  PART_6: { dish: 'cookies', name: 'Bánh quy' },
  PART_7: { dish: 'layer', name: 'Bánh kem' },
  PART_7_SINGLE: { dish: 'layer', name: 'Bánh kem' },
  PART_7_MULTI: { dish: 'layer', name: 'Bánh kem' },
  FULL_READING: { dish: 'tiers', name: 'Bánh ba tầng' },
  POMODORO: { dish: 'croissant', name: 'Bánh sừng bò' }
};
export const dishOf = (mode: PacingMode) => DISHES[mode]?.dish ?? 'layer';
export const dishName = (mode: PacingMode) => DISHES[mode]?.name ?? 'Bánh kem';

// ----- Mẻ tự do: free study on the Pomodoro timer (mode POMODORO, phases WORK / SHORT_BREAK / LONG_BREAK) -----
export const FREE_MIN = 1;
export const FREE_MAX = 120;
/** −/+ on the minutes pill: steps of 5 (25 → 20 → … → 5), single minutes below 5, kept within 1–120. */
export function stepFreeMinutes(current: number, delta: number): number {
  const now = Math.min(FREE_MAX, Math.max(FREE_MIN, Math.round(current)));
  if (delta > 0) return Math.min(FREE_MAX, now < 5 ? now + 1 : Math.floor(now / 5) * 5 + 5);
  if (delta < 0) return Math.max(FREE_MIN, now <= 5 ? now - 1 : Math.ceil(now / 5) * 5 - 5);
  return now;
}
/** A saved focus run (not a break) of the Pomodoro timer, the same test the old clock and the streak use. */
export const isFocusRun = (run: PacingRun) => !run.deletedAt && run.partType === 'POMODORO' && !run.presetId.includes('BREAK');
export const focusRunsOn = (runs: PacingRun[], date: string) => runs.filter(run => isFocusRun(run) && run.date === date).length;
/** The break after a bake: long after every `longBreakInterval`-th focus run of the day, short otherwise. */
export function nextBreak(focusToday: number, settings: { shortBreakMinutes: number; longBreakMinutes: number; longBreakInterval: number }) {
  const long = focusToday > 0 && focusToday % settings.longBreakInterval === 0;
  return { phase: long ? 'LONG_BREAK' as const : 'SHORT_BREAK' as const, minutes: long ? settings.longBreakMinutes : settings.shortBreakMinutes, long };
}
/** "+25 phút" on the ra-lò card; under a minute it counts seconds. */
export const gainLabel = (seconds: number) => seconds >= 60 ? `+${Math.round(seconds / 60)} phút` : `+${Math.max(0, Math.round(seconds))} giây`;

// ----- recipe card: five steps split by question ranges (or 3 tactical phases for Full Reading) -----
export const RECIPE_NAMES = ['Trộn bột', 'Cho vào lò', 'Bánh nở', 'Phủ kem', 'Trang trí'] as const;
export interface RecipeStep { from: number; to: number; name: string; state: 'done' | 'now' | 'todo'; durationSeconds?: number }

/**
 * Suggested 3-phase strategy for a 100-question Reading section (12m Part 5 / 8m Part 6 / 55m Part 7).
 * Scaled proportionally when the learner adjusts total minutes. This is a practice pacing suggestion,
 * not an official ETS timing breakdown.
 */
export const FULL_READING_PHASES = [
  { from: 1, to: 30, name: 'Part 5 · 30 câu', weight: 12 / 75 },
  { from: 31, to: 46, name: 'Part 6 · 16 câu', weight: 8 / 75 },
  { from: 47, to: 100, name: 'Part 7 · 54 câu', weight: 55 / 75 },
] as const;

/** The question the pace says you should be on: piecewise 12/8/55 for Full Reading, else uniform. */
export function paceQuestion(spentSeconds: number, plannedSeconds: number, questions: number, mode?: PacingMode): number {
  if (questions <= 0) return 1;
  if (mode === 'FULL_READING' && Math.floor(questions) === 100 && plannedSeconds > 0) {
    const spent = Math.max(0, spentSeconds);
    let elapsed = 0;
    for (let index = 0; index < FULL_READING_PHASES.length; index++) {
      const phase = FULL_READING_PHASES[index];
      const phaseSeconds = plannedSeconds * phase.weight;
      const isLast = index === FULL_READING_PHASES.length - 1;
      if (isLast || spent < elapsed + phaseSeconds) {
        const count = phase.to - phase.from + 1;
        const per = Math.max(1, phaseSeconds / count);
        const within = Math.max(0, spent - elapsed);
        return Math.min(phase.to, Math.max(phase.from, phase.from + Math.floor(within / per)));
      }
      elapsed += phaseSeconds;
    }
  }
  return Math.min(questions, Math.max(1, Math.floor(spentSeconds / Math.max(1, plannedSeconds / questions)) + 1));
}

/** Three tactical phases for Full Reading (12/8/55), or five equal ranges for single-Part drills. */
export function recipeSteps(questions: number, at: number, mode?: PacingMode, plannedSeconds?: number): RecipeStep[] {
  const total = Math.max(1, Math.floor(questions));
  if (mode === 'FULL_READING' && total === 100) {
    return FULL_READING_PHASES.map(phase => ({
      from: phase.from,
      to: phase.to,
      name: phase.name,
      state: phase.to < at ? 'done' as const : phase.from <= at ? 'now' as const : 'todo' as const,
      ...(plannedSeconds && plannedSeconds > 0 ? { durationSeconds: Math.round(plannedSeconds * phase.weight) } : {}),
    }));
  }
  const count = Math.min(RECIPE_NAMES.length, total);
  const size = Math.max(1, Math.floor(total / RECIPE_NAMES.length));
  return Array.from({ length: count }, (_, index) => {
    const from = index * size + 1, to = index === count - 1 ? total : (index + 1) * size;
    return { from, to, name: RECIPE_NAMES[index], state: to < at ? 'done' as const : from <= at ? 'now' as const : 'todo' as const };
  });
}

/** "24 giây" under a minute per question, else "1 phút" / "1,5 phút". */
export function paceWords(perQuestion: number): string {
  return perQuestion >= 60 ? `${Math.round(perQuestion / 6) / 10} phút`.replace('.', ',') : `${Math.round(perQuestion)} giây`;
}

/** Index of the step being worked on (the first that is not done). */
export const currentStepIndex = (steps: RecipeStep[]) => Math.max(0, steps.findIndex(step => step.state !== 'done'));

/** The oven turns orange-red in the last five minutes (at most half of a short drill). */
export function isLastStretch(leftSeconds: number, plannedSeconds: number): boolean {
  return plannedSeconds > 0 && leftSeconds > 0 && leftSeconds <= Math.min(300, plannedSeconds / 2);
}

// ----- result: strawberries, early / late, record -----
export const STRAWBERRY_EVERY = 7;
export const STRAWBERRY_CAP = 8;
/** One strawberry per 7 correct answers (rounded), at most 8 so the cake stays readable. */
export const strawberryCount = (correct: number) => Math.min(STRAWBERRY_CAP, Math.max(0, Math.round(Math.max(0, correct) / STRAWBERRY_EVERY)));

const two = (n: number) => String(n).padStart(2, '0');
/** 170 s → 2′50, 65 s → 1′05, 20 s → 20″, 120 s → 2′. */
export function formatSpan(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60), rest = total % 60;
  if (minutes === 0) return `${rest}″`;
  return rest === 0 ? `${minutes}′` : `${minutes}′${two(rest)}`;
}

export interface PaceTag { kind: 'early' | 'late' | 'even'; text: string }
/** Compared with the suggested time (planned minus actual): "sớm 2′50", "trễ 1′05". */
export function paceTag(plannedMinutes: number, actualSeconds: number): PaceTag {
  const delta = Math.round(plannedMinutes * 60 - actualSeconds);
  if (delta >= 1) return { kind: 'early', text: `sớm ${formatSpan(delta)}` };
  if (delta <= -1) return { kind: 'late', text: `trễ ${formatSpan(-delta)}` };
  return { kind: 'even', text: 'đúng giờ' };
}

const WEEKDAYS = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const parseDate = (date: string) => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
/** "Hôm nay", "Hôm qua", the weekday inside a week, then dd/mm. */
export function dayLabel(date: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return date;
  const diff = Math.round((parseDate(today).getTime() - parseDate(date).getTime()) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  if (diff > 1 && diff < 7) return WEEKDAYS[parseDate(date).getDay()];
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

const modeRuns = (runs: PacingRun[], mode: PacingMode) => runs.filter(run => !run.deletedAt && run.partType === mode && runSeconds(run) !== null && !isTooShortRun(run));
/** Best (shortest) time of a Part where the learner stopped the clock themselves; running out of time is not a record. */
export function bestSeconds(runs: PacingRun[], mode: PacingMode): number | null {
  const times = modeRuns(runs, mode).filter(run => !run.finishedNaturally).map(run => runSeconds(run)!);
  return times.length ? Math.min(...times) : null;
}
/** Time of the latest run of this Part, for Sóc's speech bubble. */
export function lastSeconds(runs: PacingRun[], mode: PacingMode): number | null {
  const latest = modeRuns(runs, mode).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  return latest ? runSeconds(latest) : null;
}
/** Seconds faster than the previous best, or null when this is not a new record. */
export function recordGain(previousBest: number | null, seconds: number, naturalFinish: boolean): number | null {
  if (previousBest === null || naturalFinish) return null;
  const gain = Math.round(previousBest - seconds);
  return gain >= 1 ? gain : null;
}

/** Deterministic sprinkle layout (no Math.random during render): positions in % of the screen, skipping the card area. */
export interface Sprinkle { x: number; y: number; hue: number; rot: number; delay: number; time: number; star: boolean }
export function sprinkles(count = 64): Sprinkle[] {
  const out: Sprinkle[] = [];
  for (let i = 0; out.length < count && i < count * 3; i++) {
    const x = (i * 37 + 11) % 97 + 1, y = (i * 53 + 7) % 71 + 2;
    if (x > 27 && x < 72 && y > 14 && y < 88) continue;
    out.push({ x, y, hue: i % 6, rot: (i * 37) % 360, delay: (i % 9) * 0.045, time: 1 + (i % 5) * 0.12, star: i % 9 === 4 });
  }
  return out;
}
