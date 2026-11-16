/**
 * Builds the level-up Lottie animation at runtime (same design as design/previews/lottie/make_gift_soc.py):
 * a gift box shakes, the lid pops, Sóc pops out (the real Sóc SVG converted to Lottie shapes), the new item drops
 * onto Sóc, Sóc squashes and blinks; rays, sparkles and confetti around it.
 */
type Json = any;
const W = 400, H = 400, FR = 60, OP = 150, CX = 200, BASE = 300;

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
const tr = (p = [0, 0], a = [0, 0], s = [100, 100], r = 0, o = 100) => ({ ty: 'tr', p: st(p), a: st(a), s: st(s), r: st(r), o: st(o), sk: st(0), sa: st(0) });
const rect = (x: number, y: number, w: number, h: number, r = 0) => ({ ty: 'rc', d: 1, p: st([x, y]), s: st([w, h]), r: st(r) });
const ell = (x: number, y: number, w: number, h: number) => ({ ty: 'el', d: 1, p: st([x, y]), s: st([w, h]) });
function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
const fill = (c: string, o = 100) => ({ ty: 'fl', c: st([...rgb(c), 1]), o: st(o), r: 1 });
const grp = (items: Json[], nm = 'g', t: Json = tr()) => ({ ty: 'gr', nm, it: [...items, t] });
const ks = (o: { p?: Json; a?: number[]; s?: Json; r?: Json; o?: Json } = {}) => ({
  o: o.o ?? st(100), r: o.r ?? st(0), p: o.p ?? st([0, 0, 0]), a: st([...(o.a ?? [0, 0]), 0]), s: o.s ?? st([100, 100, 100])
});
let IND = 0;
const layer = (nm: string, shapes: Json[], k: Json, ip = 0, op = OP): Json => ({ ddd: 0, ind: ++IND, ty: 4, nm, sr: 1, ks: k, ao: 0, shapes, ip, op, st: 0, bm: 0 });

// ---------- SVG -> Lottie ----------
function parseColor(c: string | null | undefined): [number[] | null, number] {
  if (!c || c === 'none') return [null, 1];
  const m = /rgba?\(([^)]*)\)/.exec(c);
  if (m) { const p = m[1].split(',').map(Number); return [[p[0] / 255, p[1] / 255, p[2] / 255, 1], p[3] ?? 1]; }
  if (c.startsWith('#')) return [[...rgb(c), 1], 1];
  return [null, 1];
}

function parsePath(d: string): Json[] {
  const toks = d.match(/[MmLlCcQqZzHhVv]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  type Sub = { v: number[][]; i: number[][]; o: number[][]; c: boolean };
  const subs: Sub[] = [];
  let cur: Sub | null = null, pos = [0, 0], start = [0, 0], cmd = 'M', k = 0;
  const num = () => parseFloat(toks[k++]);
  while (k < toks.length) {
    if (/[A-Za-z]/.test(toks[k])) {
      cmd = toks[k++];
      if (/[Zz]/.test(cmd)) { if (cur) cur.c = true; pos = start; continue; }
    }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const [ox, oy] = rel ? pos : [0, 0];
    if (C === 'M') {
      const p = [num() + ox, num() + oy];
      cur = { v: [p], i: [[0, 0]], o: [[0, 0]], c: false }; subs.push(cur); pos = start = p; cmd = rel ? 'l' : 'L';
    } else if (C === 'L' || C === 'H' || C === 'V') {
      const p = C === 'L' ? [num() + ox, num() + oy] : C === 'H' ? [num() + ox, pos[1]] : [pos[0], num() + oy];
      cur!.v.push(p); cur!.i.push([0, 0]); cur!.o.push([0, 0]); pos = p;
    } else if (C === 'C' || C === 'Q') {
      let c1: number[], c2: number[], p: number[];
      if (C === 'C') { c1 = [num() + ox, num() + oy]; c2 = [num() + ox, num() + oy]; p = [num() + ox, num() + oy]; } else {
        const q = [num() + ox, num() + oy]; p = [num() + ox, num() + oy];
        c1 = [pos[0] + 2 / 3 * (q[0] - pos[0]), pos[1] + 2 / 3 * (q[1] - pos[1])];
        c2 = [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])];
      }
      cur!.o[cur!.o.length - 1] = [c1[0] - pos[0], c1[1] - pos[1]];
      cur!.v.push(p); cur!.i.push([c2[0] - p[0], c2[1] - p[1]]); cur!.o.push([0, 0]); pos = p;
    } else { k++; }
  }
  return subs.map(s => {
    let { v, i, o } = s;
    const n = v.length;
    if (s.c && n > 1 && Math.abs(v[0][0] - v[n - 1][0]) < 1e-6 && Math.abs(v[0][1] - v[n - 1][1]) < 1e-6) {
      i = [i[n - 1], ...i.slice(1, n - 1)]; v = v.slice(0, n - 1); o = o.slice(0, n - 1);
    }
    return { ty: 'sh', ks: st({ i, o, v, c: s.c }) };
  });
}

