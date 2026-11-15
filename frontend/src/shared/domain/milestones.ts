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

const STEP_SIZES = [25, 50, 100] as const;
const MAX_STEPS = 8;

interface ScoredTest { date: string; createdAt: string; score: number }

function scoredFullTests(sessions: StudySession[]): ScoredTest[] {
  return sessions
    .filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.skillType === 'LR'
      && typeof s.totalScore === 'number' && Number.isFinite(s.totalScore))
    .map(s => ({ date: s.date, createdAt: s.createdAt ?? '', score: s.totalScore as number }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** Smallest of 25/50/100 that keeps the climb from base to target within 8 steps; 100 if none does. */
function chooseStep(start: number, target: number): number {
  for (const step of STEP_SIZES) {
    const base = Math.floor(start / step) * step;
    if (Math.ceil((target - base) / step) <= MAX_STEPS) return step;
  }
  return STEP_SIZES[STEP_SIZES.length - 1];
}

/** base, base+step, … strictly below target, then target. If base already meets target, only target. */
function stepValues(start: number, target: number, step: number): number[] {
  const base = Math.floor(start / step) * step;
  if (base >= target) return [target];
  const values: number[] = [];
  for (let value = base; value < target; value += step) values.push(value);
  values.push(target);
  return values;
}

export function buildMilestones(sessions: StudySession[], targetScore: number): MilestonePlan {
  const target = targetScore;
  const tests = scoredFullTests(sessions);
  if (!tests.length) return { status: 'empty', target };

  const start = tests[0].score;
  const best = Math.max(...tests.map(t => t.score));
  const step = chooseStep(start, target);

  // Base sits at or below the first score, so the first test always reaches it.
  const steps: MilestoneStep[] = stepValues(start, target, step).map(value => {
    const hit = tests.find(t => t.score >= value);
    return hit ? { value, reached: true, reachedDate: hit.date } : { value, reached: false };
  });

  let currentIndex = 0;
  steps.forEach((s, i) => { if (s.reached) currentIndex = i; });

  if (best >= target) return { status: 'done', target, step, best, steps, currentIndex };
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
 * step rule as buildMilestones so the real stairs look alike once a first score arrives.
 * Targets at or below the typical start climb from 200 points under the target instead.
 */
export function estimateMilestones(target: number): StairsEstimate {
  const start = target > ESTIMATE_START ? ESTIMATE_START : Math.max(0, target - 200);
  const step = chooseStep(start, target);
  return { step, values: stepValues(start, target, step) };
}
