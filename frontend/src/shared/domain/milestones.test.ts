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

  it('always builds eight even stairs, the gap split in 8 and rounded up to 10', () => {
    const plan = buildMilestones([test('2026-10-01', 620)], 800);
    expect(values(plan)).toEqual([560, 590, 620, 650, 680, 710, 740, 770, 800]);
    expect(plan).toMatchObject({ status: 'climbing', step: 30, best: 620, currentIndex: 2, next: { index: 3, value: 650, gap: 30 } });
    if (plan.status === 'empty') throw new Error('unexpected');
    expect(plan.steps[0]).toEqual({ value: 560, reached: true, reachedDate: '2026-10-01' });
    expect(plan.steps[3]).toEqual({ value: 650, reached: false });
  });

  it('is done with a single target step when the target is at or below the first score', () => {
    for (const target of [650, 700]) {
      const plan = buildMilestones([test('2026-10-01', 700)], target);
      expect(plan).toMatchObject({ status: 'done', best: 700, currentIndex: 0, steps: [{ value: target, reached: true, reachedDate: '2026-10-01' }] });
      expect(plan).not.toHaveProperty('next');
    }
  });

  it('uses 10-point stairs when the target sits just above the first score', () => {
    const plan = buildMilestones([test('2026-10-01', 705)], 710);
    expect(values(plan)).toEqual([630, 640, 650, 660, 670, 680, 690, 700, 710]);
    expect(plan).toMatchObject({ status: 'climbing', step: 10, currentIndex: 7, next: { index: 8, value: 710, gap: 5 } });
  });

  it('keeps the best score after a later drop and dates each step by the first test reaching it', () => {
    const plan = buildMilestones([test('2026-10-01', 600), test('2026-10-08', 700), test('2026-10-15', 650)], 800);
    if (plan.status === 'empty') throw new Error('unexpected');
    expect(plan).toMatchObject({ status: 'climbing', step: 30, best: 700, currentIndex: 4, next: { index: 5, value: 710, gap: 10 } });
    expect(plan.steps.slice(0, 5).map(s => s.reachedDate)).toEqual(['2026-10-01', '2026-10-01', '2026-10-08', '2026-10-08', '2026-10-08']);
    expect(plan.steps.slice(5).every(s => !s.reached && s.reachedDate === undefined)).toBe(true);
  });

  it('ends on the exact target, the first stair at or below the first score', () => {
    expect(values(buildMilestones([test('2026-10-01', 610)], 785))).toEqual([545, 575, 605, 635, 665, 695, 725, 755, 785]);
    expect(values(buildMilestones([test('2026-10-01', 500)], 800))).toEqual([480, 520, 560, 600, 640, 680, 720, 760, 800]);
    expect(values(buildMilestones([test('2026-10-01', 300)], 990))).toEqual([270, 360, 450, 540, 630, 720, 810, 900, 990]);
    expect(values(buildMilestones([test('2026-10-01', 760)], 800))).toEqual([720, 730, 740, 750, 760, 770, 780, 790, 800]);
  });

  it('collapses stairs that would go below zero onto one 0 stair', () => {
    const plan = buildMilestones([test('2026-10-01', 10)], 990);
    expect(plan).toMatchObject({ step: 130, currentIndex: 0 });
    expect(values(plan)).toEqual([0, 80, 210, 340, 470, 600, 730, 860, 990]);
  });

  it('orders same-day tests by createdAt for the start score', () => {
    const later = test('2026-10-01', 600, { createdAt: '2026-10-01T15:00:00.000Z' });
    const earlier = test('2026-10-01', 650, { createdAt: '2026-10-01T09:00:00.000Z' });
    const plan = buildMilestones([later, earlier], 800);
    // Start 650 (the earlier test): gap 150 gives 20-point stairs from 640.
    expect(values(plan)[0]).toBe(640);
    expect(plan).toMatchObject({ step: 20, best: 650, currentIndex: 0 });
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
