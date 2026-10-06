import { describe, expect, it } from 'vitest';
import type { MistakeEntry, PacingRun, StudySession } from '@/shared/types';
import { causePriority, heatmapDays, phaseOverruns, recentFirstAttempts, rollingPartStats } from '@/shared/domain/learningAnalytics';
import { getCurrentRankTier } from '@/shared/data/storage';

const parts = { part1: 6, part2: 25, part3: 39, part4: 30, part5: 20, part6: 16, part7: 54 };
const session = (id: string, date: string, name = id, totalScore = 900): StudySession => ({
  id, skillType: 'LR', sessionType: 'FULL_TEST', testName: name, date,
  durationMinutes: 120, totalScore, partScores: { ...parts }, createdAt: `${date}T10:00:00.000Z`
});
const mistake = (id: string, category: MistakeEntry['category']): MistakeEntry => ({
  id, part: 5, questionContext: id, userMistake: 'A', correctAnswer: 'B',
  category, tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-09-23T00:00:00.000Z'
});

describe('learning analytics', () => {
  it('assigns rank by the actual target ratio, including reachable TOEIC steps', () => {
    expect(getCurrentRankTier(960, 990).name).toBe('PLATINUM');
    expect(getCurrentRankTier(965, 990).name).toBe('DIAMOND');
    expect(getCurrentRankTier(700, 700).name).toBe('GRANDMASTER');
  });
  it('uses five latest first attempts and ignores retests for stability and Part averages', () => {
    const tests = [1, 2, 3, 4, 5, 6].map(index => session(String(index), `2026-09-${String(index).padStart(2, '0')}`));
    tests.push(session('retest', '2026-09-20', '6', 990));
    const result = rollingPartStats(tests);
    expect(result.tests.map(item => item.id)).toEqual(['6', '5', '4', '3', '2']);
    expect(result.accuracy.part5).toBe(67);
    expect(result.stability).toBe(0);
  });

  it('does not use malformed Part data or a retest as a first attempt', () => {
    const invalid = session('invalid', '2026-09-01', 'ETS A');
    invalid.partScores = { ...parts, part1: 7 };
    const retest = session('retest', '2026-09-02', 'ETS A');
    retest.attemptNumber = 2;
    const valid = session('valid', '2026-09-03', 'ETS B');
    expect(recentFirstAttempts([invalid, retest, valid]).map(item => item.id)).toEqual(['valid']);
  });

  it('allocates estimated lost points by Part error share only above both thresholds', () => {
    const tests = [session('a', '2026-09-01'), session('b', '2026-09-02'), session('c', '2026-09-03')];
    const errors = Array.from({ length: 10 }, (_, index) => mistake(String(index), index < 6 ? 'VOCABULARY_TRAP' : 'ADVANCED_GRAMMAR'));
    const ready = causePriority(tests, errors);
    expect(ready.eligible).toBe(true);
    expect(ready.rows[0].category).toBe('VOCABULARY_TRAP');
    expect(ready.rows[0].estimatedPoints).toBe(30);
    expect(ready.rows[1].estimatedPoints).toBe(20);
    expect(causePriority(tests, errors.slice(0, 9)).eligible).toBe(false);
  });

  it('colors a heatmap day for either a session or a positive vocabulary log', () => {
    const days = heatmapDays([session('a', '2026-09-22')], [{ id: 'v', date: '2026-09-23', count: 12, updatedAt: 'x', deletedAt: null }], '2026-09-23');
    expect(days).toHaveLength(84);
    expect(days[83].vocabulary).toBe(true);
    expect(days[82].session).toBe(true);
  });

  it('requires three marked runs of one preset for an overrun trend', () => {
    const run = (id: string): PacingRun => ({ id, presetId: 'FULL_TEST', presetName: 'Full Test', date: '2026-09-23', plannedMinutes: 120, actualMinutes: 122, finishedNaturally: true, createdAt: 'x', phases: [{ name: 'Reading', plannedMinutes: 75, actualMinutes: 77, overrunMinutes: 2 }] });
    expect(phaseOverruns([run('1'), run('2')]).phases).toEqual([]);
    expect(phaseOverruns([run('1'), run('2'), run('3')]).phases[0].averageOverrun).toBe(2);
  });
});
