/**
 * Storybook scenery shared by Hôm nay (the road) and Hành trình (the mountain): small SVG pieces drawn in their own
 * units around (x, y) = the point where they touch the ground, scaled by s. Approved art:
 * design/previews/journey-v2/_todayb2.cjs and design/previews/journey-v3/_build.cjs.
 * Ambient motion classes (il-drift, il-float, il-blades, il-wave …) live in illustrations.css and run only briefly.
 */
import type { CSSProperties, ReactNode } from 'react';
import { seeded } from './geometry';
import './illustrations.css';

interface At { x: number; y: number; s?: number; className?: string }
const tr = (x: number, y: number, s = 1) => `translate(${x} ${y}) scale(${s})`;

export function Cloud({ x, y, s = 1, className = 'il-drift', shadow }: At & { shadow?: boolean }) {
  return (
    <g className={className}><g transform={tr(x, y, s)}>
      {shadow && <ellipse cx="2" cy="4" rx="60" ry="13" fill="#f1dccb" opacity=".5" />}
      <ellipse cx="0" cy="0" rx="58" ry="14" fill="#fff" /><ellipse cx="-16" cy="-9" rx="24" ry="15" fill="#fff" /><ellipse cx="14" cy="-14" rx="28" ry="19" fill="#fff" />
    </g></g>
  );
}

export function Balloon({ x, y, s = 1, className = 'il-float' }: At) {
  return (
    <g className={className}><g transform={tr(x, y, s)}>
      <path d="M0 -60 C34 -60 40 -22 22 0 L10 12 H-10 L-22 0 C-40 -22 -34 -60 0 -60Z" fill="#ff7a9c" />
      <path d="M0 -60 C12 -60 14 -22 7 0 L4 12 H-4 L-7 0 C-14 -22 -12 -60 0 -60Z" fill="#ffc83d" />
      <path d="M-8 12 L-6 26 H6 L8 12" fill="none" stroke="#8e5a35" strokeWidth="1.5" />
      <rect x="-8" y="24" width="16" height="12" rx="3" fill="#a8723f" />
    </g></g>
  );
}

export function House({ x, y, s = 1, roof, wall = '#fff7ea' }: At & { roof: string; wall?: string }) {
  return (
    <g transform={tr(x, y, s)}>
      <ellipse cx="0" cy="2" rx="30" ry="5" fill="#000" opacity=".08" />
      <rect x="-22" y="-28" width="44" height="30" rx="3" fill={wall} />
      <path d="M-28 -26 L0 -48 L28 -26Z" fill={roof} />
      <rect x="-6" y="-16" width="12" height="18" rx="2" fill="#a8723f" /><rect x="10" y="-20" width="8" height="8" rx="1.5" fill="#9fd6f5" />
    </g>
  );
}

export function Windmill({ x, y, s = 1 }: At) {
  return (
    <g transform={tr(x, y, s)}>
      <path d="M-14 0 L-9 -62 H9 L14 0Z" fill="#fff3e3" /><path d="M-10 -62 L0 -76 L10 -62Z" fill="#ff9ab4" />
      <rect x="-5" y="-14" width="10" height="14" rx="2" fill="#a8723f" />
      <g className="il-blades" style={{ transformOrigin: '0px -64px' }}>
        {[0, 90, 180, 270].map(a => (
          <g key={a} transform={`translate(0 -64) rotate(${a})`}>
            <rect x="-2" y="-46" width="4" height="44" fill="#a8723f" /><path d="M2 -46 H14 L12 -12 H2Z" fill="#fff" stroke="#e6d5bd" strokeWidth="1.2" />
          </g>
        ))}
        <circle cx="0" cy="-64" r="5" fill="#8e5a35" />
      </g>
    </g>
  );
}

/** Lollipop tree of the road map. */
export function Tree({ x, y, s = 1, color = '#4fb35f' }: At & { color?: string }) {
  return <g transform={tr(x, y, s)}><rect x="-4" y="-24" width="8" height="26" rx="3" fill="#8e5a35" /><circle cx="0" cy="-40" r="22" fill={color} /><circle cx="10" cy="-49" r="12" fill="#7fd890" /></g>;
}

/** Round, layered tree of the mountain meadow. */
export function RoundTree({ x, y, s = 1 }: At) {
  return (
    <g transform={tr(x, y, s)}>
      <ellipse cx="2" cy="2" rx="24" ry="5" fill="#2f6b3a" opacity=".15" /><rect x="-4" y="-26" width="8" height="28" rx="3" fill="#8e5a35" />
      <circle cx="0" cy="-44" r="24" fill="#4fae5e" /><circle cx="-10" cy="-36" r="14" fill="#43a052" /><circle cx="9" cy="-54" r="13" fill="#7fd890" />
    </g>
  );
}

