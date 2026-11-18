import { describe, expect, it } from 'vitest';
import { STAIR_COUNT, buildMilestones, stairSteps } from '@/shared/domain/milestones';
import type { StudySession } from '@/shared/types';

let seq = 0;
const test = (date: string, totalScore: number | undefined, patch: Partial<StudySession> = {}): StudySession => ({
  id: `s${++seq}`, skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date, durationMinutes: 120,
  totalScore, createdAt: `${date}T08:00:00.000Z`, deletedAt: null, ...patch
});
const plan = (sessions: StudySession[], target: number) => {
  const p = buildMilestones(sessions, target);
  if (p.status === 'empty') throw new Error('unexpected');
  return p;
};
/** The eight stairs (without the trophy). */
const stairs = (p: ReturnType<typeof plan>) => p.steps.slice(0, STAIR_COUNT).map(s => s.value);

describe('buildMilestones: eight stairs, then the trophy', () => {
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

  it('1 · first test 535, goal 800: starts at 500, Sóc on stair 1', () => {
    const p = plan([test('2026-10-01', 535)], 800);
    expect(stairs(p)).toEqual([500, 540, 580, 610, 650, 690, 730, 760]);
    expect(p.steps[STAIR_COUNT]).toMatchObject({ value: 800, reached: false });
    expect(p).toMatchObject({ status: 'climbing', step: 38, best: 535, currentIndex: 0, next: { index: 1, value: 540, gap: 5 } });
    expect(p.steps[0]).toEqual({ value: 500, reached: true, reachedDate: '2026-10-01' });
  });

  it('2 · 535 then best 600, goal 800: Sóc on stair 3 (580)', () => {
    const p = plan([test('2026-10-01', 535), test('2026-10-20', 600)], 800);
    expect(stairs(p)).toEqual([500, 540, 580, 610, 650, 690, 730, 760]);
    expect(p).toMatchObject({ currentIndex: 2, best: 600, next: { index: 3, value: 610, gap: 10 } });
    expect(p.steps.slice(0, 3).map(s => s.reachedDate)).toEqual(['2026-10-01', '2026-10-20', '2026-10-20']);
    expect(p.steps.slice(3).every(s => !s.reached && s.reachedDate === undefined)).toBe(true);
  });

  it('3 · best 535, goal 650: narrow stairs from 500', () => {
    const p = plan([test('2026-10-01', 535)], 650);
    expect(stairs(p)).toEqual([500, 520, 540, 560, 580, 590, 610, 630]);
    expect(p.currentIndex).toBe(1);
  });

  it('4 · best 750, goal 800: stairs would be under 10 points, so they start at 720', () => {
    const p = plan([test('2026-10-01', 750)], 800);
    expect(stairs(p)).toEqual([720, 730, 740, 750, 760, 770, 780, 790]);
    expect(p).toMatchObject({ currentIndex: 3, step: 10 });
  });

  it('5 · 900 then best 960, goal 990: Sóc on stair 6', () => {
    const p = plan([test('2026-10-01', 900), test('2026-11-01', 960)], 990);
    expect(stairs(p)).toEqual([900, 910, 920, 930, 950, 960, 970, 980]);
    expect(p.currentIndex).toBe(5);
  });

  it('6 · best 680, goal 800 → 900: the stairs spread and Sóc drops from stair 5 to stair 4', () => {
    const climb = [test('2026-10-01', 520), test('2026-11-01', 680)];
    const before = plan(climb, 800), after = plan(climb, 900);
    expect(stairs(before)).toEqual([500, 540, 580, 610, 650, 690, 730, 760]);
    expect(stairs(after)).toEqual([500, 550, 600, 650, 700, 750, 800, 850]);
    expect(before.currentIndex).toBe(4);
    expect(after.currentIndex).toBe(3);
    expect(after.best).toBe(680);
    expect(after.step).toBe(50);
  });

  it('orders same-day tests by createdAt for the start score', () => {
    const later = test('2026-10-01', 600, { createdAt: '2026-10-01T15:00:00.000Z' });
    const earlier = test('2026-10-01', 660, { createdAt: '2026-10-01T09:00:00.000Z' });
    expect(stairs(plan([later, earlier], 800))[0]).toBe(650);
  });

  it('is done with every stair gold once the best meets the goal', () => {
    const p = plan([test('2026-10-01', 620), test('2026-11-01', 805)], 800);
    expect(p.status).toBe('done');
    expect(p.steps).toHaveLength(STAIR_COUNT + 1);
    expect(p.currentIndex).toBe(STAIR_COUNT);
    expect(p.steps.every(s => s.reached)).toBe(true);
    expect(p.next).toBeUndefined();
    // A first score above the goal still gets eight stairs below the trophy.
    const over = plan([test('2026-10-01', 720)], 650);
    expect(over.status).toBe('done');
    expect(stairs(over)).toEqual([570, 580, 590, 600, 610, 620, 630, 640]);
  });
});

describe('the eight-stair rule for every first score, best and goal', () => {
  it('always draws eight distinct rising stairs below the trophy', () => {
    for (let target = 10; target <= 990; target += 5) {
      for (const start of [0, 200, 450, 500, 700, 900, 950]) {
        const { values } = stairSteps(start, target);
        expect(values).toHaveLength(STAIR_COUNT + 1);
        expect(values[STAIR_COUNT]).toBe(target);
        for (let k = 1; k <= STAIR_COUNT; k++) expect(values[k]).toBeGreaterThan(values[k - 1]);
        expect(values[0]).toBeGreaterThanOrEqual(0);
        if (target >= STAIR_COUNT * 10) for (let k = 1; k <= STAIR_COUNT; k++) expect(values[k] - values[k - 1]).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('puts Sóc on the highest stair at or below the best, with gold below and locked above', () => {
    for (const first of [300, 535, 610, 745, 900]) {
      for (const bump of [0, 20, 75, 140]) {
        const best = first + bump;
        for (let target = 100; target <= 990; target += 25) {
          const p = plan([test('2026-10-01', first), test('2026-10-09', best)], target);
          if (best >= target) {
            expect(p.status).toBe('done');
            expect(p.steps.every(s => s.reached)).toBe(true);
            continue;
          }
          const cur = p.currentIndex;
          expect(cur).toBeGreaterThanOrEqual(0);
          expect(cur).toBeLessThan(STAIR_COUNT);
          expect(p.steps[cur].value).toBeLessThanOrEqual(best);
          if (cur < STAIR_COUNT - 1) expect(p.steps[cur + 1].value).toBeGreaterThan(best);
          expect(p.steps.slice(0, cur + 1).every(s => s.reached)).toBe(true);
          expect(p.steps.slice(cur + 1).every(s => !s.reached)).toBe(true);
        }
      }
    }
  });
});
