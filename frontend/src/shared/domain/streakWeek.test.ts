import { describe, expect, it } from 'vitest';
import { defaultProfile, type DataBundle } from '@/shared/data/dataBundle';
import { mondayWeekDates, nextStreakMilestone, streakWeek, weeklyGoal } from '@/shared/domain/streakWeek';

const now = '2026-11-13T00:00:00.000Z';
const empty = (): DataBundle => ({
  schemaVersion: 3,
  profile: { ...defaultProfile(), updatedAt: now, deletedAt: null },
  sessions: [], mistakes: [], pacingRuns: [], checklist: [], vocabLog: [], shieldDays: [], weeklyPlans: []
});
const vocab = (data: DataBundle, date: string, deletedAt: string | null = null) =>
  data.vocabLog.push({ id: `v-${date}`, date, count: 5, updatedAt: now, deletedAt });
const shield = (data: DataBundle, date: string, deletedAt: string | null = null) =>
  data.shieldDays.push({ id: `s-${date}`, date, updatedAt: now, deletedAt });
const states = (data: DataBundle, today: string, extra?: string[]) => streakWeek(data, today, extra).days.map(day => day.state);

describe('mondayWeekDates', () => {
  it('starts on Monday for mid-week, Monday and Sunday', () => {
    // 2026-11-13 is a Friday; 2026-11-09 Monday; 2026-11-15 Sunday.
    const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
    expect(mondayWeekDates('2026-11-13')).toEqual(week);
    expect(mondayWeekDates('2026-11-09')).toEqual(week);
    expect(mondayWeekDates('2026-11-15')).toEqual(week);
    expect(mondayWeekDates('2026-11-16')[0]).toBe('2026-11-16');
  });
  it('crosses month, year and leap-day boundaries', () => {
    expect(mondayWeekDates('2027-01-01')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    expect(mondayWeekDates('2028-03-01').slice(0, 3)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(mondayWeekDates('1969-12-31')[0]).toBe('1969-12-29');
  });
});

describe('streakWeek', () => {
  it('labels T2..CN and marks done, freeze, missed, today-pending and future', () => {
    const data = empty();
    vocab(data, '2026-11-09');
    shield(data, '2026-11-10');
    vocab(data, '2026-11-12');
    const result = streakWeek(data, '2026-11-13');
    expect(result.days.map(day => day.label)).toEqual(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']);
    expect(result.days.map(day => day.state)).toEqual(['done', 'freeze', 'missed', 'done', 'today-pending', 'future', 'future']);
    expect(result.days.filter(day => day.isToday).map(day => day.date)).toEqual(['2026-11-13']);
    expect(result.current).toBe(1);
  });
  it('shows today as done once studied and keeps the streak alive while pending', () => {
    const data = empty();
    for (const date of ['2026-11-10', '2026-11-11', '2026-11-12']) vocab(data, date);
    expect(streakWeek(data, '2026-11-13')).toMatchObject({ current: 3, longest: 3 });
    vocab(data, '2026-11-13');
    const result = streakWeek(data, '2026-11-13');
    expect(result.days[4].state).toBe('done');
    expect(result.current).toBe(4);
  });
  it('handles Sunday (full week past) and Monday (fresh week)', () => {
    const data = empty();
    vocab(data, '2026-11-14');
    expect(states(data, '2026-11-15')).toEqual(['missed', 'missed', 'missed', 'missed', 'missed', 'done', 'today-pending']);
    expect(states(data, '2026-11-16')).toEqual(['today-pending', 'future', 'future', 'future', 'future', 'future', 'future']);
  });
  it('marks an unstudied shield on today as freeze', () => {
    const data = empty();
    shield(data, '2026-11-13');
    expect(states(data, '2026-11-13')[4]).toBe('freeze');
  });
  it('ignores deleted records and future activity', () => {
    const data = empty();
    vocab(data, '2026-11-11', now);
    shield(data, '2026-11-12', now);
    vocab(data, '2026-11-14');
    shield(data, '2026-11-15');
    expect(states(data, '2026-11-13')).toEqual(['missed', 'missed', 'missed', 'missed', 'today-pending', 'future', 'future']);
    expect(streakWeek(data, '2026-11-13').current).toBe(0);
  });
  it('prefers done over freeze when a shield day was also studied', () => {
    const data = empty();
    vocab(data, '2026-11-12');
    shield(data, '2026-11-12');
    expect(states(data, '2026-11-13')[3]).toBe('done');
  });
  it('counts extra done dates in states and streak, dropping invalid or future ones', () => {
    const data = empty();
    vocab(data, '2026-11-11');
    const extra = ['2026-11-12', '2026-11-13', '2026-11-12', '2026-11-14', 'nope', '2026-02-30'];
    const result = streakWeek(data, '2026-11-13', extra);
    expect(result.days.map(day => day.state)).toEqual(['missed', 'missed', 'done', 'done', 'done', 'future', 'future']);
    expect(result).toMatchObject({ current: 3, longest: 3 });
    expect(data.vocabLog).toHaveLength(1);
  });
  it('bridges a freeze day in the current streak and reports freezes left', () => {
    const data = empty();
    data.profile.shieldAllowance = 2;
    vocab(data, '2026-11-10');
    shield(data, '2026-11-11');
    vocab(data, '2026-11-12');
    expect(streakWeek(data, '2026-11-13')).toMatchObject({ current: 3, freezesLeft: 1 });
  });
});

describe('nextStreakMilestone', () => {
  it('walks the fixed ladder', () => {
    expect(nextStreakMilestone(0)).toEqual({ target: 3, left: 3, progress: 0 });
    expect(nextStreakMilestone(2)).toMatchObject({ target: 3, left: 1 });
    expect(nextStreakMilestone(3)).toEqual({ target: 7, left: 4, progress: 0 });
    expect(nextStreakMilestone(7)).toEqual({ target: 10, left: 3, progress: 0 });
    expect(nextStreakMilestone(12)).toEqual({ target: 14, left: 2, progress: 0.5 });
    expect(nextStreakMilestone(99)).toMatchObject({ target: 100, left: 1 });
  });
  it('continues every +50 after 100', () => {
    expect(nextStreakMilestone(100)).toEqual({ target: 150, left: 50, progress: 0 });
    expect(nextStreakMilestone(125)).toEqual({ target: 150, left: 25, progress: 0.5 });
    expect(nextStreakMilestone(150)).toMatchObject({ target: 200, left: 50 });
  });
  it('treats invalid input as zero', () => {
    expect(nextStreakMilestone(-4)).toEqual({ target: 3, left: 3, progress: 0 });
    expect(nextStreakMilestone(Number.NaN)).toEqual({ target: 3, left: 3, progress: 0 });
  });
});

describe('weeklyGoal', () => {
  it('counts distinct done days Monday..today, excluding freezes and last week', () => {
    const data = empty();
    vocab(data, '2026-11-08');
    vocab(data, '2026-11-09');
    data.sessions.push({ id: 's', skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Part 5', date: '2026-11-09', durationMinutes: 30, createdAt: now, updatedAt: now, deletedAt: null });
    shield(data, '2026-11-10');
    vocab(data, '2026-11-11');
    expect(weeklyGoal(data, '2026-11-13')).toEqual({ done: 2, goal: 5, met: false });
    expect(weeklyGoal(data, '2026-11-13', 2)).toEqual({ done: 2, goal: 2, met: true });
  });
  it('resets on Monday and includes extra dates', () => {
    const data = empty();
    vocab(data, '2026-11-15');
    expect(weeklyGoal(data, '2026-11-16').done).toBe(0);
    expect(weeklyGoal(data, '2026-11-15', 5, ['2026-11-13', '2026-11-14', '2026-11-16']).done).toBe(3);
  });
});