/** Small two-tier pine of the road map. */
export function Pine({ x, y, s = 1 }: At) {
  return <g transform={tr(x, y, s)}><rect x="-3" y="-6" width="6" height="8" fill="#7a4e2d" /><path d="M0 -44 L15 -6 H-15Z" fill="#3f9a50" /><path d="M0 -54 L11 -26 H-11Z" fill="#4fb35f" /></g>;
}

/** Tall, shaded pine of the mountain. */
export function TallPine({ x, y, s = 1, light = '#46a35a', dark = '#33824a' }: At & { light?: string; dark?: string }) {
  return (
    <g transform={tr(x, y, s)}>
      <rect x="-2.5" y="-6" width="5" height="9" rx="1" fill="#7a4e2d" />
      <path d="M0 -50 L13 -26 H7 L18 -6 H-18 L-7 -26 H-13Z" fill={light} /><path d="M0 -50 L13 -26 H7 L18 -6 H0Z" fill={dark} />
    </g>
  );
}

export function Bush({ x, y, s = 1 }: At) {
  return <g transform={tr(x, y, s)}><ellipse cx="0" cy="0" rx="24" ry="14" fill="#5cbf6b" /><ellipse cx="13" cy="-6" rx="13" ry="10" fill="#7fd890" /><ellipse cx="-12" cy="-4" rx="10" ry="8" fill="#6ccb79" /></g>;
}

/** A scatter of flower dots (road map). */
export function FlowerDots({ x, y, n, spread, seed = 1 }: { x: number; y: number; n: number; spread: number; seed?: number }) {
  const rnd = seeded(seed);
  const cols = ['#ff8fb0', '#ffc83d', '#fff', '#a78bfa', '#ff9a3d'];
  const dots: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = x + (rnd() - .5) * spread, b = y + (rnd() - .5) * spread * .4, r = 2.4 + rnd() * 1.6;
    dots.push(<circle key={i} cx={a.toFixed(1)} cy={b.toFixed(1)} r={r.toFixed(1)} fill={cols[Math.floor(rnd() * cols.length)]} />);
  }
  return <g>{dots}</g>;
}

function Flower({ x, y, c, s = 1 }: { x: number; y: number; c: string; s?: number }) {
  return (
    <g transform={tr(x, y, s)}>
      <path d="M0 0 V9" stroke="#4e9e57" strokeWidth="1.6" />
      {[0, 72, 144, 216, 288].map(a => <circle key={a} cx={(3.6 * Math.cos(a * Math.PI / 180)).toFixed(1)} cy={(3.6 * Math.sin(a * Math.PI / 180)).toFixed(1)} r="2.7" fill={c} />)}
      <circle r="1.9" fill="#fff3b0" />
    </g>
  );
}

/** Little five-petal flowers and dots across a meadow patch (mountain). */
export function MeadowFlowers({ x, y, n, wx, wy, seed, s = 1 }: { x: number; y: number; n: number; wx: number; wy: number; seed: number; s?: number }) {
  const rnd = seeded(seed);
  const cols = ['#ff8fb0', '#ffc83d', '#ffffff', '#c9b4ff', '#ffadc4', '#ffb36b'];
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = x + (rnd() - .5) * wx, b = y + (rnd() - .5) * wy;
    if (rnd() < .55) out.push(<Flower key={i} x={+a.toFixed(1)} y={+b.toFixed(1)} c={cols[Math.floor(rnd() * cols.length)]} s={s * (.75 + rnd() * .4)} />);
    else out.push(<circle key={i} cx={a.toFixed(1)} cy={b.toFixed(1)} r={(s * (1.6 + rnd() * 1.4)).toFixed(1)} fill={cols[Math.floor(rnd() * cols.length)]} />);
  }
  return <g>{out}</g>;
}

/** Grass tufts. */
export function Tufts({ x, y, n, wx, seed, color = '#4a9e58', s = 1 }: { x: number; y: number; n: number; wx: number; seed: number; color?: string; s?: number }) {
  const rnd = seeded(seed);
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = x + (rnd() - .5) * wx, b = y + (rnd() - .5) * 10;
    d += `M${(a - 4 * s).toFixed(1)} ${b.toFixed(1)} q${2 * s} ${-6 * s} ${2 * s} ${-9 * s} M${a.toFixed(1)} ${b.toFixed(1)} q0 ${-7 * s} ${s} ${-11 * s} M${(a + 4 * s).toFixed(1)} ${b.toFixed(1)} q${-s} ${-6 * s} ${s} ${-8 * s} `;
  }
  return <path d={d} fill="none" stroke={color} strokeWidth={1.6 * s} strokeLinecap="round" />;
}

