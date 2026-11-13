import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { daysUntil, forecast, journeyPoints, journeySeries, splitTarget, yGuides } from './scoreJourney';

let seq = 0;
const lastOf = <T,>(items: T[]): T => items[items.length - 1];
function test(date: string, total: number, extra: Partial<StudySession> = {}): StudySession {
  seq++;
  const listening = extra.scaledListening ?? Math.round(total / 2 / 5) * 5;
  return {
    id: `s${seq}`,
    skillType: 'LR',
    sessionType: 'FULL_TEST',
    testName: `Test ${String(seq).padStart(2, '0')}`,
    date,
    durationMinutes: 120,
    totalScore: total,
    scaledListening: listening,
    scaledReading: total - listening,
    createdAt: `${date}T0${seq % 10}:00:00Z`,
    ...extra
  };
}

/** Sketch mock-journey-score2 case "7 tests, 2 on the same day, 1 retake". */
function sketchSeven(): StudySession[] {
  seq = 0;
  return [
    test('2026-10-12', 620), test('2026-10-22', 665),
    test('2026-10-30', 690, { testName: 'ETS 2024 Test 03' }), test('2026-11-06', 725),
    test('2026-11-09', 710), test('2026-11-09', 740),
    test('2026-11-11', 765, { testName: 'ets 2024  test 03' })
  ];
}

describe('journeyPoints', () => {
  it('handles no tests', () => {
    expect(journeyPoints([])).toEqual([]);
    expect(forecast([], 800, '2026-12-20', '2026-11-12')).toBeNull();
  });

  it('ignores deleted, part practice, S&W and unscored sessions', () => {
    seq = 0;
    const points = journeyPoints([
      test('2026-11-01', 600),
      test('2026-11-02', 610, { deletedAt: '2026-11-03' }),
      test('2026-11-02', 610, { sessionType: 'PART_PRACTICE' }),
      test('2026-11-02', 610, { skillType: 'SW' }),
      test('2026-11-02', 610, { totalScore: undefined })
    ]);
    expect(points.map(p => p.id)).toEqual(['s1']);
  });

  it('marks retakes by name or attemptNumber and groups same-day tests', () => {
    const points = journeyPoints(sketchSeven());
    expect(points.map(p => p.retake)).toEqual([false, false, false, false, false, false, true]);
    expect(points.map(p => p.sameDayGroup)).toEqual([0, 1, 2, 3, 4, 4, 5]);
    seq = 0;
    expect(journeyPoints([test('2026-11-01', 600, { attemptNumber: 2 })])[0].retake).toBe(true);
  });

  it('puts all tests of one day in one bracket, sorted by createdAt', () => {
    seq = 0;
    const late = test('2026-11-09', 700, { createdAt: '2026-11-09T20:00:00Z' });
    const early = test('2026-11-09', 650, { createdAt: '2026-11-09T08:00:00Z' });
    const points = journeyPoints([late, early, test('2026-11-09', 720, { createdAt: '2026-11-09T22:00:00Z' })]);
    expect(points.map(p => p.score)).toEqual([650, 700, 720]);
    expect(points.every(p => p.sameDayGroup === 0)).toBe(true);
  });

  it('shows the last 8 and counts the hidden ones', () => {
    seq = 0;
    const scores = [560, 575, 590, 600, 610, 620, 650, 665, 680, 690, 705, 725, 740, 760];
    const sessions = scores.map((s, i) => test(`2026-10-${String(i + 1).padStart(2, '0')}`, s));
    const series = journeySeries(sessions);
    expect(series.points.map(p => p.score)).toEqual(scores.slice(-8));
    expect(series.hiddenCount).toBe(6);
    expect(journeyPoints(sessions, { limit: 3 })).toHaveLength(3);
  });

  it('excludes an abnormal drop and lets the learner force it back in', () => {
    seq = 0;
    const sessions = [test('2026-10-12', 620), test('2026-10-22', 665), test('2026-10-30', 690),
      test('2026-11-06', 725), test('2026-11-11', 640)];
    const last = lastOf(journeyPoints(sessions));
    expect(last).toMatchObject({ excluded: true, excludeReason: 'drop', forced: false });
    expect(last.deviation).toBeLessThan(-60);
    const forced = lastOf(journeyPoints(sessions, { forceInclude: [last.id] }));
    expect(forced).toMatchObject({ excluded: false, excludeReason: 'drop', forced: true });
  });

  it('keeps normal ups and downs and the sketch cases in the trend', () => {
    seq = 0;
    const bumpy = [620, 690, 650, 705, 680].map((s, i) => test(`2026-10-${10 + i}`, s));
    expect(journeyPoints(bumpy).some(p => p.excluded)).toBe(false);
    expect(journeyPoints(sketchSeven()).some(p => p.excluded)).toBe(false);
  });

  it('counts a sustained drop again instead of hiding a real change', () => {
    seq = 0;
    const sessions = [620, 665, 690, 725, 600, 610].map((s, i) => test(`2026-10-${10 + i}`, s));
    expect(journeyPoints(sessions).some(p => p.excluded)).toBe(false);
  });

  it('plots and judges Nghe / Äá»c on their own scale', () => {
    seq = 0;
    const sessions = [test('2026-10-01', 600, { scaledListening: 320 }), test('2026-10-02', 650, { scaledListening: 340 }),
      test('2026-10-03', 680, { scaledListening: undefined, scaledReading: undefined })];
    expect(journeyPoints(sessions, { metric: 'listening' }).map(p => p.score)).toEqual([320, 340]);
    expect(journeyPoints(sessions, { metric: 'reading' }).map(p => p.score)).toEqual([280, 310]);
  });
});

