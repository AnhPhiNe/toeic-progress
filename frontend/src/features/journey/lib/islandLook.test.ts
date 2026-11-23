import { describe, expect, it } from 'vitest';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { partSize } from './journeyData';
import { islandRadius, islandState, partAccuracy } from './islands';
import { PCT_COLOUR, PCT_LEGEND, buildMapParts, islandWeather, weakestPart, weatherByPart, weatherIconKind, type PartWeatherInput } from './islandLook';

const item = (part: PartNumber, accuracy: number, cleared = false): PartWeatherInput => ({ part, accuracy, state: islandState(accuracy), cleared });
const all = (acc: Record<number, number>, cleared: number[] = []) => PART_NUMBERS.map(p => item(p, acc[p] ?? 90, cleared.includes(p)));

describe('island look', () => {
  it('colours the % by the Vững/Ổn thresholds', () => {
    expect([100, 85].map(a => PCT_COLOUR[islandState(a)].fill)).toEqual(['#46b35a', '#46b35a']);
    expect([84, 75].map(a => PCT_COLOUR[islandState(a)].fill)).toEqual(['#ffc83d', '#ffc83d']);
    expect([74, 0].map(a => PCT_COLOUR[islandState(a)].fill)).toEqual(['#ff7a9c', '#ff7a9c']);
    expect(PCT_LEGEND.map(l => l.label)).toEqual(['≥85', '75–84', 'dưới 75']);
  });

  it('sizes islands by question count: Part 7 is the largest, Part 1 the smallest', () => {
    const r = Object.fromEntries(PART_NUMBERS.map(p => [p, islandRadius(partSize(p))])) as Record<PartNumber, number>;
    expect(PART_NUMBERS.every(p => p === 7 || r[7] > r[p])).toBe(true);
    expect(PART_NUMBERS.every(p => p === 1 || r[p] > r[1])).toBe(true);
    expect(r[7] > r[3] && r[3] > r[4] && r[4] > r[2] && r[2] > r[6] && r[6] > r[1]).toBe(true);
  });

  it('gives strong Parts sun, ok Parts a little cloud and weak Parts rain', () => {
    const w = weatherByPart(all({ 1: 90, 2: 80, 3: 70, 6: 60 }));
    expect(w[1]).toMatchObject({ sky: 'sunny', chop: false, green: 'lush' });
    expect(w[2]).toMatchObject({ sky: 'fair', green: 'some', brokenPalm: false });
    expect(w[3]).toMatchObject({ sky: 'storm', chop: false, green: 'sparse', brokenPalm: false });
    expect(w[6]).toMatchObject({ sky: 'heavy', chop: true, green: 'sparse', brokenPalm: true });
  });

  it('breaks a palm on one Part only: the weakest, the later Part on a tie', () => {
    expect(weakestPart(all({ 2: 68, 6: 63, 3: 74 }))).toBe(6);
    expect(weakestPart(all({ 2: 60, 5: 60 }))).toBe(5);
    expect(weakestPart(all({ 1: 80, 2: 90 }))).toBeNull();
  });

  it('clears the storm once the Part is reviewed, and the next weakest takes over the rough sea', () => {
    const w = weatherByPart(all({ 2: 68, 6: 63 }, [6]));
    expect(w[6]).toMatchObject({ sky: 'fair', chop: false, brokenPalm: false, green: 'sparse' });
    expect(w[2]).toMatchObject({ sky: 'heavy', chop: true, brokenPalm: true });
    expect(islandWeather(item(6, 63, true), null).sky).toBe('fair');
  });

  it('shows a sun, partly cloudy or rain icon in the tag', () => {
    expect(weatherIconKind('strong')).toBe('sun');
    expect(weatherIconKind('ok')).toBe('partly');
    expect(weatherIconKind('weak')).toBe('rain');
    expect(weatherIconKind('weak', true)).toBe('partly');
  });

  it('maps real Part counts: 6 of 54 wrong on Part 7 is strong, 13 wrong is ok', () => {
    expect(islandState(partAccuracy(54, 6))).toBe('strong');
    expect(islandState(partAccuracy(54, 13))).toBe('ok');
  });

  it('builds the map from wrong counts and chests: the mock test has Parts 2, 3, 6 in the rain and only Part 6 broken', () => {
    const wrong = { 1: 1, 2: 8, 3: 10, 4: 7, 5: 6, 6: 6, 7: 13 } as Record<PartNumber, number>;
    const chest = (open: boolean) => ({ open, remaining: 0 });
    const chests = Object.fromEntries(PART_NUMBERS.map(p => [p, chest(false)])) as Record<PartNumber, { open: boolean; remaining: number }>;
    const parts = buildMapParts(wrong, chests, [7, 3]);
    expect(PART_NUMBERS.map(p => parts[p].pct)).toEqual([83, 68, 74, 77, 80, 63, 76]);
    expect(PART_NUMBERS.filter(p => parts[p].weather.sky === 'storm' || parts[p].weather.sky === 'heavy')).toEqual([2, 3, 6]);
    expect(PART_NUMBERS.filter(p => parts[p].weather.brokenPalm)).toEqual([6]);
    expect([parts[7].rank, parts[3].rank, parts[6].rank]).toEqual([0, 1, -1]);
    // reviewing Part 6 empties its chest: the storm clears and Part 2 (68%) becomes the weakest
    const done = buildMapParts(wrong, { ...chests, 6: chest(true) }, [7, 3]);
    expect(done[6].weather.sky).toBe('fair');
    expect(done[6].open).toBe(true);
    expect(done[2].weather.brokenPalm).toBe(true);
  });
});
