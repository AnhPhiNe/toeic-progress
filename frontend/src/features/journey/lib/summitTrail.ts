/**
 * Hành trình điểm › Điểm số v3 (approved mockup design/previews/journey-v3/score-mountain-v3.html, source _build.cjs):
 * an illustrated mountain whose trail carries one stake per test ("Đề 1..N"), the summit flag at the target.
 * Pure geometry + wording, no React.
 */
import { polyline, sampleSmooth, type Pt } from '@/shared/illustrations/geometry';
import type { Forecast } from './scoreJourney';

/** The mountain art is drawn on this reference box (desktop scene 1112 × 764). */
export const MTN_W = 1112;
export const MTN_H = 764;
/** Summit (flag foot) in mountain units. */
export const PEAK: Pt = [935, 148];
/** The trail from the foot to the summit, in mountain units. */
export const TRAIL: Pt[] = [[628, 692], [664, 684], [700, 672], [742, 654], [782, 610], [812, 556], [836, 500], [856, 444], [874, 388], [890, 330], [905, 274], [918, 222], [928, 184], [935, 152]];
/** First stake stands this far up the trail (fraction of its length). */
export const FIRST_STAKE = .045;

/** Stakes on the trail: one per logged test plus three still to fill, at least four ("Đề 1..N"). */
export const stakeCount = (tests: number) => Math.max(4, tests + 3);

/** Where stake k (0-based) stands, as a fraction of the trail; the last one stops short of the summit. */
export function stakeAt(k: number, stakes: number): number {
  return FIRST_STAKE + k * (1 - FIRST_STAKE) / stakes;
}

export interface Placement {
  /** Mountain units → scene units. */
  tx: number;
  ty: number;
  s: number;
}
export const place = (p: Placement, q: Pt): Pt => [p.tx + q[0] * p.s, p.ty + q[1] * p.s];

export interface TrailGeometry {
  dense: Pt[];
  L: number;
  at: (f: number) => Pt;
  /** Stake foot positions (scene units), every stake in order. */
  stakes: Pt[];
  /** Fraction of the latest logged test (-1 when none). */
  latest: number;
}

/** The trail placed in the scene, from `from` (index into TRAIL, the phone starts one point up) and its stakes. */
export function trailGeometry(p: Placement, tests: number, from = 0): TrailGeometry {
  const dense = sampleSmooth(TRAIL.slice(from).map(q => place(p, q)), 2).pts;
  const pl = polyline(dense);
  const n = stakeCount(tests);
  const stakes = Array.from({ length: n }, (_, k) => pl.at(stakeAt(k, n)));
  return { dense, L: pl.L, at: pl.at, stakes, latest: tests > 0 ? stakeAt(tests - 1, n) : -1 };
}

export interface Verdict {
  kind: 'empty' | 'early' | 'kip' | 'late' | 'rising' | 'reached' | 'flat';
  /** Big word ("Kịp!") or null when the card shows only a sentence. */
  title: string | null;
  text: string;
  /** Parts of text drawn in bold (the target and the projected date). */
  bold?: string[];
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "MÌNH CÓ KỊP KHÔNG?": the answer for the card, from the same forecast() as Hôm nay. */
export function verdict(tests: number, fc: Forecast | null, target: number, examDate: string | null | undefined): Verdict {
  if (tests === 0) return { kind: 'empty', title: null, text: 'Ghi đề đầu tiên để cắm cờ đầu tiên trên núi' };
  if (fc?.kind === 'reached') return { kind: 'reached', title: 'Chạm đỉnh!', text: `Bạn đã cắm cờ ${target}, giữ phong độ nhé.` };
  if (fc?.kind === 'rising') {
    const when = fc.estDate ? `khoảng ${ddmm(fc.estDate)}` : `sau khoảng ${fc.testsAhead} đề nữa`;
    if (fc.estDate && examDate && fc.daysLeft !== null) {
      return fc.beforeExam
        ? { kind: 'kip', title: 'Kịp!', text: `Theo đà này chạm ${target} ${when} — trước ngày thi ${ddmm(examDate)}.`, bold: [String(target), ddmm(fc.estDate)] }
        : { kind: 'late', title: 'Hơi gấp', text: `Theo đà này chạm ${target} ${when} — sau ngày thi ${ddmm(examDate)}. Thêm vài buổi luyện mỗi tuần nhé.`, bold: [String(target), ddmm(fc.estDate)] };
    }
    return { kind: 'rising', title: 'Đang lên!', text: `Theo đà này chạm ${target} ${when}.`, bold: [String(target)] };
  }
  if (tests < 2) return { kind: 'early', title: null, text: 'Ghi thêm một đề để Sóc vẽ đường dự báo' };
  return { kind: 'flat', title: 'Đang chững', text: 'Điểm đang chững, xem Part nào kéo điểm lại nhé.' };
}