describe('splitTarget', () => {
  it('follows the recent L/R balance and sums to the target (sketch: 800 -> 410/390)', () => {
    seq = 0;
    const sessions = [test('2026-10-01', 600, { scaledListening: 300 }),
      test('2026-11-01', 770, { scaledListening: 395 }), test('2026-11-05', 760, { scaledListening: 385 }),
      test('2026-11-09', 765, { scaledListening: 390 })];
    expect(splitTarget(800, sessions)).toEqual({ listening: 410, reading: 390 });
  });

  it('ignores retakes when first attempts exist', () => {
    seq = 0;
    const sessions = [test('2026-11-01', 700, { scaledListening: 350, testName: 'A' }),
      test('2026-11-02', 800, { scaledListening: 495, testName: 'A' })];
    expect(splitTarget(800, sessions)).toEqual({ listening: 400, reading: 400 });
  });

  it('splits evenly with no section scores', () => {
    expect(splitTarget(800, [])).toEqual({ listening: 400, reading: 400 });
  });

  it('caps each side at 495 and hands the rest to the other side', () => {
    seq = 0;
    const strongListener = [test('2026-11-01', 700, { scaledListening: 450 })];
    expect(splitTarget(950, strongListener)).toEqual({ listening: 495, reading: 455 });
    const strongReader = [test('2026-11-01', 700, { scaledListening: 200 })];
    expect(splitTarget(950, strongReader)).toEqual({ listening: 455, reading: 495 });
    expect(splitTarget(2000, strongReader)).toEqual({ listening: 495, reading: 495 });
  });

  it('always sums to the target', () => {
    seq = 0;
    const sessions = [test('2026-11-01', 700, { scaledListening: 377 })];
    for (const target of [300, 555, 805, 990]) {
      const { listening, reading } = splitTarget(target, sessions);
      expect(listening + reading).toBe(target);
      if (listening < 495 && reading < 495) expect(listening % 10).toBe(0);
      expect(Math.max(listening, reading)).toBeLessThanOrEqual(495);
    }
  });
});

describe('yGuides', () => {
  it('keeps the score line readable when the target is far (pinned at the top)', () => {
    seq = 0;
    const points = journeyPoints([450, 475, 495, 520].map((s, i) => test(`2026-10-${20 + i}`, s)));
    const scale = yGuides(points, 800);
    expect(scale.targetPinned).toBe(true);
    expect(scale.max).toBeLessThan(600);
    expect(scale.step).toBe(25);
    expect(scale.ticks).toEqual([450, 475, 500, 525, 550]);
  });

  it('includes the target and forecast, and drops a guide next to the target line', () => {
    const points = journeyPoints(sketchSeven());
    const scale = yGuides(points, 800, { forecastScore: 810 });
    expect(scale.targetPinned).toBe(false);
    expect(scale.min).toBe(600);
    expect(scale.max).toBe(825);
    expect(scale.step).toBe(50);
    expect(scale.ticks).toEqual([600, 650, 700, 750]);
    expect(scale.ticks.length).toBeLessThanOrEqual(6);
  });

  it('gives a sane range for one test or none and never exceeds the section cap', () => {
    seq = 0;
    const one = journeyPoints([test('2026-11-01', 700)]);
    const s1 = yGuides(one, 750);
    expect(s1.min).toBe(680);
    expect(s1.ticks.length).toBeGreaterThan(0);
    const empty = yGuides([], 800);
    expect(empty.max).toBeGreaterThan(empty.min);
    const listening = journeyPoints([test('2026-11-01', 900, { scaledListening: 480 })], { metric: 'listening' });
    expect(yGuides(listening, 495, { metric: 'listening' }).max).toBe(495);
  });
});

