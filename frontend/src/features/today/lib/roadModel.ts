/** Data of the Hôm nay road from the learner's tests: milestones, projected dates, flags and the sky sign. */
import type { StudySession } from '@/shared/types';
import { STAIR_COUNT, buildMilestones, estimateMilestones, type MilestonePlan } from '@/shared/domain/milestones';
import { forecast, journeyPoints, scoredFullTests } from '@/features/journey/lib/scoreJourney';
import { lateForExam, roadSign, type FlagTest } from './roadLayout';

export interface RoadModel {
  plan: MilestonePlan;
  steps: { value: number; reached: boolean; reachedDate?: string }[];
  cur: number;
  best: number;
  done: boolean;
  estimate: boolean;
  /** Projected ISO date per step (stops still ahead, the goal last); null when unknown. */
  proj: (string | null)[];
  tests: FlagTest[];
  walkFrom: number;
  sign: string;
  /** The projection lands after the exam. */
  late: boolean;
  /** Tests still needed on the trend, null without a rising trend. */
  testsAhead: number | null;
}

/** Highest stop whose value is at or below the score (0 when none). */
export function stopAtOrBelow(values: readonly number[], score: number): number {
  let k = 0;
  for (let i = 0; i < Math.min(STAIR_COUNT, values.length); i++) if (values[i] <= score) k = i;
  return k;
}

export function buildRoadModel(sessions: StudySession[], target: number, examDate: string | null | undefined, today: string, previewTarget = target): RoadModel {
  const plan = buildMilestones(sessions, target);
  const scored = scoredFullTests(sessions);
  const tests: FlagTest[] = scored.map(s => ({ id: s.id, score: s.totalScore as number, date: s.date, name: s.testName }));
  if (plan.status === 'empty') {
    const est = estimateMilestones(previewTarget);
    return {
      plan, steps: est.values.map(value => ({ value, reached: false })), cur: -1, best: 0, done: false, estimate: true,
      proj: est.values.map(() => null), tests, walkFrom: 0, late: false, testsAhead: null,
      sign: roadSign({ target: previewTarget, tests: 0, reached: false, goalDate: null, testsAhead: null, examDate, today })
    };
  }
  const done = plan.status === 'done';
  const points = journeyPoints(sessions);
  const fc = forecast(points, target, examDate, today);
  const rising = fc && fc.kind === 'rising' ? fc : null;
  const values = plan.steps.map(s => s.value);
  const proj = values.map((value, i) => {
    if (done || plan.steps[i].reached || value <= plan.best) return null;
    if (i === values.length - 1) return rising?.estDate ?? null;
    const f = forecast(points, value, examDate, today);
    return f && f.kind === 'rising' ? f.estDate : null;
  });
  const prevBest = tests.length > 1 ? Math.max(...tests.slice(0, -1).map(t => t.score)) : null;
  const walkFrom = prevBest === null ? 0 : stopAtOrBelow(values, prevBest);
  const goalDate = rising?.estDate ?? null;
  return {
    plan, steps: plan.steps, cur: plan.currentIndex, best: plan.best, done, estimate: false, proj, tests, walkFrom,
    testsAhead: rising?.testsAhead ?? null, late: lateForExam(goalDate, examDate, today),
    sign: roadSign({ target, tests: tests.length, reached: done, goalDate, testsAhead: rising?.testsAhead ?? null, examDate, today })
  };
}
