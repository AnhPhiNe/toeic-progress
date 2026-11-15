/**
 * Layout of the sea map in "Từng Part" (sketch: design/previews/mock-journey-parts4.html), in its 1068×692 scene:
 * where each island sits, where a chest goes on it and the dotted route Sóc's boat sails between chests.
 */
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { PART_NUMBERS } from '@/shared/domain/questionNumbers';
import { partSize } from './journeyData';
import { islandRadius } from './islands';

export const MAP_W = 1068;
export const MAP_H = 692;

export type Pt = readonly [number, number];

/** Island centres from the sketch: Nghe on the left shallows, Đọc on the right. */
export const ISLAND_POS: Record<PartNumber, Pt> = {
  1: [96, 300], 2: [262, 175], 3: [228, 478], 4: [420, 330], 5: [612, 170], 6: [560, 600], 7: [628, 412]
};
export const BOAT_POS: Pt = [380, 630];
export const SIGN_W = 112;
export const SIGN_H = 36;

export const radiusOf = (part: PartNumber) => islandRadius(partSize(part));

/** Top-left of the one-line sign planted on an island. */
export function signBox(part: PartNumber): { x: number; y: number; w: number; h: number } {
  const [x, y] = ISLAND_POS[part];
  return { x: x - SIGN_W / 2, y: y - radiusOf(part) * .32 - SIGN_H - 6, w: SIGN_W, h: SIGN_H };
}

/** Where a chest stands on its island: ① at the front right, ② at the front left, emptied chests like ①. */
export function chestSpot(part: PartNumber, rank: 0 | 1): Pt {
  const [x, y] = ISLAND_POS[part], r = radiusOf(part);
  return rank === 1 ? [x - r * .45, y + r * .3] : [x + r * .32, y + r * .32];
}

/** Point just off the island's shore, on the line from `from` towards the island centre. */
export function shorePoint(part: PartNumber, from: Pt): Pt {
  const [x, y] = ISLAND_POS[part], r = radiusOf(part);
  const cx = x, cy = y + r * .3, rx = r * 1.14, ry = r * .62;
  const dx = from[0] - cx, dy = from[1] - cy;
  const k = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2 || 1);
  return [cx + dx * k, cy + dy * k];
}

const bezier = (a: Pt, c: Pt, b: Pt, t: number): Pt => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];

function hitsIsland(p: Pt, part: PartNumber): boolean {
  const [x, y] = ISLAND_POS[part], r = radiusOf(part);
  const ex = (p[0] - x) / (r * 1.22), ey = (p[1] - (y + r * .3)) / (r * .66);
  if (ex * ex + ey * ey < 1) return true;
  const s = signBox(part);
  return p[0] > s.x - 8 && p[0] < s.x + s.w + 8 && p[1] > s.y - 8 && p[1] < s.y + s.h + 8;
}

export interface RouteLeg {
  from: Pt;
  control: Pt;
  to: Pt;
  /** SVG path d. */
  d: string;
  /** Samples of the curve that land on an island or its sign (0 = the dots stay in open water). */
  collisions: number;
}

/** One dotted leg between two points that bows to whichever side keeps the dots off the islands. */
export function routeLeg(from: Pt, to: Pt, skip: PartNumber[]): RouteLeg {
  const mid: Pt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const nx = -(to[1] - from[1]) / len, ny = (to[0] - from[0]) / len;
  let best: RouteLeg | null = null;
  let bestScore = Infinity;
  for (const off of [0.16, -0.16, 0.3, -0.3, 0.45, -0.45, 0]) {
    const control: Pt = [mid[0] + nx * off * len, mid[1] + ny * off * len];
    let collisions = 0;
    for (let i = 1; i < 28; i++) {
      const p = bezier(from, control, to, i / 28);
      if (PART_NUMBERS.some(part => !skip.includes(part) && hitsIsland(p, part))) collisions++;
    }
    const outside = control[0] < 0 || control[0] > MAP_W || control[1] < 0 || control[1] > MAP_H;
    const score = collisions * 10 + (outside ? 1000 : 0) + Math.abs(off) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = { from, control, to, d: `M${from[0].toFixed(1)} ${from[1].toFixed(1)} Q${control[0].toFixed(1)} ${control[1].toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`, collisions };
    }
  }
  return best as RouteLeg;
}

/** The boat sails to chest ①, then on to chest ②. */
export function boatRoute(numbered: PartNumber[]): RouteLeg[] {
  const out: RouteLeg[] = [];
  let from: Pt = [BOAT_POS[0] + 34, BOAT_POS[1] - 16];
  let prev: PartNumber | null = null;
  for (const part of numbered) {
    const [x, y] = ISLAND_POS[part];
    const start: Pt = prev ? shorePoint(prev, [x, y]) : from;
    const end = shorePoint(part, start);
    out.push(routeLeg(start, end, prev ? [prev, part] : [part]));
    from = end;
    prev = part;
  }
  return out;
}
