/**
 * Geometry and grouping for the phone version of Hành trình điểm (sketch: design/previews/mock-phone-journey.html).
 * Everything is in screen pixels of the scene box (width × height of the area under the header), unlike the desktop
 * scene units. Scores are mapped to heights with the desktop scale (mountainScale) so both versions agree.
 */
import type { StudySession } from '@/shared/types';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import type { JourneyPoint, ScoreMetric } from './scoreJourney';
import { Y_HIGH, Y_LOW, mountainScale } from './mountainScene';
import { partSize, wrongCountsByPart } from './journeyData';
import { islandRadius, partAccuracy } from './islands';

export type Pt = readonly [number, number];

/** Height of the bottom panel the scene must stay clear of (panel + a little air). */
export const PANEL_CLEAR = 200;
const LEFT = 26;
const MAX_DX = 46;

export interface PhoneMountain {
  xs: number[];
  ys: number[];
  /** Foot of the lowest stake line; the mountain's body is drawn down from here. */
  base: number;
  apex: Pt;
  /** Stakes the ridge runs through (test left out of the trend are skipped), as points. */
  ridge: Pt[];
  /** Dotted climb from the latest stake to the flag; empty when the flag is reached or there are no stakes. */
  trail: Pt[];
  latestIdx: number;
  reached: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Where the stakes stand for `points` in a w × h scene; the latest one is nearest the peak. */
export function phoneMountain(points: JourneyPoint[], target: number, metric: ScoreMetric, w: number, h: number): PhoneMountain {
  const n = points.length;
  const base = h - PANEL_CLEAR;
  const top = clamp(base - 190, 215, 250);
  const lastX = w - 98;
  const sc = mountainScale(points, target, metric);
  const frac = (s: number) => (Y_LOW - sc.y(s)) / (Y_LOW - Y_HIGH);
  const yOf = (f: number) => base - f * (base - top);
  const dx = n > 1 ? Math.min(MAX_DX, (lastX - LEFT) / (n - 1)) : 0;
  const xs = points.map((_, i) => lastX - (n - 1 - i) * dx);
  const ys = points.map(p => clamp(yOf(frac(p.score)), top - 10, base));
  const apex: Pt = [w - 50, clamp(yOf((Y_LOW - sc.apexY) / (Y_LOW - Y_HIGH)), top, base - 60)];
  const counted = points.map((p, i) => (!p.excluded || p.forced ? i : -1)).filter(i => i >= 0);
  const latestIdx = counted.length ? counted[counted.length - 1] : -1;
  const reached = latestIdx >= 0 && Number.isFinite(target) && points[latestIdx].score >= target;
  const ridge = counted.map(i => [xs[i], ys[i]] as Pt);
  const trail: Pt[] = [];
  if (latestIdx >= 0 && !reached) {
    const [lx, ly] = [xs[latestIdx], ys[latestIdx]];
    const [ax, ay] = apex;
    for (let k = 0; k <= 9; k++) {
      const t = k / 9, mx = (lx + ax) / 2 + 8, my = Math.min(ly, ay) - 4;
      trail.push([(1 - t) ** 2 * lx + 2 * (1 - t) * t * mx + t * t * (ax - 4), (1 - t) ** 2 * ly + 2 * (1 - t) * t * my + t * t * (ay + 10)]);
    }
  }
  return { xs, ys, base, apex, ridge, trail, latestIdx, reached };
}

export interface EmptyClimb {
  /** Five waiting stakes, first = "+ Đề 1". */
  stakes: Pt[];
  /** Smooth slope from the left edge up to the foot of the peak. */
  ridge: Pt[];
  apex: Pt;
  /** Feet of the base camp. */
  camp: Pt;
}

/** The empty mountain: a smooth climb with five stakes waiting on it and a base camp at its foot. */
export function emptyClimb(w: number, h: number): EmptyClimb {
  const base = h - PANEL_CLEAR;
  const top = clamp(base - 190, 215, 250);
  const lastX = w - 98;
  const ease = (t: number) => t * t * (3 - 2 * t);
  const at = (t: number): Pt => [Math.round(30 + (lastX - 30) * t), Math.round(base + 30 - (base + 30 - (top + 90)) * (0.2 * t + 0.8 * ease(t)))];
  const ridge = Array.from({ length: 13 }, (_, k) => at(k / 12));
  const stakes = [0.36, 0.5, 0.64, 0.78, 0.92].map(at);
  return { stakes, ridge, apex: [w - 50, top], camp: [22, ridge[0][1]] };
}

/** Height of a polyline (x ascending) at x. */
export function polyAt(pts: readonly Pt[], x: number): number {
  if (!pts.length) return 0;
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    const [bx, by] = pts[k], [ax, ay] = pts[k - 1];
    if (x <= bx) return bx === ax ? by : ay + (by - ay) * (x - ax) / (bx - ax);
  }
  return pts[pts.length - 1][1];
}

/** Island layout of "Từng Part" in a w × h scene, below the test picker and above the bottom panel. */
export const ISLAND_PANEL_CLEAR = 176;
const MOCK: Record<PartNumber, readonly [number, number]> = {
  1: [85 / 390, 250], 2: [275 / 390, 244], 3: [105 / 390, 370], 4: [282 / 390, 355], 5: [80 / 390, 490], 7: [290 / 390, 480], 6: [185 / 390, 560]
};

export interface PhoneIsland { part: PartNumber; x: number; y: number; w: number; }

export function phoneIslands(w: number, h: number): PhoneIsland[] {
  const top = 262, bottom = Math.max(top + 300, h - ISLAND_PANEL_CLEAR - 56);
  const k = (bottom - top) / (560 - 250);
  return PART_NUMBERS.map(p => {
    const r = islandRadius(partSize(p));
    // Wider scenes spread sideways a little; the mock was drawn at 390.
    return { part: p, x: MOCK[p][0] * w, y: Math.round(top + (MOCK[p][1] - 250) * k), w: Math.round((50 + r * 0.62) * Math.min(1.15, Math.max(0.9, w / 390))) };
  });
}

export interface MonthGroup { key: string; label: string; tests: StudySession[]; }

/** Tests (newest first) grouped by month: "THÁNG 11", with the year added when the list spans more than one. */
export function monthGroups(newestFirst: StudySession[]): MonthGroup[] {
  const years = new Set(newestFirst.map(s => s.date.slice(0, 4)));
  const out: MonthGroup[] = [];
  for (const s of newestFirst) {
    const key = s.date.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.key === key) last.tests.push(s);
    else out.push({ key, label: `THÁNG ${Number(s.date.slice(5, 7))}${years.size > 1 ? ` · ${s.date.slice(0, 4)}` : ''}`, tests: [s] });
  }
  return out;
}

export interface PartBar { part: PartNumber; pct: number; wrong: number; }

/** Correct-answer rate per Part for one test; null when the test has no Part data. */
export function partBars(session: StudySession): PartBar[] | null {
  const counts = wrongCountsByPart(session);
  if (!counts) return null;
  return PART_NUMBERS.map(p => ({ part: p, pct: partAccuracy(partSize(p), counts[p]), wrong: counts[p] }));
}
