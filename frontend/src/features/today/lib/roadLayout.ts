/**
 * Hôm nay hero "the road" (approved mockup design/previews/journey-v2/1b-today-road.html, source _todayb3.cjs):
 * the eight milestones of milestones.ts (stairSteps) as stops along an S road in rows of 3 / 3 / 2, then a flower
 * arch and the trophy podium (the goal). Pure layout + wording, no React.
 */
import { polyline, sampleSmooth, smoothPath, type Pt } from '@/shared/illustrations/geometry';

export interface RoadLayout {
  /** Coin radius and label font size, in scene units. */
  r: number;
  f: number;
  socW: number;
  podiumS: number;
  archS: number;
  archFont: number;
  /** Eight milestone stops: row 1 left → right, row 2 right → left, row 3 left → right. */
  stops: Pt[];
  /** Extra road points after stop i (the bends between rows, the arch). */
  via: Record<number, Pt[]>;
  arch: Pt;
  goal: Pt;
}

/** Desktop scene: 900 units tall, at least DESK_W wide (the right column covers the scene's right part). */
export const DESK_W = 1192;
export const DESK_H = 900;

export const DESK_ROAD: RoadLayout = {
  r: 30, f: 16, socW: 62, podiumS: .78, archS: 1.15, archFont: 15.5,
  stops: [[110, 822], [285, 830], [460, 818], [640, 648], [470, 640], [300, 646], [190, 470], [350, 462]],
  via: { 2: [[620, 800], [700, 730]], 5: [[120, 610], [110, 540]], 7: [[490, 455]] },
  arch: [490, 455], goal: [640, 432]
};

/** Phone template (390 wide), drawn for the band from the trophy top (PHONE_TOP) to under row 1 (PHONE_BASE). */
const PHONE_W = 390;
const PHONE_TOP = 321;
const PHONE_BASE = 654;
const PHONE_ROAD: RoadLayout = {
  r: 20, f: 11.5, socW: 40, podiumS: .46, archS: .6, archFont: 10,
  stops: [[56, 618], [176, 626], [296, 616], [300, 528], [186, 522], [72, 528], [88, 440], [200, 432]],
  via: { 2: [[362, 576]], 5: [[24, 484]], 7: [[270, 432]] },
  arch: [270, 432], goal: [338, 398]
};

export interface PhoneFit {
  /** Maps a phone-template point into the real band. */
  map: (p: Pt) => Pt;
  sx: number;
  ky: number;
  /** Template y → real y offset (real = oy + y·ky). */
  oy: number;
}

/** Fits the phone template between `top` (room above the trophy) and `base` (top of the task panel), `w` wide. */
export function phoneFit(w: number, top: number, base: number): PhoneFit {
  const sx = Math.max(.8, w / PHONE_W);
  const ky = Math.max(.6, Math.min(1.3, (base - top) / (PHONE_BASE - PHONE_TOP)));
  const oy = base - PHONE_BASE * ky;
  return { sx, ky, oy, map: p => [p[0] * sx, oy + p[1] * ky] };
}

export function phoneRoad(fit: PhoneFit): RoadLayout {
  const k = Math.max(.78, Math.min(1.1, fit.ky));
  const via: Record<number, Pt[]> = {};
  for (const [i, pts] of Object.entries(PHONE_ROAD.via)) via[Number(i)] = pts.map(fit.map);
  return {
    ...PHONE_ROAD,
    r: PHONE_ROAD.r * k, f: PHONE_ROAD.f * Math.max(.9, k), socW: PHONE_ROAD.socW * k, podiumS: PHONE_ROAD.podiumS * k, archS: PHONE_ROAD.archS * k,
    stops: PHONE_ROAD.stops.map(fit.map), via, arch: fit.map(PHONE_ROAD.arch), goal: fit.map(PHONE_ROAD.goal)
  };
}

export interface RoadRoute {
  /** Smooth SVG path of the whole road, start → goal. */
  d: string;
  /** Dense points along it. */
  dense: Pt[];
  /** Distance along the road of each of the eight stops, then the goal last. */
  stopLen: number[];
  L: number;
  atLen: (d: number) => Pt;
  dirAt: (d: number) => Pt;
  /** Smooth path from the start to distance d. */
  pathTo: (d: number) => string;
}

export function roadRoute(layout: RoadLayout): RoadRoute {
  const route: Pt[] = [];
  const stopIdx: number[] = [];
  layout.stops.forEach((p, i) => {
    stopIdx.push(route.length);
    route.push(p);
    for (const v of layout.via[i] ?? []) route.push(v);
  });
  stopIdx.push(route.length);
  route.push(layout.goal);
  const sampled = sampleSmooth(route, 3);
  const pl = polyline(sampled.pts);
  const stopLen = stopIdx.map(i => pl.cum[sampled.at[i]]);
  const pathTo = (d: number) => {
    const pts: Pt[] = [];
    for (let i = 0; i < sampled.pts.length && pl.cum[i] < d; i++) pts.push(sampled.pts[i]);
    pts.push(pl.atLen(d));
    return pts.length > 1 ? 'M' + pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') : '';
  };
  return { d: smoothPath(route), dense: sampled.pts, stopLen, L: pl.L, atLen: pl.atLen, dirAt: pl.dirAt, pathTo };
}

