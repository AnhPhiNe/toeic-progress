import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { ISLAND_CARD_CLEAR, ISLAND_PANEL_CLEAR, emptyClimb, monthGroups, partBars, phoneIslands, phoneMountain, polyAt } from './phoneJourney';
import type { JourneyPoint } from './scoreJourney';

const pt = (i: number, score: number): JourneyPoint => ({ id: 'p' + i, date: '2026-11-0' + (i + 1), testName: 'T' + i, score, total: score, listening: null, reading: null, retake: false, sameDayGroup: i, excluded: false, excludeReason: null, forced: false, deviation: null });
const sess = (id: string, date: string, extra: Partial<StudySession> = {}) => ({ id, date, testName: id, skillType: 'LR', sessionType: 'FULL_TEST', durationMinutes: 120, createdAt: date, ...extra }) as StudySession;

describe('phoneMountain', () => {
  const pts = [620, 665, 690, 725, 710, 740, 765].map((s, i) => pt(i, s));
  const m = phoneMountain(pts, 800, 'total', 390, 758);
  it('climbs left to right, latest stake nearest the peak', () => {
    expect(m.xs[0]).toBeLessThan(m.xs[6]);
    expect(m.xs[6]).toBeLessThan(m.apex[0]);
    expect(m.ys[6]).toBeLessThan(m.ys[0]);
    expect(m.latestIdx).toBe(6);
    expect(m.reached).toBe(false);
    expect(m.trail.length).toBeGreaterThan(1);
  });
  it('keeps the peak above the best stake and stakes inside the scene', () => {
    expect(m.apex[1]).toBeLessThan(Math.min(...m.ys));
    expect(Math.min(...m.xs)).toBeGreaterThan(0);
  });
  it('has no trail once the target is reached', () => {
    const r = phoneMountain([pt(0, 700), pt(1, 810)], 800, 'total', 390, 758);
    expect(r.reached).toBe(true);
    expect(r.trail).toEqual([]);
  });
});

describe('emptyClimb', () => {
  it('has five stakes rising to the right with the camp at the foot', () => {
    const e = emptyClimb(390, 758);
    expect(e.stakes).toHaveLength(5);
    expect(e.stakes[4][1]).toBeLessThan(e.stakes[0][1]);
    expect(e.stakes[0][0]).toBeGreaterThan(e.camp[0]);
  });
});

describe('polyAt', () => {
  it('interpolates and clamps', () => {
    const l = [[0, 10], [10, 20]] as const;
    expect(polyAt(l, 5)).toBe(15);
    expect(polyAt(l, -3)).toBe(10);
    expect(polyAt(l, 30)).toBe(20);
  });
});

describe('phoneIslands', () => {
  it('places seven islands inside the width', () => {
    const is = phoneIslands(390, 758);
    expect(is).toHaveLength(7);
    for (const i of is) { expect(i.x).toBeGreaterThan(0); expect(i.x).toBeLessThan(390); expect(i.y).toBeGreaterThan(ISLAND_CARD_CLEAR); expect(i.y).toBeLessThan(758 - ISLAND_PANEL_CLEAR); }
    const r = (p: number) => is.find(i => i.part === p)!.r;
    expect(r(7)).toBeGreaterThan(r(3));
    expect(r(1)).toBeLessThan(r(2));
    for (const a of is) for (const b of is) if (a.part < b.part) expect(Math.hypot(a.x - b.x, (a.y - b.y) * 1.8)).toBeGreaterThan((a.r + b.r) * 0.9);
  });
});

describe('monthGroups', () => {
  it('groups newest-first tests by month and adds the year only across years', () => {
    const g = monthGroups([sess('a', '2026-11-16'), sess('b', '2026-11-09'), sess('c', '2026-10-30')]);
    expect(g.map(x => [x.label, x.tests.length])).toEqual([['THÁNG 11', 2], ['THÁNG 10', 1]]);
    expect(monthGroups([sess('a', '2026-01-02'), sess('b', '2025-12-30')]).map(x => x.label)).toEqual(['THÁNG 1 · 2026', 'THÁNG 12 · 2025']);
  });
});

describe('partBars', () => {
  it('is null without part data and gives % per Part otherwise', () => {
    expect(partBars(sess('a', '2026-11-01'))).toBeNull();
    const bars = partBars(sess('a', '2026-11-01', { wrongQuestions: [1, 2, 3] }))!;
    expect(bars).toHaveLength(7);
    expect(bars[0]).toMatchObject({ part: 1, wrong: 3, pct: 50 });
  });
});
