import { describe, expect, it } from 'vitest';
import type { Habit } from '@/shared/types';
import type { TodayTask } from './todayTasks';
import { buildPhoneItems } from './phoneToday';

const task = (id: string, done = false): TodayTask => ({ id, kind: 'REVIEW_MISTAKES', kicker: 'k', title: id, reason: 'r', minutes: 8, done });
const habit = (id: string, doneDates: string[] = []): Habit => ({ id, title: id, doneDates });

describe('buildPhoneItems', () => {
  it('uses the first open suggestion as hero and lists open lines before done ones', () => {
    const r = buildPhoneItems([task('a'), task('b')], [habit('h1', ['2026-11-16']), habit('h2')], '2026-11-16');
    expect(r.hero?.key).toBe('a');
    expect(r.rest.map(i => i.key)).toEqual(['b', 'h2', 'h1']);
    expect(r.restOpen).toBe(2);
    expect(r.doneCount).toBe(1);
    expect(r.total).toBe(4);
  });
  it('falls back to a habit when no suggestion is open', () => {
    const r = buildPhoneItems([task('a', true)], [habit('h')], '2026-11-16');
    expect(r.hero?.key).toBe('h');
    expect(r.restOpen).toBe(0);
  });
  it('has no hero when everything is done', () => {
    const r = buildPhoneItems([task('a', true)], [], '2026-11-16');
    expect(r.hero).toBeNull();
    expect(r.doneCount).toBe(1);
  });
});
