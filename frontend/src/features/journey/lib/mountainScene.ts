/**
 * Geometry of "Hành trình điểm › Điểm số" (sketch J1 "Leo núi tuyết" in design/previews/mock-journey-score3.html):
 * the green mountain's ridge is the score line, every counted test is a stake on it, and the target is a snowy peak
 * behind the ridge at the target's height. All numbers are in the 1068×692 sketch scene.
 */
import { yGuides, type JourneyPoint, type ScoreMetric } from './scoreJourney';

export const SCENE_W = 1068;
export const SCENE_H = 692;
/** Where the lowest and the highest score are drawn (apex of the snowy peak sits at or below Y_HIGH). */
export const Y_LOW = 545;
export const Y_HIGH = 130;
/** Top of the meadow strip; the ridge never goes below it. */
export const FLOOR = SCENE_H - 62;
/** x of the latest stake. Earlier ones are packed to its left at up to 70px apart, never closer than 56. */
export const X_LAST = 780;
const X_FIRST_MIN = 330;
const DX_MAX = 70;
/** The peak always stands at least this much above the highest stake, so the ridge never hides the flag. */
export const PEAK_GAP = 56;
export const PEAK_DX = 150;
export const BOARD_HALF = 22;
const POLE_MIN = 26;
const POLE_MAX = 92;

export type Pt = readonly [number, number];

export function slotXs(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [X_LAST];
  const dx = Math.min(DX_MAX, (X_LAST - X_FIRST_MIN) / (n - 1));
  return Array.from({ length: n }, (_, i) => X_LAST - (n - 1 - i) * dx);
}

export interface MountainScale {
  /** Scene y for a score. */
  y: (score: number) => number;
  min: number;
  max: number;
  /** The target is far above the best test (yGuides "pinned"): the peak is drawn at its highest allowed spot. */
  pinned: boolean;
  apexY: number;
}

/**
 * Score → height, built on yGuides (lowest test − 20 up to target + 15, or best + 40 when the target is pinned), then
 * stretched when needed so the best stake is at least PEAK_GAP under the highest point the peak may reach. The peak
 * is at the target's height, but never lower than PEAK_GAP above the best stake (when the target is already
 * reached it stands a little above the ridge) and never above Y_HIGH.
 */
export function mountainScale(points: JourneyPoint[], target: number, metric: ScoreMetric = 'total'): MountainScale {
  const shown = points.filter(p => !p.excluded || p.forced);
  const basis = shown.length ? shown : points;
  const guides = yGuides(basis, target, { metric });
  const best = basis.length ? Math.max(...basis.map(p => p.score)) : (Number.isFinite(target) ? target : 0);
  const min = guides.min;
  const lift = PEAK_GAP / (Y_LOW - Y_HIGH);
  const max = Math.max(guides.max, best + 1, (best - lift * min) / (1 - lift));
  const span = Math.max(1, max - min);
  const y = (score: number) => Y_LOW - (score - min) / span * (Y_LOW - Y_HIGH);
  const pinned = guides.targetPinned;
  const targetY = Number.isFinite(target) && !pinned ? Math.max(Y_HIGH, y(target)) : Y_HIGH;
  const apexY = Math.max(Y_HIGH, Math.min(targetY, y(best) - PEAK_GAP));
  return { y, min, max, pinned, apexY };
}

/** Stake pole length: long enough that the board does not sink into a steep ridge on either side. */
export function poleLength(i: number, xs: number[], ys: number[], onRidge: number[]): number {
  const k = onRidge.indexOf(i);
  if (k < 0) return POLE_MIN;
  let need = POLE_MIN;
  const prev = onRidge[k - 1], next = onRidge[k + 1];
  if (prev !== undefined) need = Math.max(need, (ys[i] - ys[prev]) / Math.max(1, xs[i] - xs[prev]) * BOARD_HALF + 6);
  if (next !== undefined) need = Math.max(need, (ys[i] - ys[next]) / Math.max(1, xs[next] - xs[i]) * BOARD_HALF + 6);
  return Math.round(Math.min(POLE_MAX, need));
}

