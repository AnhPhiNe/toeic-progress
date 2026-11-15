import { describe, expect, it } from 'vitest';
import type { MistakeEntry, UserProfile } from '@/shared/types';
import { addHabit, clampWeeklyGoal, extraStudyDates, removeHabit, toggleHabit } from './habits';

const base = { name: 'A', targetScore: 800, examDate: '', currentStreak: 0, longestStreak: 0, streakFreezes: 1, lastStudyDate: '', dailyMinGoalMinutes: 30, motto: '', selectedSkill: 'LR' } as UserProfile;

describe('habits', () => {
  it('adds at most three trimmed habits and ignores blanks', () => {
    let p = addHabit(base, '  Học 20 từ Mochi  ', 'a');
    p = addHabit(p, '   ', 'x');
    p = addHabit(p, 'Nghe podcast', 'b');
    p = addHabit(p, 'Thứ ba', 'c');
    p = addHabit(p, 'Thứ tư', 'd');
    expect(p.habits?.map(h => h.title)).toEqual(['Học 20 từ Mochi', 'Nghe podcast', 'Thứ ba']);
  });

  it('toggles today on and off and prunes old ticks', () => {
    let p = addHabit(base, 'X', 'a');
    p = { ...p, habits: [{ id: 'a', title: 'X', doneDates: ['2026-01-01', '2026-11-10'] }] };
    p = toggleHabit(p, 'a', '2026-11-13');
    expect(p.habits?.[0].doneDates).toEqual(['2026-11-10', '2026-11-13']);
    p = toggleHabit(p, 'a', '2026-11-13');
    expect(p.habits?.[0].doneDates).toEqual(['2026-11-10']);
    expect(removeHabit(p, 'a').habits).toEqual([]);
  });

  it('collects habit ticks and local review days, skipping deleted cards', () => {
    const p = { ...base, habits: [{ id: 'a', title: 'X', doneDates: ['2026-11-12'] }] };
    const reviewed = new Date(2026, 10, 13, 9, 0).toISOString();
    const cards = [{ lastReviewedAt: reviewed }, { lastReviewedAt: reviewed, deletedAt: 'x' }, {}] as MistakeEntry[];
    expect(extraStudyDates(p, cards).sort()).toEqual(['2026-11-12', '2026-11-13']);
  });

  it('keeps the weekly goal between 1 and 7', () => {
    expect([undefined, 0, 9, 3.6].map(clampWeeklyGoal)).toEqual([5, 1, 7, 4]);
  });
});
