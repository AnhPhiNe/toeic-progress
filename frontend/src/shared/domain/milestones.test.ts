import { describe, expect, it } from 'vitest';
import { buildMilestones } from '@/shared/domain/milestones';
import type { StudySession } from '@/shared/types';

let seq = 0;
const test = (date: string, totalScore: number | undefined, patch: Partial<StudySession> = {}): StudySession => ({
  id: `s${++seq}`, skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date, durationMinutes: 120,
  totalScore, createdAt: `${date}T08:00:00.000Z`, deletedAt: null, ...patch
});
const values = (plan: ReturnType<typeof buildMilestones>) => plan.status === 'empty' ? [] : plan.steps.map(s => s.value);

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

  it('builds a 25-point climb from a single test with the base reached on its date', () => {
    const plan = buildMilestones([test('2026-10-01', 620)], 800);
    expect(values(plan)).toEqual([600, 625, 650, 675, 700, 725, 750, 775, 800]);
    expect(plan).toMatchObject({ status: 'climbing', step: 25, best: 620, currentIndex: 0, next: { index: 1, value: 625, gap: 5 } });
    if (plan.status === 'empty') throw new Error('unexpected');
    expect(plan.steps[0]).toEqual({ value: 600, reached: true, reachedDate: '2026-10-01' });
    expect(plan.steps[1]).toEqual({ value: 625, reached: false });
  });

  it('is done with a single target step when the target is at or below the first score', () => {
    for (const target of [650, 700]) {
      const plan = buildMilestones([test('2026-10-01', 700)], target);
      expect(plan).toMatchObject({ status: 'done', best: 700, currentIndex: 0, steps: [{ value: target, reached: true, reachedDate: '2026-10-01' }] });
      expect(plan).not.toHaveProperty('next');
    }
  });

  it('keeps a below-target base when the target sits just above the first score', () => {
    const plan = buildMilestones([test('2026-10-01', 705)], 710);
    expect(values(plan)).toEqual([700, 710]);
    expect(plan).toMatchObject({ status: 'climbing', currentIndex: 0, next: { index: 1, value: 710, gap: 5 } });
  });

  it('keeps the best score after a later drop and dates each step by the first test reaching it', () => {
    const plan = buildMilestones([test('2026-10-01', 600), test('2026-10-08', 700), test('2026-10-15', 650)], 800);
    if (plan.status === 'empty') throw new Error('unexpected');
    expect(plan).toMatchObject({ status: 'climbing', best: 700, currentIndex: 4, next: { index: 5, value: 725, gap: 25 } });
    expect(plan.steps.slice(0, 5).map(s => s.reachedDate)).toEqual(['2026-10-01', '2026-10-08', '2026-10-08', '2026-10-08', '2026-10-08']);
    expect(plan.steps.slice(5).every(s => !s.reached && s.reachedDate === undefined)).toBe(true);
  });

  it('ends on the exact target when it is not a multiple of the step', () => {
    const plan = buildMilestones([test('2026-10-01', 610)], 785);
    expect(plan).toMatchObject({ step: 25 });
    expect(values(plan)).toEqual([600, 625, 650, 675, 700, 725, 750, 775, 785]);
  });

  it('widens the step to 50 or 100 for larger ranges', () => {
    expect(buildMilestones([test('2026-10-01', 500)], 800)).toMatchObject({ step: 50 });
    expect(values(buildMilestones([test('2026-10-01', 500)], 800))).toEqual([500, 550, 600, 650, 700, 750, 800]);
    const wide = buildMilestones([test('2026-10-01', 300)], 990);
    expect(wide).toMatchObject({ step: 100 });
    expect(values(wide)).toEqual([300, 400, 500, 600, 700, 800, 900, 990]);
  });

  it('still uses 100 when even 100 needs more than 8 steps', () => {
    const plan = buildMilestones([test('2026-10-01', 10)], 990);
    expect(plan).toMatchObject({ step: 100 });
    expect(values(plan)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 990]);
  });

  it('keeps 25 for short ranges even with fewer than 5 steps', () => {
    const plan = buildMilestones([test('2026-10-01', 760)], 800);
    expect(plan).toMatchObject({ step: 25 });
    expect(values(plan)).toEqual([750, 775, 800]);
  });

  it('orders same-day tests by createdAt for the start score', () => {
    const later = test('2026-10-01', 600, { createdAt: '2026-10-01T15:00:00.000Z' });
    const earlier = test('2026-10-01', 650, { createdAt: '2026-10-01T09:00:00.000Z' });
    const plan = buildMilestones([later, earlier], 800);
    expect(values(plan)[0]).toBe(650);
    expect(plan).toMatchObject({ best: 650, currentIndex: 0 });
  });

  it('marks done with every step reached once the best meets the target', () => {
    const plan = buildMilestones([test('2026-10-01', 620), test('2026-11-01', 805)], 800);
    if (plan.status === 'empty') throw new Error('unexpected');
    expect(plan.status).toBe('done');
    expect(plan.currentIndex).toBe(plan.steps.length - 1);
    expect(plan.steps.every(s => s.reached)).toBe(true);
    expect(plan.next).toBeUndefined();
  });
});
