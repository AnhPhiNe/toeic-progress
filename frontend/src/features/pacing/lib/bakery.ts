import type { PacingRun } from '@/shared/types';
import type { PacingMode } from './pacingModel';
import { isTooShortRun, runSeconds } from './pacingStats';

/** Pure helpers behind the bakery-themed Luyện tập page (design/previews/mock-practice-bakery.html). */

export type Dish = 'cupcake' | 'cookies' | 'layer' | 'tiers';
const DISHES: Partial<Record<PacingMode, { dish: Dish; name: string }>> = {
  PART_5: { dish: 'cupcake', name: 'Cupcake' },
  PART_6: { dish: 'cookies', name: 'Bánh quy' },
  PART_7: { dish: 'layer', name: 'Bánh kem' },
  FULL_READING: { dish: 'tiers', name: 'Bánh ba tầng' }
};
export const dishOf = (mode: PacingMode) => DISHES[mode]?.dish ?? 'layer';
export const dishName = (mode: PacingMode) => DISHES[mode]?.name ?? 'Bánh kem';

// ----- recipe card: five steps split by question ranges -----
export const RECIPE_NAMES = ['Trộn bột', 'Cho vào lò', 'Bánh nở', 'Phủ kem', 'Trang trí'] as const;
export interface RecipeStep { from: number; to: number; name: string; state: 'done' | 'now' | 'todo' }

/** The question the pace says you should be on: one question per (planned / questions) seconds. */
export function paceQuestion(spentSeconds: number, plannedSeconds: number, questions: number): number {
  if (questions <= 0) return 1;
  return Math.min(questions, Math.max(1, Math.floor(spentSeconds / Math.max(1, plannedSeconds / questions)) + 1));
}

/** Five (or fewer, for tiny drills) equal ranges; the last one takes the remainder. A step ticks once the pace passes its last question. */
export function recipeSteps(questions: number, at: number): RecipeStep[] {
  const total = Math.max(1, Math.floor(questions));
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
