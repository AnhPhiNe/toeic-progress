import { describe, expect, it } from 'vitest';
import { buildMilestones, stairSize } from '@/shared/domain/milestones';
import type { StudySession } from '@/shared/types';

let seq = 0;
const test = (date: string, totalScore: number | undefined, patch: Partial<StudySession> = {}): StudySession => ({
  id: `s${++seq}`, skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date, durationMinutes: 120,
  totalScore, createdAt: `${date}T08:00:00.000Z`, deletedAt: null, ...patch
});
const values = (plan: ReturnType<typeof buildMilestones>) => plan.status === 'empty' ? [] : plan.steps.map(s => s.value);
const plan = (sessions: StudySession[], target: number) => {
  const p = buildMilestones(sessions, target);
  if (p.status === 'empty') throw new Error('unexpected');
  return p;
};
/** Stairs left to climb to the trophy (the "N bậc nữa" heading). */
const left = (p: ReturnType<typeof plan>) => (p.status === 'done' ? 0 : p.steps.length - 1 - p.currentIndex);

describe('buildMilestones', () => {
  it('is empty when there is no usable full LR test', () => {
    const sessions = [
      test('2026-10-01', 700, { deletedAt: '2026-10-02T00:00:00.000Z' }),
      test('2026-10-01', 700, { sessionType: 'PART_PRACTICE' }),
      test('2026-10-01', 300, { skillType: 'SW' } as Partial<StudySession>),
      test('2026-10-01', undefined),
      test('2026-10-01', Number.NaN)
    ];
    expect(buildMilestones([], 800)).toEqual({ status: 'empty', target: 800 });
    expect(buildMilestones(sessions, 800)).toEqual({ status: 'empty', target: 800 });
  });

  it('picks 25, 50 or 100 points per stair from the first score alone', () => {
    expect(stairSize(800)).toBe(25);
    expect(stairSize(740)).toBe(25);
    expect(stairSize(560)).toBe(50);
    expect(stairSize(490)).toBe(50);
    expect(stairSize(300)).toBe(100);
    expect(stairSize(10)).toBe(100);
  });

  it('climbs from the first score on round stairs to the goal', () => {
    const p = plan([test('2026-10-01', 620)], 800);
    expect(values(p)).toEqual([620, 650, 700, 750, 800]);
    expect(p).toMatchObject({ status: 'climbing', step: 50, best: 620, currentIndex: 0, next: { index: 1, value: 650, gap: 30 } });
    expect(p.steps[0]).toEqual({ value: 620, reached: true, reachedDate: '2026-10-01' });
    expect(p.steps[1]).toEqual({ value: 650, reached: false });
    expect(values(plan([test('2026-10-01', 300)], 800))).toEqual([300, 400, 500, 600, 700, 800]);
    expect(values(plan([test('2026-10-01', 760)], 800))).toEqual([760, 775, 800]);
  });

  it("labels Sóc's step with the best score when it sits between two boundaries", () => {
    const p = plan([test('2026-10-01', 560), test('2026-10-15', 620), test('2026-11-01', 690)], 800);
    expect(values(p)).toEqual([560, 600, 690, 750, 800]);
    expect(p).toMatchObject({ currentIndex: 2, best: 690, next: { index: 3, value: 750, gap: 60 } });
  });

  it('keeps the best score after a later drop and dates each step by the first test reaching it', () => {
    const p = plan([test('2026-10-01', 600), test('2026-10-08', 700), test('2026-10-15', 650)], 800);
    expect(values(p)).toEqual([600, 650, 700, 750, 800]);
    expect(p).toMatchObject({ status: 'climbing', step: 50, best: 700, currentIndex: 2, next: { index: 3, value: 750, gap: 50 } });
    expect(p.steps.slice(0, 3).map(s => s.reachedDate)).toEqual(['2026-10-01', '2026-10-08', '2026-10-08']);
    expect(p.steps.slice(3).every(s => !s.reached && s.reachedDate === undefined)).toBe(true);
  });

  it('orders same-day tests by createdAt for the start score', () => {
    const later = test('2026-10-01', 600, { createdAt: '2026-10-01T15:00:00.000Z' });
    const earlier = test('2026-10-01', 650, { createdAt: '2026-10-01T09:00:00.000Z' });
    expect(values(plan([later, earlier], 800))[0]).toBe(650);
  });

  it('is done with the trophy right after Sóc once the best meets the goal', () => {
    const p = plan([test('2026-10-01', 620), test('2026-11-01', 805)], 800);
    expect(p.status).toBe('done');
    expect(values(p)).toEqual([620, 650, 700, 750, 805, 800]);
    expect(p.currentIndex).toBe(p.steps.length - 1);
    expect(p.steps.every(s => s.reached)).toBe(true);
    expect(p.next).toBeUndefined();
  });
});

describe('changing the goal never moves Sóc down', () => {
  const climb = [test('2026-10-01', 560), test('2026-10-15', 620), test('2026-11-01', 680)];
  const climbedPart = (p: ReturnType<typeof plan>) => p.steps.slice(0, (p.status === 'done' ? p.steps.length - 2 : p.currentIndex) + 1).map(s => s.value);

  it('raising adds stairs above Sóc and keeps the climbed ones', () => {
    const before = plan(climb, 800), after = plan(climb, 850);
    expect(values(before)).toEqual([560, 600, 680, 700, 750, 800]);
    expect(values(after)).toEqual([560, 600, 680, 700, 750, 800, 850]);
    expect(after.currentIndex).toBe(before.currentIndex);
    expect(left(after) - left(before)).toBe(1);
  });

  it('lowering removes stairs above Sóc only', () => {
    const before = plan(climb, 800), after = plan(climb, 750);
    expect(values(after)).toEqual([560, 600, 680, 700, 750]);
    expect(after.currentIndex).toBe(before.currentIndex);
    expect(left(after) - left(before)).toBe(-1);
  });

  it('lowering below the best keeps Sóc on her step with the trophy reached', () => {
    const after = plan(climb, 650);
    expect(after.status).toBe('done');
    expect(values(after)).toEqual([560, 600, 680, 650]);
    expect(climbedPart(after)).toEqual([560, 600, 680]);
  });

  it("keeps Sóc's step index and label for every goal", () => {
    for (const sessions of [climb, [test('2026-10-01', 300), test('2026-10-09', 455)], [test('2026-10-01', 745), test('2026-10-09', 812)]]) {
      const best = Math.max(...sessions.map(s => s.totalScore as number));
      const first = plan(sessions, 990);
      const sóc = first.currentIndex;
      for (let target = 10; target <= 990; target += 5) {
        const p = plan(sessions, target);
        const index = p.status === 'done' ? p.steps.length - 2 : p.currentIndex;
        expect(index).toBe(sóc);
        expect(p.steps[index].value).toBe(best);
        expect(climbedPart(p)).toEqual(climbedPart(first));
        // Never more than 11 blocks below the trophy (10 stairs from the first score to 990, plus the best label).
        expect(p.steps.length - 1).toBeLessThanOrEqual(11);
      }
    }
  });
});
