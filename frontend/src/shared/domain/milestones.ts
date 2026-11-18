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
      /** About how many points one stair is worth (rounded). */
      step: number;
      best: number;
      /** STAIR_COUNT stairs, then the trophy (value = target) last. */
      steps: MilestoneStep[];
      /** Stair Sóc stands on (its plate shows the best score); STAIR_COUNT (the trophy) once the goal is reached. */
      currentIndex: number;
      next?: MilestoneNext;
    };

/** Always eight stairs, then the trophy ("cúp sau bậc 8"). Sketch: design/previews/mock-stairs-rule.html. */
export const STAIR_COUNT = 8;
/** Stairs are never closer than this many points. */
export const MIN_STEP = 10;

interface ScoredTest { date: string; createdAt: string; score: number }

function scoredFullTests(sessions: StudySession[]): ScoredTest[] {
  return sessions
    .filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.skillType === 'LR'
      && typeof s.totalScore === 'number' && Number.isFinite(s.totalScore))
    .map(s => ({ date: s.date, createdAt: s.createdAt ?? '', score: s.totalScore as number }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * The eight stair values from `start` up to the goal, then the goal (the trophy) last:
 * stair k = start + k·(goal − start)/8, rounded to 10. When that makes stairs closer than 10 points
 * (start close to or above the goal), start drops to the goal minus 80. Goals under 80 cannot hold eight
 * stairs 10 apart: they start from 0 and round to whole points instead.
 */
export function stairSteps(start: number, target: number): { step: number; values: number[] } {
  let from = start;
  if ((target - from) / STAIR_COUNT < MIN_STEP) from = Math.floor((target - STAIR_COUNT * MIN_STEP) / 10) * 10;
  const unit = from < 0 ? 1 : 10;
  from = Math.max(0, from);
  const gap = (target - from) / STAIR_COUNT;
  const values = Array.from({ length: STAIR_COUNT }, (_, k) => Math.round((from + k * gap) / unit) * unit);
  return { step: Math.round(gap), values: [...values, target] };
}

/** Where real stairs start: the first score rounded down to 50. */
export const firstStairStart = (firstScore: number) => Math.floor(firstScore / 50) * 50;

/** Real stairs once a full test exists (see stairSteps). */
export function buildMilestones(sessions: StudySession[], targetScore: number): MilestonePlan {
  const target = targetScore;
  const tests = scoredFullTests(sessions);
  if (!tests.length) return { status: 'empty', target };

  const best = Math.max(...tests.map(t => t.score));
  const reachedOn = (value: number) => tests.find(t => t.score >= value)?.date;
  const { step, values } = stairSteps(firstStairStart(tests[0].score), target);

  if (best >= target) {
    // Goal reached: every stair is gold and Sóc stands by the trophy.
    const steps = values.map(value => ({ value, reached: true, reachedDate: reachedOn(value) }));
    return { status: 'done', target, step, best, steps, currentIndex: STAIR_COUNT };
  }
  // Sóc's stair: the highest one at or below the best (stair 0 is at or below the first score, so there is always one).
  let cur = 0;
  for (let k = 0; k < STAIR_COUNT; k++) if (values[k] <= best) cur = k;
  const steps: MilestoneStep[] = values.map((value, k) => (k <= cur ? { value, reached: true, reachedDate: reachedOn(value) } : { value, reached: false }));
  const index = cur + 1;
  const value = steps[index].value;
  return { status: 'climbing', target, step, best, steps, currentIndex: cur, next: { index, value, gap: value - best } };
}

/** Typical first score a new learner starts from; the estimated stairs begin here. */
export const ESTIMATE_START = 450;

export interface StairsEstimate {
  step: number;
  /** Eight stair values, then the target last (same shape as buildMilestones steps). */
  values: number[];
}

/**
 * Stairs drawn before any test is logged: the same eight-stair rule from a typical first score, so the stairs
 * keep their shape (eight stairs, then the trophy) once a first score arrives.
 * Targets at or below the typical start climb from 200 points under the target instead.
 */
export function estimateMilestones(target: number): StairsEstimate {
  const start = target > ESTIMATE_START ? ESTIMATE_START : Math.max(0, target - 200);
  return stairSteps(start, target);
}
