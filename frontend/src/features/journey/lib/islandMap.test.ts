import { describe, expect, it } from 'vitest';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { MAP_H, MAP_W, MIN_MAP_W, PANEL_W, boatRoute, chestSpot, mapLayout, radiusOf, shorePoint, signBox } from './islandMap';

const WIDTHS = [MIN_MAP_W, 1073, MAP_W, 1131, 1300];
type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
/** The island's body plus its sign: what must not run into another island or the stat card. */
const bodyBox = (p: PartNumber, L: ReturnType<typeof mapLayout>): Box => {
  const [x, y] = L.pos[p], r = radiusOf(p), s = signBox(p, L);
  return { x0: Math.min(x - r, s.x), y0: s.y, x1: Math.max(x + r, s.x + s.w), y1: y + r * .7 };
};

describe('island map layout', () => {
  it('keeps every island, with its shallows, inside the sea left of the panel at every scene width', () => {
    for (const w of WIDTHS) {
      const L = mapLayout(w);
      expect(L.space).toBe(Math.max(MIN_MAP_W, w) - PANEL_W);
      for (const p of PART_NUMBERS) {
        const [x, y] = L.pos[p], r = radiusOf(p);
        expect(x - r * 1.2).toBeGreaterThan(0);
        expect(y + r * .8).toBeLessThan(MAP_H);
        expect(x + r * 1.2).toBeLessThan(L.space + 8);
      }
    }
  });

  it('spreads the islands over the whole space: a wider scene moves them apart', () => {
    const a = mapLayout(MIN_MAP_W), b = mapLayout(1400);
    for (const p of PART_NUMBERS) expect(b.pos[p][0]).toBeGreaterThan(a.pos[p][0]);
    expect(b.pos[7][0] / a.pos[7][0]).toBeCloseTo(b.space / a.space, 5);
    expect(b.boat[0]).toBeGreaterThan(a.boat[0]);
  });

  it('keeps islands and signs off each other and off the card in the top-left corner', () => {
    const card: Box = { x0: 14, y0: 14, x1: 284, y1: 180 };
    for (const w of WIDTHS) {
      const L = mapLayout(w);
      for (const a of PART_NUMBERS) {
        expect(overlaps(bodyBox(a, L), card)).toBe(false);
        for (const b of PART_NUMBERS) if (a < b) expect(overlaps(bodyBox(a, L), bodyBox(b, L))).toBe(false);
      }
    }
  });

  it('puts chests on the island and chest 2 apart from chest 1', () => {
    const L = mapLayout(1150);
    for (const p of PART_NUMBERS) {
      const [x, y] = L.pos[p], r = radiusOf(p);
      const [c1x, c1y] = chestSpot(p, 0, L), [c2x] = chestSpot(p, 1, L);
      expect(Math.abs(c1x - x)).toBeLessThan(r);
      expect(Math.abs(c1y - y)).toBeLessThan(r * .5);
      expect(c2x).toBeLessThan(c1x);
    }
  });

  it('ends a route leg at the shore, not in the middle of the island', () => {
    const L = mapLayout(MAP_W);
    const [x, y] = L.pos[7], r = radiusOf(7);
    const [sx, sy] = shorePoint(7, L.boat, L);
    expect(Math.hypot(sx - x, sy - (y + r * .3))).toBeGreaterThan(r * .5);
  });

  it('sails ① then ② and keeps the dots off other islands for nearly every pair, at the narrowest and a wide scene', () => {
    for (const w of [MIN_MAP_W, 1131]) {
      const L = mapLayout(w);
      expect(boatRoute([], L)).toEqual([]);
      expect(boatRoute([7], L)).toHaveLength(1);
      const legs = boatRoute([7, 3], L);
      expect(legs).toHaveLength(2);
      expect(legs[1].from).not.toEqual(legs[0].from);
      let bad = 0, total = 0;
      for (const a of PART_NUMBERS) for (const b of PART_NUMBERS) {
        if (a === b) continue;
        for (const leg of boatRoute([a as PartNumber, b as PartNumber], L)) { total++; if (leg.collisions > 4) bad++; expect(leg.d).toMatch(/^M[-\d. ]+Q/); }
      }
      expect(bad / total).toBeLessThan(0.15);
    }
  });
});
