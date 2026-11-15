/**
 * Geometry of "Hành trình điểm › Điểm số" (sketch design/previews/mock-journey-compact.html, from J1 "Leo núi tuyết"):
 * the green mountain's ridge is the score line, every counted test is a stake on it, and the target is a snowy peak
 * behind the ridge at the target's height. Numbers are scene units: the scene is SCENE_H tall and as wide as the
 * window gives it (at least MIN_SCENE_W), the stakes spreading from the stat card to the latest one.
 */
import { yGuides, type JourneyPoint, type ScoreMetric } from './scoreJourney';

/** Reference width the decor was drawn for; the real scene width is passed in (see SceneStage). */
export const SCENE_W = 1068;
/** Narrowest scene we lay out for; SceneStage scales the scene down on a narrower window instead of squeezing it. */
export const MIN_SCENE_W = 960;
export const SCENE_H = 692;
/** Where the lowest and the highest score are drawn (apex of the snowy peak sits at or below Y_HIGH). */
export const Y_LOW = 545;
export const Y_HIGH = 130;
/** Top of the meadow strip; the ridge never goes below it. */
export const FLOOR = SCENE_H - 62;
/** The stat card (left 20 + width 284, see journey.css .jr-card) ends here; the first stake stands just right of it. */
export const CARD_RIGHT = 306;
const FIRST_GAP = 46;
/** The latest stake stands this far from the scene's right edge, leaving room for the peak and the exam signpost. */
export const LAST_RIGHT = 260;
/** Stakes are spread from the card to the latest one, at most DX_MAX apart; never closer than DX_MIN. */
const DX_MAX = 84;
const DX_MIN = 56;
export const lastX = (width: number) => width - LAST_RIGHT;
/** The peak always stands at least this much above the highest stake, so the ridge never hides the flag. */
export const PEAK_GAP = 56;
export const PEAK_DX = 150;
export const BOARD_HALF = 22;
const POLE_MIN = 26;
const POLE_MAX = 92;

export type Pt = readonly [number, number];

