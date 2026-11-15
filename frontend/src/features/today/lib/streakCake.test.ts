import { describe, expect, it } from 'vitest';
import type { StreakDayState, StreakWeek, WeekdayLabel } from '@/shared/domain/streakWeek';
import { streakCake } from './streakCake';

const LABELS: WeekdayLabel[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const week = (states: StreakDayState[], current: number, longest = current, freezesLeft = 2): StreakWeek => ({
  days: states.map((state, i) => ({ date: `2026-11-${10 + i}`, label: LABELS[i], state, isToday: state === 'today-pending' || (i === 4 && state === 'done') })),
  current, longest, freezesLeft
});
const at = (hour: number) => new Date(2026, 10, 14, hour);

describe('streakCake', () => {
  it('lights done days, shows freeze days, and marks today pending', () => {
    const m = streakCake(week(['done', 'freeze', 'done', 'done', 'today-pending', 'future', 'future'], 4), at(10));
    expect(m.candles.map(c => c.state)).toEqual(['lit', 'freeze', 'lit', 'lit', 'today', 'off', 'off']);
    expect(m.candles[4].label).toBe('Nay');
    expect(m.litThisWeek).toBe(4);
    expect(m.studiedToday).toBe(false);
    expect(m.danger).toBe(false);
  });
  it('warns in the evening when a streak would be lost', () => {
    const m = streakCake(week(['done', 'done', 'done', 'done', 'today-pending', 'future', 'future'], 12), at(20));
    expect(m.danger).toBe(true);
    expect(m.hoursLeft).toBe(4);
  });
  it('adds a second tier after a full week and turns gold from 30 days', () => {
    const states: StreakDayState[] = ['done', 'done', 'done', 'done', 'done', 'future', 'future'];
    expect(streakCake(week(states, 5), at(9)).tiers).toBe(1);
    expect(streakCake(week(states, 12), at(9))).toMatchObject({ tiers: 2, gold: false, cakes: 1 });
    expect(streakCake(week(states, 1200), at(9))).toMatchObject({ tiers: 2, gold: true, cakes: 171 });
  });
  it('keeps the record when a streak broke', () => {
    const m = streakCake(week(['missed', 'missed', 'missed', 'missed', 'today-pending', 'future', 'future'], 0, 23), at(9));
    expect(m.recordAbove).toBe(true);
    expect(m.danger).toBe(false);
    expect(m.cakes).toBe(0);
  });
});