/**
 * Distance along the road where a score sits: between the two milestones around it (values = 8 stops + goal).
 * The last leg ends before the arch (FINISH_AT of the way from the last stop to the podium), so a flag at or above
 * the goal stands on the road in front of the arch, never on the podium.
 */
export const FINISH_AT = .45;
export function scoreLen(route: RoadRoute, values: readonly number[], score: number): number {
  const n = values.length;
  if (!n) return 0;
  const lens = route.stopLen.slice(0, n);
  if (n >= 2) lens[n - 1] = lens[n - 2] + FINISH_AT * (lens[n - 1] - lens[n - 2]);
  if (score <= values[0]) return lens[0];
  if (score >= values[n - 1]) return lens[n - 1];
  let k = 0;
  while (k < n - 2 && values[k + 1] <= score) k++;
  const span = values[k + 1] - values[k];
  const t = span > 0 ? (score - values[k]) / span : 0;
  return lens[k] + t * (lens[k + 1] - lens[k]);
}

export interface FlagTest { id: string; score: number; date: string; name: string }
export interface FlagSpot extends FlagTest { x: number; y: number; latest: boolean }

/** At most this many test flags beside the road (the latest ones). */
export const MAX_FLAGS = 6;

/**
 * Small flags beside the road for the logged tests, at their score. A flag never covers a stop (it moves just before
 * it) and two flags never overlap (the older one is left out). Tests are oldest first; the newest MAX_FLAGS are kept.
 */
export function flagSpots(route: RoadRoute, values: readonly number[], tests: readonly FlagTest[], r: number): FlagSpot[] {
  const out: FlagSpot[] = [];
  const used: number[] = [];
  for (let i = tests.length - 1; i >= 0 && out.length < MAX_FLAGS; i--) {
    const t = tests[i];
    let len = scoreLen(route, values, t.score);
    const near = route.stopLen.find(s => Math.abs(len - s) < r * 1.3);
    if (near !== undefined) len = Math.max(0, near - r * 1.5);
    if (used.some(u => Math.abs(u - len) < r * 1.7)) continue;
    used.push(len);
    const [px, py] = route.atLen(len);
    const [dx, dy] = route.dirAt(len);
    // The side of the road that faces up (or left on a vertical stretch).
    let nx = dy, ny = -dx;
    if (ny > 0 || (Math.abs(ny) < .2 && nx > 0)) { nx = -nx; ny = -ny; }
    out.push({ ...t, x: px + nx * r * 1.2, y: py + ny * r * 1.2, latest: i === tests.length - 1 });
  }
  return out.reverse();
}

/** Sóc's walk on arrival: points along the road from distance `from` to `to` (offsets from the end), about `n` of them. */
export function walkFrames(route: RoadRoute, from: number, to: number, n = 9): Pt[] {
  const end = route.atLen(to);
  return Array.from({ length: n + 1 }, (_, i) => {
    const p = route.atLen(from + (to - from) * i / n);
    return [p[0] - end[0], p[1] - end[1]] as Pt;
  });
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const DAY = 86_400_000;
const dayNum = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);

export interface SignInput {
  target: number;
  /** Full tests with a score. */
  tests: number;
  reached: boolean;
  /** Projected date of reaching the target (forecast estDate); null when the trend gives none. */
  goalDate: string | null;
  /** Tests still needed on the trend, when there is a trend but no pace in days. */
  testsAhead: number | null;
  examDate: string | null | undefined;
  today: string;
}

/** The sky sign: "Theo đà này: chạm 850 ~25/12 · dư 5 tuần", or what to do when there is no honest projection yet. */
export function roadSign({ target, tests, reached, goalDate, testsAhead, examDate, today }: SignInput): string {
  if (reached) return `Bạn đã chạm ${target}! Bấm cúp để đặt mục tiêu mới`;
  if (tests === 0) return 'Ghi đề đầu tiên để Sóc tìm chỗ của bạn trên đường';
  if (tests === 1) return `Ghi thêm một đề để Sóc đoán ngày chạm ${target}`;
  const exam = examDate && !Number.isNaN(Date.parse(examDate)) && dayNum(examDate) >= dayNum(today) ? examDate : null;
  if (goalDate) {
    const head = `Theo đà này: chạm ${target} ~${ddmm(goalDate)}`;
    if (!exam) return head;
    const gap = dayNum(exam) - dayNum(goalDate);
    if (gap >= 7) return `${head} · dư ${Math.floor(gap / 7)} tuần`;
    if (gap >= 0) return `${head} · sát ngày thi`;
    return `${head} · trễ ngày thi ${Math.ceil(-gap / 7)} tuần`;
  }
  if (testsAhead) return `Theo đà này: khoảng ${testsAhead} đề nữa chạm ${target}`;
  return 'Điểm đang chững · luyện Part yếu để lên tiếp';
}

/** True when the projection lands after a set, future exam date (the sign then warns instead of reassuring). */
export function lateForExam(goalDate: string | null, examDate: string | null | undefined, today: string): boolean {
  if (!goalDate || !examDate || Number.isNaN(Date.parse(examDate)) || dayNum(examDate) < dayNum(today)) return false;
  return dayNum(goalDate) > dayNum(examDate);
}

export { ddmm as roadDate };
