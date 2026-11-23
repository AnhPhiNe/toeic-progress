/**
 * Island and sea pieces for the "Hành trình điểm › Từng Part" map (approved art: design/previews/journey-v3/parts-build.cjs).
 * Like Scenery.tsx every prop is drawn around (x, y) = the point where it touches the ground, scaled by s.
 * IslandGround is the landmass itself: lagoon, sandy shore with a wet rim and foam, layered grass.
 */
import type { CSSProperties, ReactNode } from 'react';
import { blobPath, seeded } from './geometry';
import './illustrations.css';

interface At { x: number; y: number; s?: number; flip?: 1 | -1 }
const f1 = (n: number) => Math.round(n * 10) / 10;
const T = ({ x, y, s = 1, flip = 1 }: At, children: ReactNode) => <g transform={`translate(${f1(x)} ${f1(y)}) scale(${f1(s * flip * 100) / 100} ${f1(s * 100) / 100})`}>{children}</g>;
const Shadow = ({ rx, dx = 3 }: { rx: number; dx?: number }) => <ellipse cx={dx} cy="1" rx={rx} ry={f1(rx * 0.28)} fill="#3d5a2a" opacity=".16" />;
const leaf = (key: string, dx: number, dy: number, w: number, c: string) => (
  <path key={key} d={`M0 0 Q${f1(dx * 0.45 - dy * w)} ${f1(dy * 0.45 + dx * w)} ${dx} ${dy} Q${f1(dx * 0.55 + dy * w * 0.4)} ${f1(dy * 0.55 - dx * w * 0.4)} 0 0Z`} fill={c} />
);

export function IslandPalm({ sparse, ...at }: At & { sparse?: boolean }) {
  return T(at, <>
    <Shadow rx={15} />
    <path d="M-1 1 C1 -14 5 -30 12 -46" stroke="#8a5a32" strokeWidth="7" fill="none" strokeLinecap="round" />
    <path d="M-1 1 C1 -14 5 -30 12 -46" stroke="#b07a46" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="3 4" />
    <g transform="translate(12 -46)">
      {sparse
        ? [leaf('a', -24, 8, 0.28, '#7fae5a'), leaf('b', 22, 12, 0.28, '#6f9e4e'), leaf('c', 6, -20, 0.3, '#8dbb66')]
        : [leaf('a', -30, 6, 0.3, '#3f9450'), leaf('b', 30, 8, 0.3, '#3f9450'), leaf('c', -22, -16, 0.3, '#57b066'), leaf('d', 22, -18, 0.3, '#57b066'), leaf('e', -8, 24, 0.25, '#3a8a4a'), leaf('f', 14, 22, 0.25, '#46a058'), leaf('g', 2, -26, 0.3, '#6cc479')]}
      <circle cx="-3" cy="4" r="3.6" fill="#7a4e2a" /><circle cx="3" cy="5" r="3.6" fill="#8e5a32" />
    </g>
  </>);
}

/** A palm snapped by the storm: leaning trunk, a split top, one limp frond on the sand. */
export function BrokenPalm(at: At) {
  return T(at, <>
    <Shadow rx={16} />
    <path d="M-1 1 C3 -10 8 -20 15 -27" stroke="#8a5a32" strokeWidth="7" fill="none" strokeLinecap="round" />
    <path d="M-1 1 C3 -10 8 -20 15 -27" stroke="#b07a46" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="3 4" />
    <path d="M10 -29 L14 -20 L18 -31 L21 -24" fill="none" stroke="#6b4426" strokeWidth="2" strokeLinejoin="round" />
    {leaf('a', 22, 20, 0.3, '#8dae5a')}
    <g transform="translate(14 -26) rotate(28)">{leaf('b', 22, 14, 0.3, '#7fa457')}</g>
    <g transform="translate(23 1)"><ellipse rx="7" ry="3" fill="#7a9a4e" transform="rotate(-12)" /><path d="M-6 0 L6 -1" stroke="#5f8040" strokeWidth="1.2" /></g>
  </>);
}

