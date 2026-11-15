import type { StreakWeek } from '@/shared/domain/streakWeek';

export type CandleState = 'lit' | 'freeze' | 'today' | 'off';

export interface StreakCakeModel {
  candles: { label: string; isToday: boolean; state: CandleState }[];
  /** 1 tier, or 2 once a full week sits under this week. */
  tiers: 1 | 2;
  /** Bottom tier turns gold from 30 days. */
  gold: boolean;
  /** Full weeks baked in the current streak. */
  cakes: number;
  litThisWeek: number;
  studiedToday: boolean;
  /** Evening, a streak to lose and nothing done today. */
  danger: boolean;
  hoursLeft: number;
  /** The record is higher than the current streak (a streak broke). */
  recordAbove: boolean;
}

/** View model of the "bánh chồng tầng" streak card (design/previews/mock-streak-final.html). */
export function streakCake(week: StreakWeek, now: Date = new Date()): StreakCakeModel {
  const candles = week.days.map(day => ({
    label: day.isToday ? 'Nay' : day.label,
    isToday: day.isToday,
    state: (day.state === 'done' ? 'lit' : day.state === 'freeze' ? 'freeze' : day.isToday ? 'today' : 'off') as CandleState
  }));
  const litThisWeek = candles.filter(c => c.state === 'lit' || c.state === 'freeze').length;
  const studiedToday = week.days.some(d => d.isToday && d.state === 'done');
  const current = Math.max(0, Math.floor(week.current || 0));
  const hour = now.getHours();
  return {
    candles,
    tiers: current - litThisWeek >= 7 ? 2 : 1,
    gold: current >= 30,
    cakes: Math.floor(current / 7),
    litThisWeek,
    studiedToday,
    danger: !studiedToday && current > 0 && hour >= 20,
    hoursLeft: Math.max(1, 24 - hour),
    recordAbove: week.longest > current
  };
}
