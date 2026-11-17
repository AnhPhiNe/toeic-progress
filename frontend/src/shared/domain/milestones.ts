import type { StudySession } from '@/shared/types';

/** One stair on the "stairs to the trophy" path. */
export interface MilestoneStep {
  value: number;
  reached: boolean;
  /** Date of the first full test whose score reached this value. */
  reachedDate?: string;
}

export interface MilestoneNext {
  index: number;
  value: number;
  /** Points still needed: value - best. */
  gap: number;
}

export type MilestonePlan =
  | { status: 'empty'; target: number }
  | {
      status: 'climbing' | 'done';
      target: number;
      step: number;
      best: number;
      steps: MilestoneStep[];
      /** Index of the highest reached step. */
      currentIndex: number;
      next?: MilestoneNext;
    };

/** Estimated stairs (before the first test) have this many blocks before the trophy; only the points per stair change. */
export const STAIR_COUNT = 8;

interface ScoredTest { date: string; createdAt: string; score: number }

function scoredFullTests(sessions: StudySession[]): ScoredTest[] {
  return sessions
    .filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.skillType === 'LR'
      && typeof s.totalScore === 'number' && Number.isFinite(s.totalScore))
    .map(s => ({ date: s.date, createdAt: s.createdAt ?? '', score: s.totalScore as number }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * Eight even stairs from `start` up to the target: the gap is split in 8 and rounded up to a multiple of 10,
 * then the first stair is moved down so the eighth one leads straight into the trophy (base <= start, so the
 * first test always stands on a stair). If start already meets the target, only the target.
 */
export function stairSteps(start: number, target: number): { step: number; values: number[] } {
  if (start >= target) return { step: 10, values: [target] };
  const step = Math.max(10, Math.ceil((target - start) / STAIR_COUNT / 10) * 10);
  const values: number[] = [];
  for (let k = STAIR_COUNT; k >= 1; k--) {
    // Low targets would dip below zero: those stairs collapse onto a single 0 stair.
    const value = Math.max(0, target - k * step);
    if (values[values.length - 1] !== value) values.push(value);
  }
  values.push(target);
  return { step, values };
}

/** Stair sizes for real stairs, smallest first. */
export const STAIR_SIZES = [25, 50, 100] as const;

/**
 * Points per stair once a first test exists. It depends only on the first score, never on the goal or later tests:
 * the smallest of 25 / 50 / 100 that fits the whole road from the first score to 990 in at most 10 stairs.
 * A typical goal then gets 5 to 8 stairs; raising the goal adds stairs and lowering it removes some.
 */
export function stairSize(start: number): number {
  return STAIR_SIZES.find(size => (990 - start) / size <= 10) ?? STAIR_SIZES[STAIR_SIZES.length - 1];
}

/** Round multiples of `size` more than a quarter stair above lo, up to `hi` (inclusive or not). */
function roundStairs(lo: number, hi: number, size: number, inclusive: boolean): number[] {
  const values: number[] = [];
  for (let v = Math.floor((lo + size / 4) / size) * size + size; inclusive ? v <= hi : v < hi; v += size) values.push(v);
  return values;
}

/**
 * Stair values of a climb: the first score, round multiples of the stair size, then the goal last.
 * Stairs up to the best score are climbed; the last one is Sóc's step and carries the best score as its label
 * when the best sits between two boundaries. The climbed part never depends on the goal, so changing the goal
 * only redraws the stairs above Sóc and never moves her down.
 */
export function stairValues(start: number, best: number, target: number): { step: number; climbed: number[]; above: number[] } {
  const size = stairSize(start);
  // Climbed: boundaries up to the best; the last one (Sóc's step) shows the best score.
  const climbed = [start, ...roundStairs(start, best, size, true)];
  climbed[climbed.length - 1] = best;
  // Above: boundaries more than a quarter stair above the best and below the goal, then the goal.
  return { step: size, climbed, above: best >= target ? [] : [...roundStairs(best, target - size / 4, size, false), target] };
}

/** Real stairs once a full test exists (see stairValues). */
export function buildMilestones(sessions: StudySession[], targetScore: number): MilestonePlan {
  const target = targetScore;
  const tests = scoredFullTests(sessions);
  if (!tests.length) return { status: 'empty', target };

  const start = tests[0].score;
  const best = Math.max(...tests.map(t => t.score));
  const reachedOn = (value: number) => tests.find(t => t.score >= value)?.date;
  const { step, climbed: done, above } = stairValues(start, best, target);
  const climbed: MilestoneStep[] = done.map(value => ({ value, reached: true, reachedDate: reachedOn(value) }));
  const currentIndex = climbed.length - 1;

  if (best >= target) {
    // The goal is at or below the best: the trophy stands right after Sóc's step, already reached.
    const steps = [...climbed, { value: target, reached: true, reachedDate: reachedOn(target) }];
    return { status: 'done', target, step, best, steps, currentIndex: steps.length - 1 };
  }
  const steps: MilestoneStep[] = [...climbed, ...above.map(value => ({ value, reached: false }))];
  const index = currentIndex + 1;
  const value = steps[index].value;
  return { status: 'climbing', target, step, best, steps, currentIndex, next: { index, value, gap: value - best } };
}

/** Typical first score a new learner starts from; the estimated stairs begin here. */
export const ESTIMATE_START = 450;

export interface StairsEstimate {
  step: number;
  /** Stair values, then the target last (same shape as buildMilestones steps). */
  values: number[];
}

/**
 * Stairs drawn before any test is logged: from a typical first score up to the target, using the same
 * eight-stair rule as buildMilestones so the real stairs look alike once a first score arrives.
 * Targets at or below the typical start climb from 200 points under the target instead.
 */
export function estimateMilestones(target: number): StairsEstimate {
  const start = target > ESTIMATE_START ? ESTIMATE_START : Math.max(0, target - 200);
  return stairSteps(start, target);
}