export function RoundTree({ tone = ['#3f9a50', '#56b265', '#86d68f'], ...at }: At & { tone?: [string, string, string] }) {
  return T(at, <>
    <Shadow rx={22} />
    <rect x="-4" y="-22" width="8" height="24" rx="3" fill="#8e5a35" />
    <circle cx="0" cy="-38" r="21" fill={tone[0]} /><circle cx="-9" cy="-42" r="15" fill={tone[1]} /><circle cx="8" cy="-46" r="14" fill={tone[1]} />
    <circle cx="-5" cy="-50" r="8" fill={tone[2]} /><circle cx="10" cy="-50" r="5" fill={tone[2]} opacity=".8" />
  </>);
}

export function Pine(at: At) {
  return T(at, <>
    <Shadow rx={14} />
    <rect x="-3" y="-8" width="6" height="10" fill="#7a4e2d" />
    <path d="M0 -52 L16 -8 H-16Z" fill="#3a8a4a" /><path d="M0 -52 L16 -8 H0Z" fill="#2f7a40" />
    <path d="M0 -60 L11 -30 H-11Z" fill="#4fae5e" /><path d="M0 -60 L11 -30 H0Z" fill="#3f9450" />
  </>);
}

export function Bush({ dry, ...at }: At & { dry?: boolean }) {
  return T(at, <>
    <ellipse cx="0" cy="1" rx="18" ry="4" fill="#3d5a2a" opacity=".16" />
    <ellipse cx="0" cy="-6" rx="17" ry="11" fill={dry ? '#9cbc62' : '#4fae5e'} />
    <ellipse cx="9" cy="-11" rx="10" ry="8" fill={dry ? '#b8d07c' : '#7fd890'} />
    <ellipse cx="-9" cy="-9" rx="8" ry="7" fill={dry ? '#a9c66e' : '#62c06f'} />
  </>);
}

export function Rock(at: At) {
  return T(at, <>
    <ellipse cx="2" cy="1" rx="15" ry="4" fill="#000" opacity=".1" />
    <path d="M-14 0 C-15 -8 -8 -14 -1 -14 C8 -14 14 -8 14 0Z" fill="#a8a097" />
    <path d="M-9 -4 C-9 -10 -4 -12 1 -12 C4 -12 2 -8 -2 -6Z" fill="#cfc7bc" />
    <path d="M14 0 C14 -6 11 -10 7 -12 C9 -6 8 -2 4 0Z" fill="#8c847b" />
  </>);
}

export function Tuft({ c = '#3f9450', ...at }: At & { c?: string }) {
  return T(at, <path d="M-5 0 q1 -6 -1 -10 M0 0 q0 -8 2 -13 M5 0 q-1 -6 2 -9" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />);
}

/** A scatter of little flowers; seed keeps them where they were. */
export function Flowers({ x, y, s = 1, seed, n = 6, w = 30 }: At & { seed: number; n?: number; w?: number }) {
  const r = seeded(seed);
  const cols = ['#ff8fb0', '#ffffff', '#ffc83d', '#c9b4ff'];
  return <g>{Array.from({ length: n }, (_, i) => <circle key={i} cx={f1(x + (r() - 0.5) * w * s)} cy={f1(y + (r() - 0.5) * w * 0.4 * s)} r={f1(2.2 * s)} fill={cols[i % 4]} />)}</g>;
}

export function Hut({ roof = '#e39a4c', ...at }: At & { roof?: string }) {
  return T(at, <>
    <Shadow rx={24} dx={2} />
    <path d="M-16 0 V-8 M16 0 V-8 M-6 0 V-8 M6 0 V-8" stroke="#7a4e2d" strokeWidth="3" />
    <rect x="-20" y="-30" width="40" height="23" rx="2" fill="#f0c98c" />
    <path d="M-20 -24 H20 M-20 -17 H20 M-20 -11 H20" stroke="#d8ab6c" strokeWidth="1.4" />
    <rect x="-5" y="-22" width="10" height="15" rx="2" fill="#8a5a32" /><rect x="9" y="-25" width="7" height="6" rx="1" fill="#7cc6ef" />
    <path d="M-27 -27 L0 -50 L27 -27 Q0 -31 -27 -27Z" fill={roof} /><path d="M0 -50 L27 -27 Q12 -29 4 -30Z" fill="#000" opacity=".12" />
    <path d="M-18 -31 L-6 -42 M-8 -30 L2 -45 M4 -30 L10 -44 M14 -30 L18 -36" stroke="#fff" strokeWidth="1.3" opacity=".35" />
  </>);
}

