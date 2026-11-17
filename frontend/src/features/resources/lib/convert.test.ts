import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { buildJourney, clampCount, convertTests, fromShownCount, mrzLine, shortDate, toShownCount } from './convert';

const session = (over: Partial<StudySession>): StudySession => ({
  id: 'x', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date: '2026-11-01', durationMinutes: 120, createdAt: '2026-11-01T09:00:00Z',
  rawListening: 80, rawReading: 70, ...over
});

describe('mode conversion', () => {
  it('clamps to whole numbers from 0 to 100', () => {
    expect(clampCount(120)).toBe(100);
    expect(clampCount(-4)).toBe(0);
    expect(clampCount(87.9)).toBe(87);
    expect(clampCount(Number.NaN)).toBe(0);
  });
  it('shows wrong answers as the complement and converts back', () => {
    expect(toShownCount(88, 'correct')).toBe(88);
    expect(toShownCount(88, 'wrong')).toBe(12);
    expect(fromShownCount(12, 'wrong')).toBe(88);
    expect(fromShownCount(88, 'correct')).toBe(88);
    expect(fromShownCount(250, 'wrong')).toBe(0);
    for (const raw of [0, 1, 57, 100]) expect(fromShownCount(toShownCount(raw, 'wrong'), 'wrong')).toBe(raw);
  });
});

describe('convertTests', () => {
  it('keeps full tests with valid counts, newest first, and skips deleted or invalid ones', () => {
    const list = convertTests([
      session({ id: 'old', date: '2026-10-01' }),
      session({ id: 'new', date: '2026-11-11', testName: 'ETS 11' }),
      session({ id: 'gone', date: '2026-11-12', deletedAt: '2026-11-12T00:00:00Z' }),
      session({ id: 'frac', date: '2026-11-13', rawListening: 88.5 }),
      session({ id: 'part', date: '2026-11-14', sessionType: 'PART_PRACTICE' }),
      session({ id: 'none', date: '2026-11-15', rawReading: undefined })
    ]);
    expect(list.map(t => t.id)).toEqual(['new', 'old']);
    expect(list[0]).toMatchObject({ name: 'ETS 11', dateLabel: '11/11', listening: 80, reading: 70 });
  });
  it('breaks date ties by creation time and copes with no sessions', () => {
    expect(convertTests([session({ id: 'a', createdAt: '2026-11-01T08:00:00Z' }), session({ id: 'b', createdAt: '2026-11-01T10:00:00Z' })]).map(t => t.id)).toEqual(['b', 'a']);
    expect(convertTests(undefined)).toEqual([]);
  });
  it('formats short dates', () => {
    expect(shortDate('2026-11-09')).toBe('09/11');
    expect(shortDate('lạ')).toBe('lạ');
  });
});

describe('mrzLine', () => {
  it('builds the decorative line from the numbers, padded to a fixed width', () => {
    const line = mrzLine(405, 495, 900, 'B2');
    expect(line.startsWith('P<TOEIC<<SOC<<0405<0495<<0900<<B2<')).toBe(true);
    expect(line).toHaveLength(44);
  });
  it('uses XX below A1 and never overflows', () => {
    expect(mrzLine(5, 5, 10, null)).toContain('<<0010<<XX');
    expect(mrzLine(5, 5, 10, null, 10)).toHaveLength(10);
  });
});

describe('buildJourney', () => {
  it('marks past, current, next and unreachable stations', () => {
    const { stations, current, next } = buildJourney('B2');
    expect(stations.map(s => s.cefr)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
    expect(stations.map(s => s.state)).toEqual(['past', 'past', 'past', 'now', 'next', 'off']);
    expect(stations.map(s => s.min)).toEqual([120, 225, 550, 785, 945, null]);
    expect(stations[3].name).toBe('Trung cấp trên');
    expect(current).toBe(3);
    expect(next?.cefr).toBe('C1');
  });
  it('has no next station at C1 because TOEIC does not reach C2', () => {
    const { stations, next } = buildJourney('C1');
    expect(stations[4].state).toBe('now');
    expect(stations[5].state).toBe('off');
    expect(next).toBeNull();
  });
  it('starts the road at A1 while below it', () => {
    const { stations, current, next } = buildJourney(null);
    expect(current).toBe(-1);
    expect(stations[0].state).toBe('next');
    expect(next?.cefr).toBe('A1');
  });
});
