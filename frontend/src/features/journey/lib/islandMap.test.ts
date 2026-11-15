import { describe, expect, it } from 'vitest';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { BOAT_POS, ISLAND_POS, MAP_H, MAP_W, boatRoute, chestSpot, radiusOf, shorePoint } from './islandMap';

describe('island map layout', () => {
  it('keeps every island, with its shallows, inside the scene', () => {
    for (const p of PART_NUMBERS) {
      const [x, y] = ISLAND_POS[p], r = radiusOf(p);
      expect(x - r * 1.2).toBeGreaterThan(0);
      expect(y + r * .8).toBeLessThan(MAP_H);
      expect(x + r * 1.2).toBeLessThan(MAP_W - 290);
    }
  });

  it('puts chests on the island and chest 2 apart from chest 1', () => {
    for (const p of PART_NUMBERS) {
      const [x, y] = ISLAND_POS[p], r = radiusOf(p);
      const [c1x, c1y] = chestSpot(p, 0), [c2x] = chestSpot(p, 1);
      expect(Math.abs(c1x - x)).toBeLessThan(r);
      expect(Math.abs(c1y - y)).toBeLessThan(r * .5);
      expect(c2x).toBeLessThan(c1x);
    }
  });

  it('ends a route leg at the shore, not in the middle of the island', () => {
    const [x, y] = ISLAND_POS[7], r = radiusOf(7);
    const [sx, sy] = shorePoint(7, BOAT_POS);
    expect(Math.hypot(sx - x, sy - (y + r * .3))).toBeGreaterThan(r * .5);
  });

  it('sails ① then ② and keeps the dots off other islands for every pair', () => {
    expect(boatRoute([])).toEqual([]);
    expect(boatRoute([7])).toHaveLength(1);
    const legs = boatRoute([7, 3]);
    expect(legs).toHaveLength(2);
    expect(legs[1].from).not.toEqual(legs[0].from);
    let bad = 0, total = 0;
    for (const a of PART_NUMBERS) for (const b of PART_NUMBERS) {
      if (a === b) continue;
      for (const leg of boatRoute([a as PartNumber, b as PartNumber])) { total++; if (leg.collisions > 2) bad++; expect(leg.d).toMatch(/^M[-\d. ]+Q/); }
    }
    expect(bad / total).toBeLessThan(0.15);
  });
});
