import { describe, it, expect } from 'vitest';
import type { PacingRun } from '@/shared/types';
import { pacingChartRuns, pacingSpeedAxis, runAccuracy, runSpeed, studySecondsForDay, studyTimeLabel } from './pacingStats';
import type { PacingMode } from './pacingModel';

const run = (id: string, patch: Partial<PacingRun> = {}): PacingRun => ({ id, presetId: 'PART_5', presetName: 'Part 5', partType: 'PART_5', date: '2026-10-09', createdAt: `2026-10-09T00:00:${id.padStart(2, '0')}Z`, plannedMinutes: 12, actualMinutes: 10, actualSeconds: 600, finishedNaturally: false, phases: [], totalQuestions: 30, ...patch });
describe('pacing statistics', () => {
  it('totals only saved real study time for the day, excluding breaks, deleted and invalid results', () => {
    const date = '2026-10-09';
    const runs = [run('1', { actualSeconds: 1500 }), run('2', { partType: 'POMODORO', presetId: 'POMODORO_WORK', actualSeconds: 3300 }),
      run('3', { partType: 'POMODORO', presetId: 'POMODORO_SHORT_BREAK', actualSeconds: 300 }),
      run('4', { partType: 'POMODORO', presetId: 'POMODORO_LONG_BREAK', actualSeconds: 900 }),
      run('5', { actualSeconds: 100, deletedAt: date }), run('6', { actualSeconds: 900, date: '2026-10-08' }),
      run('7', { actualSeconds: NaN }), run('8', { actualSeconds: undefined, actualMinutes: .5 })];
    expect(studySecondsForDay(runs, date)).toBe(4830);
    expect(studyTimeLabel(4830)).toBe('1 giờ 20 phút');
    expect(studyTimeLabel(3600)).toBe('1 giờ');
    expect(studyTimeLabel(60)).toBe('1 phút');
    expect(studyTimeLabel(.5)).toBe('Dưới 1 phút');
    expect(studyTimeLabel(0)).toBe('0 phút');
  });
  it('keeps every eligible result in a day and never treats missing grades as zero', () => {
    const runs = Array.from({ length: 28 }, (_, index) => run(String(index), index === 0 ? { correctAnswers: 0 } : {}));
    expect(pacingChartRuns(runs, 'PART_5', 'ALL')).toHaveLength(28);
    expect(pacingChartRuns(runs, 'PART_5', 'TODAY', '2026-10-09')).toHaveLength(28);
    expect(runAccuracy(runs[0])).toBe(0);
    expect(runAccuracy(runs[1])).toBeNull();
    expect(runSpeed(runs[1])).toBe(20);
    expect(runAccuracy(run('x', { accuracyPercent: 80 }))).toBeNull();
  });
  it('keeps repeated and unnamed exercises as separate attempts without mutating or mixing modes', () => {
    const runs = [run('1', { testName: 'ETS Test 1', correctAnswers: 20 }), run('2', { testName: '  ｅｔｓ   test 1 ', correctAnswers: 24, actualSeconds: 700 }),
      run('3'), run('4'), run('5', { testName: 'ETS Test 1', totalQuestions: 10, correctAnswers: 8 }), run('6', { testName: 'ETS Test 1', actualSeconds: 60 })];
    const snapshot = JSON.stringify(runs);
    expect(pacingChartRuns(runs, 'PART_5', 'ALL').map(row => row.id)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(pacingChartRuns(runs, 'PART_5', 'YESTERDAY', '2026-10-10').map(row => row.id)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(JSON.stringify(runs)).toBe(snapshot);
  });
  it('excludes deleted, other modes and invalid timing; rejects invalid grades', () => {
    const runs = [run('1'), run('2', { deletedAt: 'x' }), run('3', { partType: 'PART_6' }), run('4', { actualSeconds: 0 }), run('5', { totalQuestions: 0 })];
    expect(pacingChartRuns(runs, 'PART_5', 'ALL').map(row => row.id)).toEqual(['1']);
    expect(runAccuracy(run('6', { correctAnswers: 31 }))).toBeNull();
    expect(runAccuracy(run('7', { correctAnswers: 2.5 }))).toBeNull();
  });
  it('keeps each Part 7 variant and full Reading separate even with the same test name', () => {
    const modes: PacingMode[] = ['PART_5', 'PART_6', 'PART_7_SINGLE', 'PART_7_MULTI', 'PART_7', 'FULL_READING', 'POMODORO'];
    const runs = modes.map((mode, index) => run(String(index), { partType: mode, testName: 'ETS Test 1' }));
    for (const mode of modes) {
      expect(pacingChartRuns(runs, mode, 'ALL').map(row => row.partType)).toEqual(mode === 'POMODORO' ? [] : [mode]);
    }
  });
  it('filters calendar days inclusively, including month boundaries, without counting future results', () => {
    const runs = ['2026-02-28', '2026-03-01', '2026-03-23', '2026-03-24', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'].map((date, index) => run(String(index), { date }));
    const dates = (scope: 'TODAY' | 'YESTERDAY' | 'LAST_3_DAYS' | 'LAST_7_DAYS', today = '2026-03-30') => pacingChartRuns(runs, 'PART_5', scope, today).map(row => row.date);
    expect(dates('TODAY')).toEqual(['2026-03-30']);
    expect(dates('YESTERDAY')).toEqual(['2026-03-29']);
    expect(dates('LAST_3_DAYS')).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    expect(dates('LAST_7_DAYS')).toEqual(['2026-03-24', '2026-03-28', '2026-03-29', '2026-03-30']);
    expect(dates('YESTERDAY', '2026-03-01')).toEqual(['2026-02-28']);
    expect(dates('LAST_3_DAYS', '2026-03-01')).toEqual(['2026-02-28', '2026-03-01']);
  });
  it('rejects invalid calendar dates when filtering a recent period', () => {
    const runs = [run('1', { date: '2026-02-28' }), run('2', { date: '2026-02-30' })];
    expect(pacingChartRuns(runs, 'PART_5', 'LAST_7_DAYS', '2026-03-03').map(row => row.id)).toEqual(['1']);
    expect(pacingChartRuns(runs, 'PART_5', 'LAST_7_DAYS', '2026-03-99')).toEqual([]);
  });
  it('scales from zero around actual speed with rounded ticks and space above the highest bar', () => {
    const samples = [.1, 7.9].map((speed, index) => run(String(index), { actualSeconds: speed * 30 }));
    expect(pacingSpeedAxis(samples)).toEqual({ ceiling: 10, ticks: [0, 2, 4, 6, 8, 10] });
    expect(pacingSpeedAxis([run('1', { actualSeconds: 32 * 30 })])).toEqual({ ceiling: 40, ticks: [0, 10, 20, 30, 40] });
    expect(pacingSpeedAxis([samples[0]])).toEqual({ ceiling: 1, ticks: [0, .2, .4, .6, .8, 1] });
    expect(pacingSpeedAxis([])).toEqual(pacingSpeedAxis([run('1', { actualSeconds: 0 })]));
    const extreme = pacingSpeedAxis([run('1', { actualSeconds: Number.MAX_VALUE, totalQuestions: 1 })]);
    expect(extreme.ceiling).toBe(Number.MAX_VALUE);
    expect(extreme.ticks.every(Number.isFinite)).toBe(true);
  });
});
