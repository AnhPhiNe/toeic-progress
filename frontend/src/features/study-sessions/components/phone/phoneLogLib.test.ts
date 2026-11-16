import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { chipNames, countFromScaled, dayLabel, percent, previousDay, resultFacts, scaledFromCount, vocabWeek } from './phoneLogLib';

const test = (id: string, date: string, totalScore: number, name = id): StudySession => ({
  id, skillType: 'LR', sessionType: 'FULL_TEST', testName: name, date, durationMinutes: 120, totalScore, notes: '', createdAt: `${date}T08:00:00Z`
} as StudySession);

describe('phoneLogLib', () => {
  it('steps back across month and year', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });
  it('labels days', () => {
    expect(dayLabel('2026-11-16', '2026-11-16')).toBe('Hôm nay');
    expect(dayLabel('2026-11-15', '2026-11-16')).toBe('Hôm qua');
    expect(dayLabel('2026-11-03', '2026-11-16')).toBe('03/11');
  });
  it('keeps the current name first and unique', () => {
    expect(chipNames('Test 4', ['Test 3', 'test 4', 'Hackers'], ['Test 3'], 3)).toEqual(['Test 4', 'Test 3', 'Hackers']);
  });
  it('round-trips counts and scores', () => {
    expect(scaledFromCount('listening', 100)).toBe(495);
    expect(scaledFromCount('listening', 80) >= 5).toBe(true);
    expect(scaledFromCount('reading', countFromScaled('reading', 300))).toBeGreaterThanOrEqual(300);
  });
  it('computes percent safely', () => {
    expect(percent(24, 30)).toBe(80);
    expect(percent(5, 0)).toBe(0);
  });
  it('builds a 7-day week', () => {
    const week = vocabWeek([{ date: '2026-11-16', count: 20 }, { date: '2026-11-16', count: 5 }, { date: '2026-11-10', count: 9 }], '2026-11-16');
    expect(week).toHaveLength(7);
    expect(week[6]).toEqual({ date: '2026-11-16', count: 25 });
    expect(week[0].date).toBe('2026-11-10');
    expect(week[0].count).toBe(9);
  });
  it('detects a record and delta', () => {
    const a = test('a', '2026-11-01', 700), b = test('b', '2026-11-10', 765);
    const facts = resultFacts(b, [a, b], 800);
    expect(facts.record).toBe(true);
    expect(facts.delta).toBe(65);
    expect(facts.remaining).toBe(35);
    expect(resultFacts(a, [a], 800).first).toBe(true);
  });
});