export interface Mountain {
  xs: number[];
  /** Stake heights; a test left out of the trend keeps its own height, clamped to the visible range. */
  ys: number[];
  /** Indices of the tests the ridge runs through. */
  onRidge: number[];
  /** Sóc stands on this test (the last one on the ridge); -1 when there is none or the target is reached. */
  sitIdx: number;
  reached: boolean;
  pinned: boolean;
  /** Whole ridge from the left edge to the foot of the peak, x ascending. */
  ridge: Pt[];
  /** Just the stakes on the ridge: the white line drawn on top. */
  ridgeLine: Pt[];
  apex: Pt;
  poles: number[];
  /** Feet of Sóc. At the flag when the target is reached, else on the latest counted stake. */
  soc: Pt | null;
  /** Dotted trail from Sóc up to the flag; null when there is nothing to climb. */
  trail: Pt[] | null;
  ridgeAt: (x: number) => number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function buildMountain(points: JourneyPoint[], target: number, metric: ScoreMetric = 'total'): Mountain {
  const n = points.length;
  const scale = mountainScale(points, target, metric);
  const xs = slotXs(n);
  const onRidge = points.map((p, i) => (!p.excluded || p.forced) ? i : -1).filter(i => i >= 0);
  const ys = points.map(p => clamp(scale.y(p.score), Y_HIGH - 20, FLOOR - 40));
  const apex: Pt = [X_LAST + PEAK_DX, scale.apexY];
  const lastIdx = onRidge.length ? onRidge[onRidge.length - 1] : -1;
  const reached = lastIdx >= 0 && Number.isFinite(target) && points[lastIdx].score >= target;

  // The ridge: lead-in slope from the left edge, the stakes, then the slope down in front of the peak.
  const line: Pt[] = onRidge.length ? onRidge.map(i => [xs[i], ys[i]] as Pt) : [[X_LAST - 240, Y_LOW - 40], [X_LAST, Y_LOW - 110]];
  const first = line[0], last = line[line.length - 1];
  const lead: Pt[] = [];
  for (let k = 1; first[0] - k * 110 > 0; k++) lead.unshift([first[0] - k * 110, Math.min(FLOOR, first[1] + k * 55)] as Pt);
  lead.unshift([-20, FLOOR]);
  const tail: Pt[] = [[last[0] + 58, Math.min(FLOOR, last[1] + 34)], [last[0] + 96, Math.min(FLOOR, last[1] + 120)], [last[0] + 120, SCENE_H]];
  const ridge = [...lead, ...line, ...tail];

  const ridgeAt = (x: number): number => {
    if (x <= ridge[0][0]) return ridge[0][1];
    for (let k = 1; k < ridge.length; k++) {
      const [bx, by] = ridge[k], [ax, ay] = ridge[k - 1];
      if (x <= bx) return bx === ax ? by : ay + (by - ay) * (x - ax) / (bx - ax);
    }
    return ridge[ridge.length - 1][1];
  };

  const poles = points.map((_, i) => poleLength(i, xs, ys, onRidge));
  const soc: Pt = reached ? [apex[0] - 36, apex[1] + 24] : lastIdx >= 0 ? [xs[lastIdx], ys[lastIdx]] : [last[0], last[1]];
  const trail: Pt[] | null = reached ? null : [
    [soc[0] + 6, soc[1] + 4], [soc[0] + 58, soc[1] + 30], [apex[0] + 34, apex[1] + 66], [apex[0] - 14, apex[1] + 40], [apex[0] + 12, apex[1] + 20], [apex[0], apex[1] + 6]
  ];
  return { xs, ys, onRidge, sitIdx: reached ? -1 : lastIdx, reached, pinned: scale.pinned, ridge, ridgeLine: line, apex, poles, soc, trail, ridgeAt };
}

/** Date labels along the bottom: tests of the same day share one label with a bracket (sameDayGroup). */
export interface DateGroup { from: number; to: number; }
export function dateGroups(points: JourneyPoint[]): DateGroup[] {
  const out: DateGroup[] = [];
  for (let i = 0; i < points.length;) {
    let j = i;
    while (j + 1 < points.length && points[j + 1].sameDayGroup === points[i].sameDayGroup) j++;
    out.push({ from: i, to: j });
    i = j + 1;
  }
  return out;
}

/** "Còn N điểm" to the target, from the latest counted score; never negative. */
export function pointsToGo(points: JourneyPoint[], target: number): number {
  const counted = points.filter(p => !p.excluded || p.forced);
  if (!counted.length || !Number.isFinite(target)) return 0;
  return Math.max(0, Math.round(target - counted[counted.length - 1].score));
}