export function slotXs(n: number, width: number = SCENE_W): number[] {
  if (n <= 0) return [];
  const last = lastX(width);
  if (n === 1) return [last];
  const dx = Math.max(DX_MIN, Math.min(DX_MAX, (last - (CARD_RIGHT + FIRST_GAP)) / (n - 1)));
  return Array.from({ length: n }, (_, i) => last - (n - 1 - i) * dx);
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
  /** Sóc stands beside this test (the last one on the ridge); -1 when there is none or the target is reached. */
  sitIdx: number;
  /** The latest counted test, drawn as the gold stake; -1 when none. */
  latestIdx: number;
  reached: boolean;
  pinned: boolean;
  /** Whole ridge from the scene's left edge to the foot of the peak, x ascending. */
  ridge: Pt[];
  /** Just the stakes on the ridge: the white line drawn on top. */
  ridgeLine: Pt[];
  apex: Pt;
  poles: number[];
  /** Feet of Sóc. At the flag when the target is reached, else on the ridge just right of the latest stake. */
  soc: Pt | null;
  /** Where the remaining path turns: from the latest stake down to the saddle, then straight up to the flag; null when there is nothing to climb. */
  trail: Pt[] | null;
  ridgeAt: (x: number) => number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How far right of the latest stake Sóc's feet are, and half the distance between his feet. */
export const SOC_DX = 30;
const SOC_FOOT = 11;

/** Where something with feet ±half wide stands at x: on the lower of the ridge heights under it, so no foot floats. */
export function standOn(ridgeAt: (x: number) => number, x: number, half = SOC_FOOT): Pt {
  return [x, Math.max(ridgeAt(x - half), ridgeAt(x + half), ridgeAt(x))];
}

export function buildMountain(points: JourneyPoint[], target: number, metric: ScoreMetric = 'total', width: number = SCENE_W): Mountain {
  const n = points.length;
  const scale = mountainScale(points, target, metric);
  const xs = slotXs(n, width);
  const X_LAST = lastX(width);
  const onRidge = points.map((p, i) => (!p.excluded || p.forced) ? i : -1).filter(i => i >= 0);
  const ys = points.map(p => clamp(scale.y(p.score), Y_HIGH - 20, FLOOR - 40));
  const apex: Pt = [X_LAST + PEAK_DX, scale.apexY];
  const lastIdx = onRidge.length ? onRidge[onRidge.length - 1] : -1;
  const reached = lastIdx >= 0 && Number.isFinite(target) && points[lastIdx].score >= target;

  // The ridge: lead-in slope that starts at the scene's left edge, the stakes, then the slope down in front of the peak.
  const line: Pt[] = onRidge.length ? onRidge.map(i => [xs[i], ys[i]] as Pt) : [[X_LAST - 240, Y_LOW - 40], [X_LAST, Y_LOW - 110]];
  const first = line[0], last = line[line.length - 1];
  // With one stake the slope rises from the edge all the way up to it; with more, the first stake stands on the foot of the climb.
  const single = line.length === 1;
  const edgeY = Math.min(FLOOR - 6, single ? Math.max(SCENE_H - 100, first[1] + 40) : Math.max(SCENE_H - 100, Math.min(FLOOR - 4, first[1] + 77) + 14));
  const bend: Pt = single ? [first[0] * .35, edgeY + (first[1] - edgeY) * .25] : [Math.max(first[0] * .45, first[0] - 137), Math.min(FLOOR - 4, first[1] + 77)];
  const lead: Pt[] = [[0, edgeY], bend];
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
  // The latest stake carries a bigger gold board: its pole is longer so the board still clears a steep slope.
  if (lastIdx >= 0) poles[lastIdx] = Math.max(34, poles[lastIdx] + 8);
  const soc: Pt = reached ? [apex[0] - 36, apex[1] + 24] : standOn(ridgeAt, lastIdx >= 0 ? xs[lastIdx] + SOC_DX : last[0]);
  const trail: Pt[] | null = reached ? null : [[last[0] + 8, last[1] + 6], [last[0] + 58, last[1] + 36], [apex[0] - 6, apex[1] + 14]];
  return { xs, ys, onRidge, sitIdx: reached ? -1 : lastIdx, latestIdx: lastIdx, reached, pinned: scale.pinned, ridge, ridgeLine: line, apex, poles, soc, trail, ridgeAt };
}

export const TRAIL_STEP = 13;

/** The snowy cap of the peak (the polygon around the flag's foot); dots of the trail crossing it are drawn grey. */
export function snowCap(apex: Pt): Pt[] {
  const [ax, ay] = apex;
  return [[ax - 46, ay + 58], [ax, ay], [ax + 48, ay + 60], [ax + 30, ay + 52], [ax + 16, ay + 66], [ax, ay + 50], [ax - 14, ay + 64], [ax - 28, ay + 50]];
}

function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export interface TrailDot { x: number; y: number; snow: boolean; }

/** Small dots every TRAIL_STEP px along the trail's legs, flagged when they sit on the snow cap. */
export function trailDots(trail: Pt[] | null, apex: Pt): TrailDot[] {
  if (!trail) return [];
  const cap = snowCap(apex), out: TrailDot[] = [];
  let carry = 0;
  for (let i = 1; i < trail.length; i++) {
    const [ax, ay] = trail[i - 1], [bx, by] = trail[i], len = Math.hypot(bx - ax, by - ay);
    for (let d = (TRAIL_STEP - carry % TRAIL_STEP) % TRAIL_STEP; d <= len; d += TRAIL_STEP) {
      const x = ax + (bx - ax) * d / len, y = ay + (by - ay) * d / len;
      out.push({ x, y, snow: inside([x, y], cap) });
    }
    carry += len;
  }
  return out;
}

/** Wording of a test against the one before it ("đề đầu tiên" for the first). */
export function deltaText(delta: number | null): string {
  if (delta === null) return 'đề đầu tiên';
  if (delta > 0) return `▲ ${delta} so với đề trước`;
  if (delta < 0) return `▼ ${-delta} so với đề trước`;
  return 'bằng đề trước';
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

export interface Rect { x: number; y: number; w: number; h: number; }
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Top of a speech bubble that ends at `right`: starts at `top` and moves up until it clears the `avoid` boxes and the
 * ridge under it, so it never covers a stake, the stat card or the slope. Falls back to `minTop`.
 */
export function placeBubble(ridgeAt: (x: number) => number, right: number, w: number, h: number, top: number, avoid: Rect[], minTop = 14): number {
  for (let t = top; t > minTop; t -= 8) {
    const r: Rect = { x: right - w, y: t, w, h };
    if (avoid.some(a => overlap(r, a))) continue;
    let above = true;
    for (let x = r.x; x <= right && above; x += 16) above = ridgeAt(x) >= t + h + 8;
    if (above) return t;
  }
  return minTop;
}
