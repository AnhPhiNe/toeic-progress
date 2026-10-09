import { describe, expect, it } from 'vitest';
import { dateRangeError, dateRangePreset, validCalendarDate } from './dateRange';

describe('calendar presentation range', () => {
  it('uses inclusive calendar presets and rejects impossible, reversed or future dates', () => {
    expect(dateRangePreset('2026-10-09', 7)).toEqual({ from: '2026-10-03', to: '2026-10-09', preset: 7 });
    expect(validCalendarDate('2026-02-29')).toBe(false);
    expect(validCalendarDate('2024-02-29')).toBe(true);
    expect(dateRangeError({ from: '2026-10-01', to: '2026-10-09', preset: null }, '2026-10-09')).toBe('');
    expect(dateRangeError({ from: '2026-10-09', to: '2026-10-01', preset: null }, '2026-10-09')).toBeTruthy();
    expect(dateRangeError({ from: '', to: '2026-10-09', preset: null }, '2026-10-09')).toBeTruthy();
    expect(dateRangeError({ from: '2026-10-10', to: '2026-10-10', preset: null }, '2026-10-09')).toBeTruthy();
  });
});