describe('forecast', () => {
  it('matches the sketch: about 2 more tests to reach 800, before the exam', () => {
    const points = journeyPoints(sketchSeven());
    const f = forecast(points, 800, '2026-12-20', '2026-11-12');
    expect(f).toMatchObject({ kind: 'rising', testsAhead: 2, slot: 8, inView: true, beforeExam: true, daysLeft: 38 });
    if (f?.kind !== 'rising') throw new Error('expected rising');
    expect(f.score).toBeGreaterThanOrEqual(800);
    expect(f.estDate! > '2026-11-11').toBe(true);
    expect(f.atExam!).toBeGreaterThan(800);
  });

  it('matches the 14-test sketch: 3 more tests over the last 8', () => {
    seq = 0;
    const scores = [560, 575, 590, 600, 610, 620, 650, 665, 680, 690, 705, 725, 740, 760];
    const points = journeyPoints(scores.map((s, i) => test(`2026-10-${String(i + 1).padStart(2, '0')}`, s)));
    expect(forecast(points, 800, null, '2026-11-12')).toMatchObject({ kind: 'rising', testsAhead: 3, daysLeft: null, atExam: null, beforeExam: null });
  });

  it('ignores an excluded drop, and uses it again when forced', () => {
    seq = 0;
    const sessions = [test('2026-10-12', 620), test('2026-10-22', 665), test('2026-10-30', 690),
      test('2026-11-06', 725), test('2026-11-11', 640)];
    const points = journeyPoints(sessions);
    const f = forecast(points, 800, '2026-12-20', '2026-11-12');
    expect(f?.kind).toBe('rising');
    const forced = journeyPoints(sessions, { forceInclude: [points[4].id] });
    const g = forecast(forced, 800, '2026-12-20', '2026-11-12');
    if (f?.kind !== 'rising') throw new Error('expected rising');
    if (g?.kind === 'rising') expect(g.testsAhead).toBeGreaterThan(f.testsAhead);
  });

  it('slow rise: the hit is out of view and the exam-day value is below target', () => {
    seq = 0;
    const points = journeyPoints([620, 640, 635, 655, 650].map((s, i) => test(`2026-10-${12 + i * 4}`, s)));
    const f = forecast(points, 800, '2026-12-20', '2026-11-12');
    if (f?.kind !== 'rising') throw new Error('expected rising');
    expect(f.inView).toBe(false);
    expect(f.beforeExam).toBe(false);
    expect(f.atExam!).toBeLessThan(800);
  });

  it('returns null for flat or falling trends and too few tests', () => {
    seq = 0;
    const flat = journeyPoints([700, 700, 700].map((s, i) => test(`2026-10-1${i}`, s)));
    expect(forecast(flat, 800, '2026-12-20', '2026-11-12')).toBeNull();
    const falling = journeyPoints([720, 700, 690].map((s, i) => test(`2026-10-1${i}`, s)));
    expect(forecast(falling, 800, '2026-12-20', '2026-11-12')).toBeNull();
    const one = journeyPoints([test('2026-11-01', 700)]);
    expect(forecast(one, 800, '2026-12-20', '2026-11-12')).toBeNull();
  });

  it('two tests are enough for a forecast', () => {
    seq = 0;
    const points = journeyPoints([test('2026-11-01', 700), test('2026-11-08', 740)]);
    expect(forecast(points, 800, '2026-12-20', '2026-11-12')).toMatchObject({ kind: 'rising', testsAhead: 2, estDate: '2026-11-22' });
  });

  it('all tests on the same day: forecast in tests, no date estimate', () => {
    seq = 0;
    const points = journeyPoints([650, 680, 700].map(s => test('2026-11-09', s)));
    expect(new Set(points.map(p => p.sameDayGroup)).size).toBe(1);
    expect(forecast(points, 800, '2026-12-20', '2026-11-12')).toMatchObject({ kind: 'rising', estDate: null, atExam: null, beforeExam: null });
  });

  it('target already reached', () => {
    seq = 0;
    const points = journeyPoints([700, 780, 810].map((s, i) => test(`2026-10-1${i}`, s)));
    expect(forecast(points, 800, '2026-12-20', '2026-11-12')).toEqual({ kind: 'reached', daysLeft: 38 });
    expect(forecast(points.slice(-1), 800, null, '2026-11-12')).toEqual({ kind: 'reached', daysLeft: null });
  });

  it('caps forecast values at 495 on a section', () => {
    seq = 0;
    const points = journeyPoints([400, 440, 480].map((s, i) => test(`2026-10-1${i}`, 900, { scaledListening: s })), { metric: 'listening' });
    const f = forecast(points, 495, '2027-06-01', '2026-11-12', { metric: 'listening' });
    if (f?.kind !== 'rising') throw new Error('expected rising');
    expect(f.score).toBe(495);
    expect(f.atExam).toBe(495);
  });
});

describe('daysUntil', () => {
  it('counts whole days and hides a passed exam', () => {
    expect(daysUntil('2026-12-20', '2026-11-12')).toBe(38);
    expect(daysUntil('2026-11-12', '2026-11-12')).toBe(0);
    expect(daysUntil('2026-11-01', '2026-11-12')).toBeNull();
    expect(daysUntil(null, '2026-11-12')).toBeNull();
  });
});
