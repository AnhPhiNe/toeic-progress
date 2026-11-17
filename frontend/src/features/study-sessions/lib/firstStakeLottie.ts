/**
 * Runtime Lottie for the first-stake card: a stake with a gold sign drops onto a small green slope, the slope squashes,
 * dust puffs and confetti burst. Sóc and the score are real DOM drawn next to it (see FirstStakeCard), so the Lottie
 * only carries shapes. Canvas 320x240, 60fps.
 */
type Json = any;
export const STAKE_W = 320, STAKE_H = 240, STAKE_LAND = 22;
const FR = 60, OP = 110;

const st = (k: unknown) => ({ a: 0, k });
function kf(frames: Array<[number, number | number[]]>, ease: [number, number, number, number] = [0.4, 1, 0.6, 0]) {
  return {
    a: 1,
    k: frames.map(([t, v], i) => {
      const s = Array.isArray(v) ? v : [v];
      return i < frames.length - 1 ? { t, s, i: { x: [ease[0]], y: [ease[1]] }, o: { x: [ease[2]], y: [ease[3]] } } : { t, s };
    })
  };
}
const tr = () => ({ ty: 'tr', p: st([0, 0]), a: st([0, 0]), s: st([100, 100]), r: st(0), o: st(100), sk: st(0), sa: st(0) });
const rect = (x: number, y: number, w: number, h: number, r = 0) => ({ ty: 'rc', d: 1, p: st([x, y]), s: st([w, h]), r: st(r) });
const ell = (x: number, y: number, w: number, h: number) => ({ ty: 'el', d: 1, p: st([x, y]), s: st([w, h]) });
function rgb(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).concat(1) as [number, number, number, number];
}
const fill = (c: string, o = 100) => ({ ty: 'fl', c: st(rgb(c)), o: st(o), r: 1 });
const grp = (items: Json[]) => ({ ty: 'gr', nm: 'g', it: [...items, tr()] });
const ks = (o: { p?: Json; a?: number[]; s?: Json; r?: Json; o?: Json } = {}) => ({
  o: o.o ?? st(100), r: o.r ?? st(0), p: o.p ?? st([0, 0, 0]), a: st([...(o.a ?? [0, 0]), 0]), s: o.s ?? st([100, 100, 100])
});
let IND = 0;
const layer = (nm: string, shapes: Json[], k: Json, ip = 0, op = OP): Json => ({ ddd: 0, ind: ++IND, ty: 4, nm, sr: 1, ks: k, ao: 0, shapes, ip, op, st: 0, bm: 0 });

/** Where the sign sits (fraction of the stage) so the DOM score can be laid over it. */
export const SIGN = { x: 0.66, y: 0.567, w: 0.23, h: 0.19 };

export function buildFirstStakeAnimation(): Json {
  IND = 0;
  const L: Json[] = [];
  const cx = STAKE_W * SIGN.x, base = 178, mound = 222;
  const cols = ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa', '#ff9a4d'];
  for (let i = 0; i < 20; i++) {
    const a = -Math.PI / 2 + (i - 9.5) * 0.17, d = 80 + (i % 5) * 18, ex = cx + Math.cos(a) * d * 1.5, ey = 110 + Math.sin(a) * d;
    L.push(layer('cf' + i, [grp([rect(0, 0, 8, 4 + (i % 3) * 2, 1.5), fill(cols[i % 6])])], ks({
      p: kf([[STAKE_LAND, [cx, base - 20, 0]], [STAKE_LAND + 22, [ex, ey, 0]], [STAKE_LAND + 62, [ex + (i % 2 ? 12 : -12), ey + 90, 0]]], [0.2, 1, 0.3, 0]),
      r: kf([[STAKE_LAND, 0], [STAKE_LAND + 62, i % 2 ? 360 : -360]]), o: kf([[STAKE_LAND, 100], [STAKE_LAND + 40, 100], [STAKE_LAND + 66, 0]])
    }), STAKE_LAND, STAKE_LAND + 68));
  }
  // Dust puffs either side of the pole.
  [-1, 1].forEach((side, i) => {
    L.push(layer('dust' + i, [grp([ell(0, 0, 26, 18), fill('#ffffff', 80)])], ks({
      p: kf([[STAKE_LAND, [cx + side * 10, base + 2, 0]], [STAKE_LAND + 18, [cx + side * 48, base - 6, 0]]], [0.3, 1, 0.5, 0]),
      s: kf([[STAKE_LAND, [30, 30, 100]], [STAKE_LAND + 18, [130, 110, 100]]]), o: kf([[STAKE_LAND, 90], [STAKE_LAND + 18, 0]])
    }), STAKE_LAND, STAKE_LAND + 20));
  });
  // Stake: pole + gold sign, dropping from above with a small bounce.
  // First shape is drawn on top: shine, sign, sign shadow, pole.
  const stake = [
    grp([rect(cx, base - 42, 62, 34, 6), fill('#ffe58f', 55)]),
    grp([rect(cx, base - 42, 74, 46, 9), fill('#ffc83d')]),
    grp([rect(cx + 2, base - 38, 74, 46, 9), fill('#d99a00')]),
    grp([rect(cx, base - 36, 8, 76, 3), fill('#b7834f')])
  ];
  L.push(layer('stake', stake, ks({
    p: kf([[0, [cx, base - 240, 0]], [STAKE_LAND, [cx, base + 4, 0]], [STAKE_LAND + 5, [cx, base - 8, 0]], [STAKE_LAND + 11, [cx, base, 0]]], [0.55, 0, 0.8, 0.5]),
    r: kf([[0, 14], [STAKE_LAND, 0]]), a: [cx, base]
  })));
  // The slope: two overlapping mounds that squash when the stake lands.
  const slope = [
    grp([ell(STAKE_W * 0.5, mound, 290, 100), fill('#3a9a4d')]),
    grp([ell(STAKE_W * 0.54, mound - 4, 250, 90), fill('#5fc472')]),
    grp([ell(STAKE_W * 0.66, mound - 8, 130, 58), fill('#7fd890')])
  ];
  L.push(layer('slope', slope, ks({
    p: st([STAKE_W / 2, STAKE_H, 0]), a: [STAKE_W / 2, STAKE_H],
    s: kf([[0, [100, 100, 100]], [STAKE_LAND, [100, 100, 100]], [STAKE_LAND + 3, [101, 94, 100]], [STAKE_LAND + 12, [100, 100, 100]]])
  })));
  return { v: '5.7.4', fr: FR, ip: 0, op: OP, w: STAKE_W, h: STAKE_H, nm: 'first-stake', ddd: 0, assets: [], layers: L };
}
