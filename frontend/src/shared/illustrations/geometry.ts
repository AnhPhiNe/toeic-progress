/** Small geometry helpers shared by the illustrated scenes (Hôm nay road, Hành trình mountain). */
export type Pt = readonly [number, number];

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** Catmull-Rom control points for the segment p1 → p2. */
function controls(p0: Pt, p1: Pt, p2: Pt, p3: Pt): [Pt, Pt] {
  return [[p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]];
}

/** Smooth SVG path through the points (Catmull-Rom as cubic Béziers). */
export function smoothPath(pts: readonly Pt[]): string {
  if (!pts.length) return '';
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [c1, c2] = controls(pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]);
    d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(pts[i + 1][0])} ${f1(pts[i + 1][1])}`;
  }
  return d;
}

export interface Sampled {
  /** Dense points along the smooth curve. */
  pts: Pt[];
  /** Index in `pts` of every input point. */
  at: number[];
}

/** Samples the same smooth curve as smoothPath, about every `step` units. */
export function sampleSmooth(pts: readonly Pt[], step = 4): Sampled {
  if (pts.length < 2) return { pts: [...pts], at: pts.map((_, i) => i) };
  const out: Pt[] = [];
  const at: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const [c1, c2] = controls(pts[i - 1] ?? p1, p1, p2, pts[i + 2] ?? p2);
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    at.push(out.length);
    for (let k = 0; k < n; k++) {
      const t = k / n, u = 1 - t;
      out.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]);
    }
  }
  at.push(out.length);
  out.push(pts[pts.length - 1]);
  return { pts: out, at };
}

export interface Polyline {
  /** Total length. */
  L: number;
  /** Length from the start to every point. */
  cum: number[];
  /** Point at distance d from the start (clamped). */
  atLen: (d: number) => Pt;
  /** Point at fraction f (0..1) of the length. */
  at: (f: number) => Pt;
  /** Unit direction of travel at distance d. */
  dirAt: (d: number) => Pt;
}

export function polyline(pts: readonly Pt[]): Polyline {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1] ?? 0;
  const seg = (d: number) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    return i;
  };
  const atLen = (d: number): Pt => {
    if (pts.length < 2) return pts[0] ?? [0, 0];
    const x = Math.max(0, Math.min(L, d)), i = seg(x), len = cum[i] - cum[i - 1];
    const t = len ? (x - cum[i - 1]) / len : 0;
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  };
  const dirAt = (d: number): Pt => {
    if (pts.length < 2) return [1, 0];
    const i = seg(Math.max(0, Math.min(L, d)));
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  return { L, cum, atLen, at: f => atLen(f * L), dirAt };
}

/** "M x y L x y ..." through the points. */
export const linePath = (pts: readonly Pt[]) => pts.length ? 'M' + pts.map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L') : '';

/** Repeatable pseudo-random numbers in [0, 1) (same scene on every render). */
export function seeded(seed: number): () => number {
  let r = seed;
  return () => (r = (r * 9301 + 49297) % 233280) / 233280;
}

/** Filled ribbon (a stream) along a smooth centre line, its width growing from w0 to w1. */
export function ribbon(center: readonly Pt[], w0: number, w1: number): { poly: string; mid: string } {
  const d = sampleSmooth(center, 4).pts;
  const left: Pt[] = [], right: Pt[] = [];
  d.forEach((p, i) => {
    const q = d[Math.min(i + 1, d.length - 1)], o = d[Math.max(i - 1, 0)];
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const w = (w0 + (w1 - w0) * Math.pow(i / Math.max(1, d.length - 1), 1.4)) / 2;
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  });
  return { poly: linePath(left) + ' L' + right.reverse().map(p => `${f1(p[0])} ${f1(p[1])}`).join(' L') + 'Z', mid: linePath(d) };
}

/** Sub-polyline between fractions a..b of a dense curve. */
export function slicePts(dense: readonly Pt[], a: number, b: number): Pt[] {
  const pl = polyline(dense);
  const out: Pt[] = [pl.at(a)];
  for (let i = 1; i < dense.length - 1; i++) {
    const f = pl.cum[i] / (pl.L || 1);
    if (f > a && f < b) out.push(dense[i]);
  }
  out.push(pl.at(b));
  return out;
}