export function Lighthouse(at: At) {
  return T(at, <>
    <Shadow rx={20} dx={4} />
    <path d="M-13 0 L-9 -58 H9 L13 0Z" fill="#fff" />
    <path d="M-12.2 -12 L-11.4 -24 H11.4 L12.2 -12Z M-10.6 -36 L-9.8 -48 H9.8 L10.6 -36Z" fill="#ff7a9c" />
    <path d="M13 0 L9 -58 H3 L5 0Z" fill="#000" opacity=".08" /><rect x="-4" y="-12" width="8" height="12" rx="3" fill="#8a5a32" />
    <rect x="-12" y="-62" width="24" height="5" rx="2" fill="#5c675f" /><rect x="-7" y="-75" width="14" height="13" rx="2" fill="#ffe28a" />
    <circle cx="0" cy="-69" r="11" fill="#fff6c9" opacity=".55" />
    <path d="M-10 -75 L0 -86 L10 -75Z" fill="#e5527a" /><circle cx="0" cy="-87" r="2" fill="#5c675f" />
  </>);
}

export function Stump(at: At) {
  return T(at, <>
    <Shadow rx={10} />
    <path d="M-5 1 L-4 -14 L-1 -11 L1 -17 L4 -12 L5 1Z" fill="#8a5a32" />
    <path d="M-4 -14 L-1 -11 L1 -17 L4 -12" fill="none" stroke="#6b4426" strokeWidth="1.5" />
  </>);
}

export function Crate(at: At) {
  return T(at, <>
    <ellipse cx="2" cy="1" rx="11" ry="3" fill="#000" opacity=".1" />
    <rect x="-9" y="-14" width="18" height="14" rx="2" fill="#c58a52" />
    <path d="M-9 -14 L9 0 M9 -14 L-9 0" stroke="#9a6638" strokeWidth="2" />
  </>);
}

/** Wooden pier from (x, y) heading (dx, dy) into the water, w wide. */
export function Pier({ x, y, dx, dy, w }: { x: number; y: number; dx: number; dy: number; w: number }) {
  const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy * w / 2, ny = ux * w / 2;
  const boards: ReactNode[] = [];
  for (let t = 4; t < L; t += 6) boards.push(<path key={t} d={`M${f1(x + ux * t + nx)} ${f1(y + uy * t + ny)} L${f1(x + ux * t - nx)} ${f1(y + uy * t - ny)}`} stroke="#a87445" strokeWidth="1.3" />);
  const posts: ReactNode[] = [];
  for (const t of [L * 0.45, L - 2]) for (const sgn of [1, -1]) posts.push(<rect key={`${t}${sgn}`} x={f1(x + ux * t + nx * sgn * 1.05 - 1.6)} y={f1(y + uy * t + ny * sgn * 1.05)} width="3.2" height={f1(w * 0.55)} rx="1" fill="#7a4e2d" />);
  return (
    <g>
      <path d={`M${f1(x + nx)} ${f1(y + ny)} L${f1(x + dx + nx)} ${f1(y + dy + ny)} L${f1(x + dx - nx)} ${f1(y + dy - ny)} L${f1(x - nx)} ${f1(y - ny)}Z`} fill="#c9965e" />
      {boards}{posts}
    </g>
  );
}

/** Top-down cloud with its shadow on the water; drifts a little after load. */
export function SkyCloud({ className = 'il-drift', ...at }: At & { className?: string }) {
  return (
    <g className={className}>{T(at, <>
      <g transform="translate(40 64)" fill="#14608f" opacity=".07"><ellipse rx="58" ry="17" /><ellipse cx="-18" cy="-10" rx="26" ry="16" /><ellipse cx="14" cy="-15" rx="29" ry="20" /></g>
      <ellipse cx="0" cy="0" rx="58" ry="17" fill="#fff" opacity=".95" /><ellipse cx="-18" cy="-10" rx="26" ry="16" fill="#fff" />
      <ellipse cx="14" cy="-15" rx="29" ry="20" fill="#fff" /><ellipse cx="2" cy="6" rx="48" ry="8" fill="#e3f1fa" />
    </>)}</g>
  );
}

