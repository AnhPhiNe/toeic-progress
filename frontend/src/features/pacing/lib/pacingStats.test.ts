import { describe, it, expect } from 'vitest';
import type { PacingRun } from '@/shared/types';
import { pacingChartRuns, runAccuracy, runSpeed } from './pacingStats';

const run = (id: string, patch: Partial<PacingRun> = {}): PacingRun => ({ id, presetId: 'PART_5', presetName: 'Part 5', partType: 'PART_5', date: '2026-10-09', createdAt: `2026-10-09T00:00:${id.padStart(2, '0')}Z`, plannedMinutes: 12, actualMinutes: 10, actualSeconds: 600, finishedNaturally: false, phases: [], totalQuestions: 30, ...patch });
describe('pacing statistics', () => {
  it('uses every eligible result in All, five in Recent, and never treats missing grades as zero', () => {
    const runs = Array.from({ length: 18 }, (_, index) => run(String(index), index === 0 ? { correctAnswers: 0 } : {}));
    expect(pacingChartRuns(runs, 'PART_5', 'ALL')).toHaveLength(18);
    expect(pacingChartRuns(runs, 'PART_5', 'RECENT_5')).toHaveLength(5);
    expect(runAccuracy(runs[0])).toBe(0);
    expect(runAccuracy(runs[1])).toBeNull();
    expect(runSpeed(runs[1])).toBe(20);
    expect(runAccuracy(run('x', { accuracyPercent: 80 }))).toBeNull();
  });
  it('groups only named comparable exercises and uses graded accuracy before speed for Best', () => {
    const runs = [run('1', { testName: 'ETS Test 1', correctAnswers: 20 }), run('2', { testName: '  ｅｔｓ   test 1 ', correctAnswers: 24, actualSeconds: 700 }),
      run('3'), run('4'), run('5', { testName: 'ETS Test 1', totalQuestions: 10, correctAnswers: 8 }), run('6', { testName: 'ETS Test 1', actualSeconds: 60 })];
    expect(pacingChartRuns(runs, 'PART_5', 'FIRST_ONLY').map(row => row.id)).toEqual(['1', '3', '4', '5']);
    expect(pacingChartRuns(runs, 'PART_5', 'BEST_ONLY').map(row => row.id)).toEqual(['2', '3', '4', '5']);
  });
  it('excludes deleted, other modes and invalid timing; rejects invalid grades', () => {
    const runs = [run('1'), run('2', { deletedAt: 'x' }), run('3', { partType: 'PART_6' }), run('4', { actualSeconds: 0 }), run('5', { totalQuestions: 0 })];
    expect(pacingChartRuns(runs, 'PART_5', 'ALL').map(row => row.id)).toEqual(['1']);
    expect(runAccuracy(run('6', { correctAnswers: 31 }))).toBeNull();
    expect(runAccuracy(run('7', { correctAnswers: 2.5 }))).toBeNull();
  });
});