function transforms(t: string | null): Json[] {
  const out: Json[] = [];
  for (const m of (t ?? '').matchAll(/(\w+)\(([^)]*)\)/g)) {
    const a = (m[2].match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (m[1] === 'translate') out.push(tr([a[0], a[1] ?? 0]));
    else if (m[1] === 'rotate') { const c = a.length === 3 ? [a[1], a[2]] : [0, 0]; out.push(tr(c, c, [100, 100], a[0])); }
    else if (m[1] === 'scale') out.push(tr([0, 0], [0, 0], [a[0] * 100, (a[1] ?? a[0]) * 100]));
  }
  return out;
}

type Style = { fill?: string; stroke?: string; 'stroke-width'?: string; opacity: number };
type Anim = Record<string, (el: Element) => Json>;

function convert(el: Element, inh: Style, anim: Anim): Json | null {
  const tag = el.tagName.toLowerCase();
  if ((el.getAttribute('class') ?? '').split(' ').some(c => ['shadow', 'cf', 'tear', 'z1', 'z2', 'd1', 'd2', 'd3', 'wv-lines'].includes(c))) return null;
  const style: Style = { ...inh };
  for (const k of ['fill', 'stroke', 'stroke-width'] as const) { const v = el.getAttribute(k); if (v !== null) style[k] = v; }
  const op = el.getAttribute('opacity'); if (op !== null) style.opacity = inh.opacity * parseFloat(op);
  let node: Json;
  if (tag === 'g' || tag === 'svg') {
    const kids = Array.from(el.children).map(ch => convert(ch, style, anim)).filter(Boolean).reverse();
    if (!kids.length) return null;
    const cls = (el.getAttribute('class') ?? '').split(' ').find(c => anim[c]);
    node = { ty: 'gr', nm: el.getAttribute('class') ?? 'g', it: [...kids, cls ? anim[cls](el) : tr()] };
  } else {
    const n = (a: string) => parseFloat(el.getAttribute(a) ?? '0');
    let geo: Json[];
    if (tag === 'ellipse') geo = [ell(n('cx'), n('cy'), 2 * n('rx'), 2 * n('ry'))];
    else if (tag === 'circle') geo = [ell(n('cx'), n('cy'), 2 * n('r'), 2 * n('r'))];
    else if (tag === 'rect') geo = [rect(n('x') + n('width') / 2, n('y') + n('height') / 2, n('width'), n('height'), n('rx'))];
    else if (tag === 'path') geo = parsePath(el.getAttribute('d') ?? '');
    else return null;
    const paint: Json[] = [];
    const [fc, fa] = parseColor(style.fill ?? '#000');
    if (fc) paint.push({ ty: 'fl', c: st(fc), o: st(100 * fa * style.opacity), r: 1 });
    const [sc, sa] = parseColor(style.stroke);
    if (sc) paint.push({ ty: 'st', c: st(sc), o: st(100 * sa * style.opacity), w: st(parseFloat(style['stroke-width'] ?? '1')), lc: 2, lj: 2 });
    node = { ty: 'gr', nm: tag, it: [...geo, ...paint, tr()] };
  }
  for (const t of transforms(el.getAttribute('transform')).reverse()) node = { ty: 'gr', nm: 'xf', it: [node, t] };
  return node;
}

