/**
 * Layout of the sea map in "Từng Part" (sketch: design/previews/mock-journey-compact.html), in scene units: the scene
 * is MAP_H tall and as wide as the window gives it. The stat card sits top-left and the detail panel at the right, so
 * the islands are spread over the space between them (mapLayout), where each one sits, where a chest goes on it and
 * the dotted route Sóc's boat sails between chests.
 */
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { PART_NUMBERS } from '@/shared/domain/questionNumbers';
import { partSize } from './journeyData';
import { islandRadius } from './islands';

/** Reference width (the layout default); the real width is passed in. */
export const MAP_W = 1068;
export const MAP_H = 692;
/** Narrowest scene we lay out for; SceneStage scales the scene down on a narrower window instead of squeezing it. */
export const MIN_MAP_W = 1000;
/** The right-hand panel (width 290 + margin 16) and a little air in front of it. */
export const PANEL_W = 306;

export type Pt = readonly [number, number];

/** Island centres, boat and sketch decor for the narrowest scene; x stretches with the space left of the panel. */
const BASE_POS: Record<PartNumber, Pt> = {
  1: [118, 330], 2: [390, 205], 3: [175, 548], 4: [330, 405], 5: [590, 195], 6: [470, 618], 7: [560, 450]
};
const BASE_BOAT: Pt = [320, 655];
const BASE_SPACE = MIN_MAP_W - PANEL_W;

export interface MapLayout {
  width: number;
  /** Width of the sea left of the right-hand panel; islands, boat and labels live inside it. */
  space: number;
  pos: Record<PartNumber, Pt>;
  boat: Pt;
}

/** Spreads the islands over the sea between the stat card and the panel for a scene `width` wide. */
export function mapLayout(width: number): MapLayout {
  const space = Math.max(MIN_MAP_W, width) - PANEL_W;
  const f = space / BASE_SPACE;
  const pos = Object.fromEntries(PART_NUMBERS.map(p => [p, [BASE_POS[p][0] * f, BASE_POS[p][1]] as Pt])) as Record<PartNumber, Pt>;
  return { width, space, pos, boat: [BASE_BOAT[0] * f, BASE_BOAT[1]] };
}

const DEFAULT_LAYOUT = mapLayout(MAP_W);

export const SIGN_W = 112;
export const SIGN_H = 36;

export const radiusOf = (part: PartNumber) => islandRadius(partSize(part));

/** Top-left of the one-line sign planted on an island. */
export function signBox(part: PartNumber, L: MapLayout = DEFAULT_LAYOUT): { x: number; y: number; w: number; h: number } {
  const [x, y] = L.pos[part];
  return { x: x - SIGN_W / 2, y: y - radiusOf(part) * .32 - SIGN_H - 6, w: SIGN_W, h: SIGN_H };
}

/** Where a chest stands on its island: ① at the front right, ② at the front left, emptied chests like ①. */
export function chestSpot(part: PartNumber, rank: 0 | 1, L: MapLayout = DEFAULT_LAYOUT): Pt {
  const [x, y] = L.pos[part], r = radiusOf(part);
  return rank === 1 ? [x - r * .45, y + r * .3] : [x + r * .32, y + r * .32];
}

/** Point just off the island's shore, on the line from `from` towards the island centre. */
export function shorePoint(part: PartNumber, from: Pt, L: MapLayout = DEFAULT_LAYOUT): Pt {
  const [x, y] = L.pos[part], r = radiusOf(part);
  const cx = x, cy = y + r * .3, rx = r * 1.14, ry = r * .62;
  const dx = from[0] - cx, dy = from[1] - cy;
  const k = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2 || 1);
  return [cx + dx * k, cy + dy * k];
}

const bezier = (a: Pt, c: Pt, b: Pt, t: number): Pt => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];

function hitsIsland(p: Pt, part: PartNumber, L: MapLayout): boolean {
  const [x, y] = L.pos[part], r = radiusOf(part);
  const ex = (p[0] - x) / (r * 1.22), ey = (p[1] - (y + r * .3)) / (r * .66);
  if (ex * ex + ey * ey < 1) return true;
  const s = signBox(part, L);
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
export function routeLeg(from: Pt, to: Pt, skip: PartNumber[], L: MapLayout = DEFAULT_LAYOUT): RouteLeg {
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
      if (PART_NUMBERS.some(part => !skip.includes(part) && hitsIsland(p, part, L))) collisions++;
    }
    const outside = control[0] < 0 || control[0] > L.width || control[1] < 0 || control[1] > MAP_H;
    const score = collisions * 10 + (outside ? 1000 : 0) + Math.abs(off) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = { from, control, to, d: `M${from[0].toFixed(1)} ${from[1].toFixed(1)} Q${control[0].toFixed(1)} ${control[1].toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`, collisions };
    }
  }
  return best as RouteLeg;
}

/** The boat sails to chest ①, then on to chest ②. */
export function boatRoute(numbered: PartNumber[], L: MapLayout = DEFAULT_LAYOUT): RouteLeg[] {
  const out: RouteLeg[] = [];
  let from: Pt = [L.boat[0] + 34, L.boat[1] - 16];
  let prev: PartNumber | null = null;
  for (const part of numbered) {
    const [x, y] = L.pos[part];
    const start: Pt = prev ? shorePoint(prev, [x, y], L) : from;
    const end = shorePoint(part, start, L);
    out.push(routeLeg(start, end, prev ? [prev, part] : [part], L));
    from = end;
    prev = part;
  }
  return out;
}