/** Grey rain cloud over a weak island; heavy = darker with more rain. */
export function StormCloud({ heavy, ...at }: At & { heavy?: boolean }) {
  const c = heavy ? ['#7d8aa3', '#95a2b8', '#b0bccd'] : ['#a3aec0', '#b8c2d1', '#ced6e2'];
  const n = heavy ? 7 : 4;
  return (
    <g className={heavy ? 'il-drift' : 'il-drift2'}>{T(at, <>
      <g className="il-rain">
        {Array.from({ length: n }, (_, i) => <path key={i} d={`M${f1(-34 + i * (68 / (n - 1)))} ${14 + (i % 2) * 4} l-5 ${heavy ? 16 : 11}`} stroke="#7fa6cf" strokeWidth="2.4" strokeLinecap="round" opacity=".8" />)}
      </g>
      <ellipse cx="0" cy="4" rx="44" ry="13" fill={c[0]} /><ellipse cx="-16" cy="-6" rx="20" ry="14" fill={c[1]} /><ellipse cx="12" cy="-11" rx="24" ry="18" fill={c[1]} />
      <ellipse cx="8" cy="-16" rx="14" ry="9" fill={c[2]} /><ellipse cx="-20" cy="-10" rx="9" ry="6" fill={c[2]} />
    </>)}</g>
  );
}

export function Sailboat(at: At) {
  return (
    <g className="il-bob2">{T(at, <>
      <path d="M-30 6 q15 5 30 0 q15 -5 30 0" stroke="#fff" strokeWidth="2" fill="none" opacity=".7" />
      <path d="M-22 -4 H22 L15 6 H-15Z" fill="#fff" /><path d="M-22 -4 H22" stroke="#e5527a" strokeWidth="2.4" />
      <path d="M0 -6 V-44 L22 -10Z" fill="#ffc83d" /><path d="M-2 -10 V-36 L-18 -10Z" fill="#fff" /><path d="M0 -6 V-44" stroke="#8a5a32" strokeWidth="2" />
    </>)}</g>
  );
}

export function FishJump(at: At) {
  return T(at, <>
    <path d="M-26 6 C-18 -26 10 -30 22 4" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" opacity=".8" />
    <g transform="translate(6 -20) rotate(28)">
      <ellipse rx="9" ry="4.6" fill="#ff9f5a" /><path d="M-8 0 L-15 -5 L-14 5Z" fill="#ff9f5a" /><circle cx="5" cy="-1" r="1.2" fill="#3a2a1f" /><path d="M-2 -4 q3 -4 6 0" fill="#ffc28a" />
    </g>
    <path d="M14 6 q4 -6 8 0 M24 6 q3 -4 6 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
    <ellipse cx="22" cy="8" rx="11" ry="3" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".6" />
  </>);
}

export function Gull({ x, y, s = 1 }: At) {
  return <path d={`M${x} ${y} q${6 * s} ${-6 * s} ${12 * s} 0 q${6 * s} ${-6 * s} ${12 * s} 0`} fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />;
}

export function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  return <path className="il-tw" style={{ '--dl': `${f1((x * 7 % 13) / 10)}s`, transformOrigin: `${f1(x)}px ${f1(y)}px` } as CSSProperties}
    d={`M${x} ${y - r} L${x + r * 0.25} ${y - r * 0.25} L${x + r} ${y} L${x + r * 0.25} ${y + r * 0.25} L${x} ${y + r} L${x - r * 0.25} ${y + r * 0.25} L${x - r} ${y} L${x - r * 0.25} ${y - r * 0.25}Z`} fill="#fffbe6" />;
}

/** Short choppy strokes of rough water around an island. */
export function Chop({ x, y, r, k = 1 }: { x: number; y: number; r: number; k?: number }) {
  return (
    <g className="il-chop" fill="none" stroke="#eef8ff" strokeWidth={f1(2.2 * k)} strokeLinejoin="round" strokeLinecap="round" opacity=".85">
      {[[-1.45, 0.1], [-1.25, 0.55], [1.4, 0.2], [1.2, 0.62], [-0.6, 0.85], [0.55, 0.9], [0, -0.45], [-1.05, -0.32], [1.0, -0.3]].map(([a, b], i) => {
        const px = x + a * r, py = y + b * r, s = (0.9 + (i % 3) * 0.15) * k;
        return <path key={i} d={`M${f1(px - 10 * s)} ${f1(py + 3 * s)} l${f1(5 * s)} ${f1(-6 * s)} l${f1(5 * s)} ${f1(6 * s)} l${f1(5 * s)} ${f1(-6 * s)} l${f1(5 * s)} ${f1(6 * s)}`} />;
      })}
    </g>
  );
}