function svgShapes(svg: string, anim: Anim = {}): Json[] {
  const doc = new DOMParser().parseFromString(svg.replace(/<!--[\s\S]*?-->/g, ''), 'image/svg+xml');
  const node = convert(doc.documentElement, { fill: '#000', opacity: 1 }, anim);
  return node ? [node] : [];
}

const SOC_ANIM: Anim = {
  lid: el => {
    const e = el.querySelector('ellipse');
    const c = [parseFloat(e?.getAttribute('cx') ?? '0'), parseFloat(e?.getAttribute('cy') ?? '0')];
    const t = tr(c, c);
    t.s = kf([[0, [100, 100]], [112, [100, 100]], [116, [100, 10]], [120, [100, 100]], [138, [100, 100]], [141, [100, 10]], [144, [100, 100]]]);
    return t;
  },
  earL: () => { const t = tr([74, 60], [74, 60]); t.r = kf([[0, 0], [70, 0], [78, -14], [86, 8], [94, 0]]); return t; },
  earR: () => { const t = tr([146, 60], [146, 60]); t.r = kf([[0, 0], [70, 0], [78, 14], [86, -8], [94, 0]]); return t; }
};

/** socSvg: Sóc already wearing the old outfit; itemSvg: the new item's drawing in Sóc's 240×260 space. */
export function buildGiftAnimation(socSvg: string, itemSvg: string): Json {
  IND = 0;
  const L: Json[] = [];
  const shake: Array<[number, number]> = [[0, 0], [8, -7], [16, 7], [24, -7], [32, 6], [40, -3], [46, 0]];
  const cols = ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa', '#ff9a4d'];
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (i - 7.5) * 0.19, d = 150 + (i % 4) * 22, ex = CX + Math.cos(a) * d, ey = 190 + Math.sin(a) * d * 0.9;
    L.push(layer('cf' + i, [grp([rect(0, 0, 10, 5 + (i % 3) * 2, 1.5), fill(cols[i % 6])])], ks({
      p: kf([[54, [CX, 230, 0]], [80, [ex, ey, 0]], [120, [ex + (i % 2 ? 14 : -14), ey + 70, 0]]], [0.2, 1, 0.3, 0]),
      r: kf([[54, 0], [120, i % 2 ? 360 : -360]]), o: kf([[54, 100], [100, 100], [125, 0]])
    }), 54, 130));
  }
  const lid = [grp([ell(CX, 172, 20, 20), fill('#e8a516')]),
    grp([ell(CX + 22, 168, 44, 30), fill('#ffc83d')], 'bowR', tr([CX + 22, 168], [CX + 22, 168], [100, 100], 20)),
    grp([ell(CX - 22, 168, 44, 30), fill('#ffc83d')], 'bowL', tr([CX - 22, 168], [CX - 22, 168], [100, 100], -20)),
    grp([rect(CX, 196, 28, 34), fill('#ffc83d')]), grp([rect(CX, 196, 168, 34, 9), fill('#ff5c86')])];
  L.push(layer('lid', lid, ks({
    p: kf([[0, [CX, BASE, 0]], [46, [CX, BASE, 0]], [52, [CX, BASE + 10, 0]], [70, [CX + 70, BASE - 170, 0]], [90, [CX + 110, BASE - 120, 0]]], [0.3, 1, 0.5, 0]),
    a: [CX, BASE], r: kf([...shake, [52, 0], [90, 50]]), o: kf([[0, 100], [76, 100], [92, 0]])
  }), 0, 95));
  [[-96, 110, 0], [92, 96, 6], [96, 190, 12], [-92, 186, 18]].forEach(([dx, y, d], i) => {
    const star = { ty: 'sr', sy: 1, d: 1, pt: st(4), p: st([0, 0]), r: st(0), ir: st(3), is: st(0), or: st(11), os: st(0) };
    L.push(layer('sp' + i, [grp([star, fill('#ffffff')])], ks({
      p: st([CX + dx, y, 0]),
      s: kf([[100 + d, [0, 0, 100]], [110 + d, [130, 130, 100]], [122 + d, [0, 0, 100]], [134 + d, [100, 100, 100]], [146 + d, [0, 0, 100]]])
    }), 98));
  });
  const SOC = 900, ITEM = 901;
  const item = layer('item', svgShapes(`<svg viewBox="0 0 240 260">${itemSvg}</svg>`), ks({
    p: kf([[84, [0, -280, 0]], [100, [0, 6, 0]], [106, [0, -8, 0]], [112, [0, 0, 0]]], [0.3, 1, 0.5, 0]),
    r: kf([[84, -25], [100, 4], [112, 0]]), o: kf([[83, 0], [84, 100]])
  }), 83);
  item.ind = ITEM; item.parent = SOC;
  L.push(item);
  L.push(layer('box', [grp([rect(CX, 258, 28, 84), fill('#ffc83d')]), grp([rect(CX - 52, 258, 26, 70, 6), fill('#ffffff', 22)]), grp([rect(CX, 258, 150, 84, 12), fill('#ff7a9c')])],
    ks({ p: st([CX, BASE, 0]), a: [CX, BASE], r: kf(shake), s: kf([[0, [100, 100, 100]], [40, [100, 100, 100]], [46, [112, 86, 100]], [54, [96, 106, 100]], [62, [100, 100, 100]]]) })));
  const S = 80;
  const soc = layer('soc', svgShapes(socSvg, SOC_ANIM), ks({
    p: kf([[50, [CX, 262, 0]], [108, [CX, 262, 0]], [112, [CX, 268, 0]], [118, [CX, 258, 0]], [126, [CX, 262, 0]]]),
    a: [120, 250],
    s: kf([[50, [0, 0, 100]], [66, [S * 1.15, S * 1.15, 100]], [76, [S, S, 100]], [100, [S, S, 100]], [104, [S * 1.06, S * 0.92, 100]], [112, [S, S, 100]]], [0.3, 1.4, 0.4, 0]),
    r: kf([[50, -12], [68, 6], [80, 0]])
  }), 50);
  soc.ind = SOC;
  L.push(soc);
  const rays = Array.from({ length: 14 }, (_, j) => {
    const a = j * Math.PI * 2 / 14;
    return grp([{ ty: 'sh', ks: st({ i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]], v: [[0, 0], [Math.cos(a) * 165, Math.sin(a) * 165], [Math.cos(a + 0.12) * 165, Math.sin(a + 0.12) * 165]], c: true }) }, fill('#ffe58f')]);
  });
  L.push(layer('rays', rays, ks({ p: st([CX, 128, 0]), s: kf([[48, [0, 0, 100]], [72, [100, 100, 100]]], [0.3, 1, 0.4, 0]), r: kf([[48, 0], [OP, 70]], [0.5, 0.5, 0.5, 0.5]), o: kf([[48, 0], [66, 45], [OP, 35]]) }), 48));
  L.push(layer('shadow', [grp([ell(CX, 306, 190, 22), fill('#2f3a33', 12)])], ks()));
  return { v: '5.7.4', fr: FR, ip: 0, op: OP, w: W, h: H, nm: 'level-up', ddd: 0, assets: [], layers: L };
}