export function Rock({ x, y, s = 1, dark }: At & { dark?: boolean }) {
  const [c, hi, sh] = dark ? ['#6d80ad', '#8093be', '#5a6b96'] : ['#8a9bc2', '#b3c2e0', '#6c7ea8'];
  return (
    <g transform={tr(x, y, s)}>
      <path d="M-24 6 L-17 -6 L-8 -15 L3 -19 L13 -12 L21 -3 L25 6Z" fill={c} /><path d="M-17 -6 L-8 -15 L3 -19 L1 -9 L-9 -2Z" fill={hi} />
      <path d="M3 -19 L13 -12 L21 -3 L25 6 L10 6 L1 -9Z" fill={sh} /><path d="M-24 6 H25" stroke={sh} strokeWidth="2" opacity=".5" />
    </g>
  );
}

/** A ploughed field seen from above at a slant. */
export function Field({ x, y, w, h, skew, color, line }: { x: number; y: number; w: number; h: number; skew: number; color: string; line: string }) {
  const rows = [1, 2, 3].map(i => i / 4);
  return (
    <g>
      <path d={`M${x} ${y} L${x + w} ${y - skew} L${x + w + 6} ${y - skew + h} L${x + 6} ${y + h}Z`} fill={color} stroke={color} strokeWidth="6" strokeLinejoin="round" opacity=".75" />
      {rows.map(t => <path key={t} d={`M${(x + 6 * t).toFixed(1)} ${(y + h * t).toFixed(1)} L${(x + w + 6 * t).toFixed(1)} ${(y - skew + h * t).toFixed(1)}`} stroke={line} strokeWidth="1.4" opacity=".45" />)}
    </g>
  );
}

export function Hedge({ x, y, w, s = 1 }: { x: number; y: number; w: number; s?: number }) {
  return <path d={`M${x} ${y} q${w / 2} ${-3 * s} ${w} ${-w * .02}`} fill="none" stroke="#7fc686" strokeWidth={7 * s} strokeLinecap="round" opacity=".8" />;
}

export function Birds({ x, y, s = 1 }: At) {
  return (
    <g transform={tr(x, y, s)} fill="none" stroke="#8b8fa3" strokeWidth="2" strokeLinecap="round">
      <path d="M0 0 q6 -6 12 0 q6 -6 12 0" /><path d="M34 -14 q4 -4 8 0 q4 -4 8 0" /><path d="M16 -26 q3.5 -3.5 7 0 q3.5 -3.5 7 0" />
    </g>
  );
}

/** Plain sun with a soft halo (road) or with rays (mountain). The halo gradient id must be defined by the caller. */
export function Sun({ x, y, r, rays, glowId }: { x: number; y: number; r: number; rays?: boolean; glowId?: string }) {
  if (!rays) return <g transform={`translate(${x} ${y})`}><circle r={r * 1.7} fill="#ffe7a3" opacity=".35" /><circle r={r} fill="#ffd766" /></g>;
  const ray: ReactNode[] = [];
  for (let i = 0; i < 14; i++) {
    const a = i * Math.PI * 2 / 14, a1 = a - .07, a2 = a + .07, r1 = r * 1.25, r2 = r * (i % 2 ? 1.55 : 1.8);
    ray.push(<path key={i} d={`M${(Math.cos(a1) * r1).toFixed(1)} ${(Math.sin(a1) * r1).toFixed(1)} L${(Math.cos(a) * r2).toFixed(1)} ${(Math.sin(a) * r2).toFixed(1)} L${(Math.cos(a2) * r1).toFixed(1)} ${(Math.sin(a2) * r1).toFixed(1)}Z`} />);
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      {glowId && <circle r={r * 2.4} fill={`url(#${glowId})`} />}
      <g className="il-rays" fill="#ffe08f" opacity=".28" stroke="#ffe08f" strokeWidth="6" strokeLinejoin="round">{ray}</g>
      <circle r={r} fill="#ffd766" /><circle r={r * .78} fill="#ffe28a" />
    </g>
  );
}

/** Four-point twinkle star. */
export function Twinkle({ x, y, r, delay = 0 }: { x: number; y: number; r: number; delay?: number }) {
  return <path className="il-tw" style={{ '--dl': `${delay}s`, transformOrigin: `${x}px ${y}px` } as CSSProperties}
    d={`M${x} ${y - r} L${x + r * .28} ${y - r * .28} L${x + r} ${y} L${x + r * .28} ${y + r * .28} L${x} ${y + r} L${x - r * .28} ${y + r * .28} L${x - r} ${y} L${x - r * .28} ${y - r * .28}Z`} fill="#fff6c9" />;
}