export type GroundTone = 'hi' | 'mid' | 'lo';
const GRASS: Record<GroundTone, { side: string; top: string; hl: string; cov: number }> = {
  hi: { side: '#3f9450', top: '#6cc479', hl: '#94dc9c', cov: 0.9 },
  mid: { side: '#5c9e4a', top: '#93cc6e', hl: '#b4de8e', cov: 0.78 },
  lo: { side: '#93a75a', top: '#bcd085', hl: '#d3e3a2', cov: 0.5 }
};

export interface GroundProps {
  x: number; y: number; r: number;
  tone: GroundTone;
  seed: number;
  /** Stroke scale (1 on desktop, smaller on a phone). */
  k?: number;
  /** Grass offset in units of r. */
  gdx?: number; gdy?: number;
  /** A second grass tier: [dx, dy, size] in units of r. */
  hill?: readonly [number, number, number];
}

/** Lagoon, sand with wet rim and foam, grass tiers. Props go on top (draw them after this, back to front). */
export function IslandGround({ x, y, r, tone, seed, k = 1, gdx = 0, gdy = 0, hill }: GroundProps) {
  const g = GRASS[tone], ry = r * 0.5;
  const gx = x + gdx * r, gy = y - r * 0.06 + gdy * r, cw = r * g.cov;
  return (
    <g>
      <path d={blobPath(x, y + r * 0.2, r * 1.55, r * 0.86, seed, 0.06)} fill="#e8fbff" opacity=".42" />
      <path d={blobPath(x, y + r * 0.18, r * 1.36, r * 0.72, seed, 0.07)} fill="#8fe0e4" opacity=".75" />
      <path d={blobPath(x, y + r * 0.18, r * 1.36, r * 0.72, seed, 0.07)} fill="none" stroke="#fff" strokeWidth={f1(2 * k)} strokeDasharray={`${f1(10 * k)} ${f1(14 * k)}`} opacity=".7" />
      <path d={blobPath(x, y + r * 0.26, r * 1.17, ry * 1.08, seed + 1)} fill="#7fc9d6" opacity=".7" />
      <path d={blobPath(x, y + r * 0.22, r * 1.15, ry * 1.06, seed + 1)} fill="#cf9c62" />
      <path d={blobPath(x, y + r * 0.12, r * 1.13, ry * 1.04, seed + 1)} fill="#e4b77c" />
      <path d={blobPath(x, y + r * 0.24, r * 1.19, ry * 1.1, seed + 1)} fill="none" stroke="#fff" strokeWidth={f1(2.6 * k)} strokeLinecap="round" strokeDasharray={`${f1(16 * k)} ${f1(7 * k)} ${f1(4 * k)} ${f1(7 * k)}`} opacity=".95" />
      <path d={blobPath(x, y, r * 1.1, ry, seed + 1)} fill="#f7dfae" />
      <path d={blobPath(x - r * 0.12, y - r * 0.06, r * 0.78, ry * 0.62, seed + 3)} fill="#fcecc6" opacity=".8" />
      <path d={blobPath(gx, gy + r * 0.13, cw * 1.02, cw * 0.46, seed + 5, 0.1)} fill={g.side} />
      <path d={blobPath(gx, gy, cw, cw * 0.44, seed + 5, 0.1)} fill={g.top} />
      {hill && (() => {
        const hx = gx + hill[0] * r, hy = gy + hill[1] * r, hw = cw * hill[2];
        return <>
          <path d={blobPath(hx, hy + r * 0.1, hw * 1.03, hw * 0.48, seed + 7, 0.12)} fill={g.side} />
          <path d={blobPath(hx, hy, hw, hw * 0.46, seed + 7, 0.12)} fill={g.top} />
          <path d={blobPath(hx - hw * 0.2, hy - hw * 0.12, hw * 0.5, hw * 0.2, seed + 8)} fill={g.hl} opacity=".85" />
        </>;
      })()}
      <path d={blobPath(gx - cw * 0.25, gy - cw * 0.1, cw * 0.5, cw * 0.17, seed + 6)} fill={g.hl} opacity=".8" />
    </g>
  );
}
