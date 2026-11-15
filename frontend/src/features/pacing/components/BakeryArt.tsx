import { useId, type CSSProperties } from 'react';
import { Soc, type SocMood } from '@/shared/ui/soc/Soc';
import type { Dish } from '../lib/bakery';
import { STRAWBERRY_CAP } from '../lib/bakery';

/** Inline-SVG art for the bakery-themed Luyện tập (design/previews/mock-practice-bakery.html). All motion lives in bakery.css. */

const css = (vars: Record<string, string | number>) => vars as CSSProperties;
const BULB_COLORS = ['#ffe08a', '#ffb3c6', '#c8b6ff', '#b6f0c0'];

// ---------- string lights, awning, sign, shelf, counter ----------

/** Swag of bulbs as an SVG group (use inside a scene SVG). */
export function BulbsG({ width, count, y = 0 }: { width: number; count: number; y?: number }) {
  const step = width / count;
  const swag = `M0 ${y}` + Array.from({ length: count }, (_, i) => ` Q${(i + 0.5) * step} ${y + 26} ${(i + 1) * step} ${y}`).join('');
  return (
    <g>
      <path d={swag} fill="none" stroke="#7a5b4a" strokeWidth="2" />
      {Array.from({ length: count }, (_, i) => {
        const x = (i + 0.5) * step, by = y + 19;
        return (
          <g key={i} className="bk-bulb" style={css({ '--d': `${(i * 0.37) % 2.2}s` })}>
            <circle className="bk-bulb-glow" cx={x} cy={by} r="11" fill="#fff3a8" />
            <ellipse cx={x} cy={by} rx="5" ry="7" fill={BULB_COLORS[i % 4]} />
          </g>
        );
      })}
    </g>
  );
}

/** Full-width string of lights for the timer and result screens (fixed 80px spacing, clipped at the edge). */
export function BulbString() {
  const count = 36;
  return (
    <div className="bk-bulbs" aria-hidden="true">
      <svg width={count * 80} height="54" viewBox={`0 0 ${count * 80} 54`}><BulbsG width={count * 80} count={count} y={0} /></svg>
    </div>
  );
}

export function Awning({ width, height }: { width: number; height: number }) {
  const n = Math.round(width / 60), seg = width / n;
  return (
    <g className="bk-sway">
      {Array.from({ length: n }, (_, i) => {
        const fill = i % 2 ? '#fff' : '#ff8fab';
        return (
          <g key={i}>
            <rect x={i * seg} y="0" width={seg} height={height} fill={fill} />
            <path d={`M${i * seg} ${height} Q${(i + 0.5) * seg} ${height + 26} ${(i + 1) * seg} ${height}Z`} fill={fill} />
          </g>
        );
      })}
      <rect x="0" y="0" width={width} height="10" fill="#ff7a9c" />
    </g>
  );
}

function Sign({ cx }: { cx: number }) {
  return (
    <g>
      <line x1={cx - 90} y1="56" x2={cx - 80} y2="96" stroke="#7a5b4a" strokeWidth="3" />
      <line x1={cx + 90} y1="56" x2={cx + 80} y2="96" stroke="#7a5b4a" strokeWidth="3" />
      <rect x={cx - 130} y="94" width="260" height="46" rx="14" fill="#c98b4e" stroke="#9e6634" strokeWidth="3" />
      <text x={cx} y="125" fontWeight="900" fontSize="20" fill="#fff" textAnchor="middle">Tiệm bánh của Sóc</text>
    </g>
  );
}

function Shelf() {
  return (
    <g transform="translate(0 -40)">
      <rect x="34" y="176" width="200" height="10" rx="5" fill="#c98b4e" />
      <rect x="46" y="128" width="40" height="48" rx="10" fill="#fff" stroke="#e6e0f5" strokeWidth="3" />
      <rect x="46" y="128" width="40" height="12" rx="6" fill="#ff9eb8" />
      <text x="66" y="164" fontWeight="900" fontSize="10" fill="#c58aa0" textAnchor="middle">BỘT</text>
      <rect x="96" y="140" width="34" height="36" rx="9" fill="#fff" stroke="#e6e0f5" strokeWidth="3" />
      <rect x="96" y="140" width="34" height="10" rx="5" fill="#a78bfa" />
      <text x="113" y="168" fontWeight="900" fontSize="9" fill="#a593d8" textAnchor="middle">ĐƯỜNG</text>
      <rect x="144" y="160" width="80" height="14" rx="7" fill="#e8ad6c" />
      <rect x="134" y="164" width="12" height="6" rx="3" fill="#c98b4e" />
      <rect x="222" y="164" width="12" height="6" rx="3" fill="#c98b4e" />
    </g>
  );
}

function Counter({ x0, x1 }: { x0: number; x1: number }) {
  return (
    <g>
      <rect x={x0} y="226" width={x1 - x0} height="146" rx="18" fill="#dff3ff" opacity=".55" stroke="#fff" strokeWidth="4" />
      <path d={`M${x0 + 30} 236 L${x0 + 90} 236 L${x0 + 40} 360 L${x0 + 14} 360Z`} fill="#fff" opacity=".45" />
      <rect x={x0 - 6} y="364" width={x1 - x0 + 12} height="86" rx="10" fill="#ff9eb8" />
      <rect x={x0 - 6} y="364" width={x1 - x0 + 12} height="14" rx="7" fill="#fff" />
      {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={x0 + 40 + i * 76} cy="420" r="6" fill="#fff" opacity=".5" />)}
    </g>
  );
}

function Plant({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M-26 450 L-20 396 H20 L26 450Z" fill="#c98b4e" /><rect x="-24" y="390" width="48" height="10" rx="4" fill="#e0a467" />
      <path d="M0 392 C-30 360 -40 320 -14 300 M0 392 C10 350 34 330 40 300 M0 392 C-4 350 4 310 0 280" stroke="#46b35a" strokeWidth="10" fill="none" strokeLinecap="round" />
      <ellipse cx="-14" cy="300" rx="14" ry="9" fill="#5bb46b" /><ellipse cx="40" cy="300" rx="14" ry="9" fill="#5bb46b" /><ellipse cx="0" cy="280" rx="12" ry="9" fill="#7fd18c" />
    </g>
  );
}

function MenuBoard({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 170)`}>
      <rect x="-62" y="0" width="124" height="150" rx="12" fill="#3a463e" stroke="#c98b4e" strokeWidth="6" />
      <text x="0" y="30" textAnchor="middle" fontWeight="900" fontSize="16" fill="#ffe58f">MENU</text>
      {[['Cupcake', "12'"], ['Bánh quy', "8'"], ['Bánh kem', "55'"], ['3 tầng', "75'"]].map(([a, b], i) => (
        <g key={a}><text x="-48" y={58 + i * 24} fontWeight="800" fontSize="12" fill="#fff">{a}</text><text x="48" y={58 + i * 24} fontWeight="900" fontSize="12" fill="#ff9eb8" textAnchor="end">{b}</text></g>
      ))}
      <path d="M-20 150 L-30 280 M20 150 L30 280" stroke="#c98b4e" strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}

/**
 * Everything of the shop scene except the four dishes, the dome and Sóc. The shop itself is drawn at 1068 x 450;
 * `width` may be wider (wide windows) and the shop is then centred with `offset`, the wall, awning and bulbs running
 * the full width and a plant / menu board filling the sides.
 */
export function ShopBackdrop({ width, height, offset = 0 }: { width: number; height: number; offset?: number }) {
  const left = -offset;
  return (
    <svg className="bk-shop-svg" viewBox={`${left} 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <rect x={left} width={width} height={height} fill="#fff4f7" />
      {Array.from({ length: Math.ceil(width / 72) + 1 }, (_, i) => <rect key={i} x={Math.floor(left / 72) * 72 + i * 72} y="0" width="36" height={height} fill="#ffecf2" />)}
      <g transform={`translate(${left} 0)`}>
        <Awning width={width} height={46} />
        <BulbsG width={width} count={Math.max(14, Math.round(14 * width / 1068))} y={66} />
      </g>
      {offset > 0 && <rect x={left} y="384" width={width} height="66" fill="#f6ebe0" opacity=".8" />}
      {offset >= 70 && <Plant x={-offset / 2} />}
      {offset >= 100 && <MenuBoard x={1068 + offset / 2} />}
      <Sign cx={534} />
      <Shelf />
      <ellipse className="bk-halo" cx="955" cy="272" rx="150" ry="140" fill="#ff9a4d" opacity=".2" />
      <Oven x={870} y={150} w={170} h={236} variant="shop" />
      <rect x="860" y="384" width="190" height="66" fill="#efe6dc" />
      <Counter x0={24} x1={800} />
    </svg>
  );
}

// ---------- dishes ----------

function Strawberry({ scale = 1 }: { scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <path d="M0 14 C-12 6 -12 -8 0 -8 C12 -8 12 6 0 14Z" fill="#ff4d6d" />
      <path d="M-6 -8 L0 -14 L6 -8 L0 -6Z" fill="#46b35a" />
      <g fill="#ffe58f"><circle cx="-3" cy="-1" r="1.2" /><circle cx="3" cy="2" r="1.2" /><circle cx="-1" cy="6" r="1.2" /></g>
    </g>
  );
}

export function Cupcake({ x = 0, y = 0, s = 1, color = '#ffd1dc' }: { x?: number; y?: number; s?: number; color?: string }) {
  const chips: Array<[number, number, string]> = [[-16, -12, '#46b35a'], [4, -22, '#1c8fe3'], [18, -8, '#ffc83d'], [-2, -4, '#a78bfa']];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-30 0 L30 0 L22 44 L-22 44Z" fill="#ffc83d" />
      {[-18, -6, 6, 18].map(v => <line key={v} x1={v} y1="2" x2={v * 0.75} y2="42" stroke="#e8a516" strokeWidth="3" />)}
      <path d="M-34 2 Q-40 -26 -12 -30 Q0 -52 14 -30 Q42 -26 34 2Z" fill={color} />
      {chips.map(([a, b, c]) => <rect key={a} x={a} y={b} width="6" height="3" rx="1.5" transform={`rotate(${a * 3} ${a} ${b})`} fill={c} />)}
      <circle cy="-46" r="8" fill="#ff5c7a" />
    </g>
  );
}

export function Cookies({ x = 0, y = 0, s = 1 }: { x?: number; y?: number; s?: number }) {
  const chips: Array<[number, number]> = [[-18, -2], [6, 4], [20, -4], [-4, -6]];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 1, 2].map(k => (
        <g key={k}>
          <ellipse cy={30 - k * 16} rx="42" ry="12" fill="#d39256" />
          <ellipse cy={26 - k * 16} rx="42" ry="12" fill="#e8ad6c" />
          {chips.map(([a, b]) => <circle key={a} cx={a} cy={26 - k * 16 + b} r="3.5" fill="#6b3f1f" />)}
        </g>
      ))}
    </g>
  );
}

const TIERS: Array<[number, number, string, string]> = [[80, 52, '#ffd1dc', '#ff9eb8'], [60, 44, '#fff', '#c8b6ff'], [42, 38, '#ffe9a3', '#ffc83d']];
/** Layer cake, bottom tier sitting on y = 0 of its own group. `cherry` crowns it; strawberries are drawn by BerryCake. */
export function LayerCake({ x = 0, y = 0, s = 1, tiers, cherry = true }: { x?: number; y?: number; s?: number; tiers: 1 | 2 | 3; cherry?: boolean }) {
  let yy = 0;
  const body = TIERS.slice(0, tiers).map(([w, h, c1, c2], k) => {
    const top = yy - h;
    yy -= h;
    const drip = `M${-w} ${top + 10}` + Array.from({ length: 8 }, (_, j) => ` Q${-w + w / 8 * (2 * j + 1)} ${top + 30} ${-w + w / 8 * (2 * j + 2)} ${top + 10}`).join('') + ` V${top} H${-w}Z`;
    return (
      <g key={k}>
        <rect x={-w} y={top} width={w * 2} height={h} rx="10" fill={c1} stroke="#eadff5" strokeWidth="3" />
        <path d={drip} fill={c2} />
      </g>
    );
  });
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {body}
      {cherry && <><circle cy={yy - 10} r="10" fill="#ff5c7a" /><path d={`M0 ${yy - 20} q4 -10 10 -12`} stroke="#46b35a" strokeWidth="3" fill="none" /></>}
    </g>
  );
}

/** A two-tier cake whose strawberries drop on and lift off as the count changes (CSS transitions on the slots). */
export function BerryCake({ count }: { count: number }) {
  const topW = TIERS[1][0], topY = -(TIERS[0][1] + TIERS[1][1]) - 6, span = topW - 12;
  return (
    <g>
      <LayerCake tiers={2} cherry={false} />
      {Array.from({ length: STRAWBERRY_CAP }, (_, i) => {
        const on = i < count;
        const x = count <= 1 ? 0 : -span + i * (2 * span / (Math.max(2, count) - 1));
        return (
          <g key={i} className={'bk-berry' + (on ? ' is-on' : '')} style={{ transform: `translate(${on ? x : x * 0.5}px, ${on ? topY : topY - 40}px)` }}>
            <Strawberry scale={0.72} />
          </g>
        );
      })}
    </g>
  );
}

/** The result cake on its plate; strawberries drop on or lift off as `count` changes. */
export function CakePlate({ count }: { count: number }) {
  return (
    <svg className="bk-card-cake" viewBox="-160 -170 320 190" aria-hidden="true">
      <ellipse cx="0" cy="8" rx="130" ry="16" fill="#e6e0f5" />
      <rect x="-118" y="-6" width="236" height="12" rx="6" fill="#fff" stroke="#e6e0f5" strokeWidth="3" />
      <g transform="translate(0 -6) scale(1.25)"><BerryCake count={count} /></g>
    </svg>
  );
}

export function Steam({ x = 0, y = 0, s = 1, delay = 0 }: { x?: number; y?: number; s?: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="bk-steam" style={css({ '--d': `${delay}s` })} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round">
        <path d="M-10 0 q-8 -12 0 -24 q8 -12 0 -24" />
        <path d="M10 -6 q-8 -12 0 -24 q8 -12 0 -24" />
      </g>
    </g>
  );
}

function DishG({ dish, y = 0 }: { dish: Dish; y?: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      {dish === 'cupcake' && <Cupcake y={-50} s={1.05} />}
      {dish === 'cookies' && <Cookies y={-44} s={1.1} />}
      {dish === 'layer' && <LayerCake y={-4} s={1.05} tiers={2} />}
      {dish === 'tiers' && <LayerCake y={-4} s={0.82} tiers={3} />}
    </g>
  );
}

/** One display-case item in its own coordinates: origin = centre of the plate (viewBox 180 x 242). */
export function ItemArt({ dish, selected }: { dish: Dish; selected: boolean }) {
  return (
    <svg className={'bk-art' + (selected ? ' is-on' : '')} viewBox="-90 -220 180 242" width="180" height="242" aria-hidden="true">
      <ellipse className="bk-plate" cx="0" cy="0" rx="70" ry="12" fill="#fff" stroke="#e6e0f5" strokeWidth="3" />
      <g className="bk-stand">
        <ellipse cx="0" cy="-30" rx="120" ry="70" fill="#fff6c8" opacity=".55" />
        <rect x="-86" y="-32" width="172" height="12" rx="6" fill="#e6e0f5" />
        <rect x="-8" y="-20" width="16" height="18" fill="#e6e0f5" />
        <ellipse cx="0" cy="0" rx="50" ry="9" fill="#e6e0f5" />
      </g>
      <g className="bk-food"><DishG dish={dish} /></g>
      <Steam x={dish === 'tiers' ? 20 : 0} y={dish === 'cupcake' ? -100 : dish === 'cookies' ? -76 : dish === 'layer' ? -130 : -160} s={0.6} delay={dish === 'cookies' ? 0.8 : 0} />
    </svg>
  );
}

/** The glass dome hovering over the chosen item, with sparkles. Coordinates are stage coordinates relative to the item centre. */
export function Dome() {
  const star = (x: number, y: number, k: number) => `M${x} ${y} l${k * 4} ${k * 9} ${k * 9} ${k * 4} ${-k * 9} ${k * 4} ${-k * 4} ${k * 9} ${-k * 4} ${-k * 9} ${-k * 9} ${-k * 4} ${k * 9} ${-k * 4}Z`;
  return (
    <svg viewBox="-130 128 260 160" width="260" height="160" aria-hidden="true">
      <path d="M-92 222 Q-92 150 0 146 Q92 150 92 222Z" fill="#e6f6ff" opacity=".55" stroke="#fff" strokeWidth="4" />
      <circle cx="0" cy="140" r="8" fill="#fff" stroke="#e6e0f5" strokeWidth="3" />
      <path d="M-62 210 Q-60 172 -30 160" stroke="#fff" strokeWidth="5" fill="none" opacity=".8" strokeLinecap="round" />
      <g fill="#ffc83d">
        <path className="bk-spark" style={css({ '--d': '0s' })} d={star(-118, 250, 1)} />
        <path className="bk-spark" style={css({ '--d': '.7s' })} d={star(110, 268, 0.8)} />
        <path className="bk-spark" style={css({ '--d': '1.3s' })} d={star(70, 196, 0.65)} />
      </g>
    </svg>
  );
}

// ---------- oven ----------

interface OvenProps {
  x?: number; y?: number; w: number; h: number;
  variant: 'shop' | 'run' | 'open';
  /** 0..1: how far the cake has risen (run). */
  rise?: number;
  /** 0..1: elapsed share (run): turns the right dial and fills the handle. */
  progress?: number;
  dialLabel?: string;
  /** Small text under the oven window (run). */
  caption?: string;
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const dough = (t: number) => `rgb(${lerp(246, 224, t)} ${lerp(220, 160, t)} ${lerp(174, 90, t)})`;

/** The oven in three poses: shop (window glow), run (cake rising, dials) and open (door dropped for the result). */
export function Oven({ x, y, w, h, variant, rise = 0, progress = 0, dialLabel = '', caption = '' }: OvenProps) {
  const gid = 'bk-ovg-' + useId().replace(/[^a-z0-9]/gi, '');
  const r = w * 0.07, wx = w * 0.1, wy = h * 0.28, ww = w * 0.8, wh = h * 0.5;
  const H = 180;
  return (
    <svg x={x} y={y} width={w + 10} height={h + 14} viewBox={`0 0 ${w + 10} ${h + 14}`} className={'bk-oven bk-oven--' + variant} style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id={gid} cy=".95" r=".9">
          <stop offset="0" stopColor="#ffe08a" stopOpacity=".95" style={{ stopColor: 'var(--bk-g1, #ffe08a)' }} />
          <stop offset=".6" stopColor="#ff9a4d" stopOpacity=".25" style={{ stopColor: 'var(--bk-g2, #ff9a4d)' }} />
          <stop offset="1" stopColor="#ff9a4d" stopOpacity="0" style={{ stopColor: 'var(--bk-g2, #ff9a4d)' }} />
        </radialGradient>
      </defs>
      {variant === 'run' && <>
        <rect x={w / 2 - 40} y="-18" width="80" height="18" rx="6" fill="#cfc4ef" />
        <Steam x={w / 2 - 20} y={-24} s={1.1} />
        <Steam x={w / 2 + 30} y={-34} s={0.9} delay={1.1} />
      </>}
      {variant === 'open' && (
        <path className="bk-light" d={`M${w * 0.1} ${h * 0.72} L${-w * 1.1} ${h * 1.75} L${w * 1.4} ${h * 1.75} L${w * 0.95} ${h * 0.72}Z`} fill="#fff3c4" opacity=".4" />
      )}
      <rect x="8" y="10" width={w} height={h} rx={r} fill="#d9cdf5" />
      <rect width={w} height={h} rx={r} fill="#fff" stroke="#e6e0f5" strokeWidth="5" />
      <path d={`M0 ${h * 0.2} V${r} Q0 0 ${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h * 0.2}Z`} fill="#a78bfa" />
      <rect x={wx} y={wy} width={ww} height={wh} rx={w * 0.04} fill="#3a2418" />
      {variant === 'open' ? <>
        <rect className="bk-flick" x={wx + 10} y={wy + 10} width={ww - 20} height={wh - 20} rx={w * 0.03} fill="#ffb066" />
        <rect x={wx + 10} y={wy + 10} width={ww - 20} height={wh - 20} rx={w * 0.03} fill={`url(#${gid})`} />
        <path className="bk-door-fall" d={`M${wx} ${wy + wh} L${wx - 30} ${wy + wh + 70} L${wx + ww + 30} ${wy + wh + 70} L${wx + ww} ${wy + wh}Z`} fill="#f3eefc" stroke="#e6e0f5" strokeWidth="4" />
        <rect className="bk-door-lift" x={wx} y={wy} width={ww} height={wh} rx={w * 0.04} fill="#fff" stroke="#e6e0f5" strokeWidth="5" opacity=".95" />
      </> : <>
        <rect className="bk-flick" x={wx + 12} y={wy + 12} width={ww - 24} height={wh - 24} rx={w * 0.03} style={{ fill: 'var(--bk-glow, #ff9a4d)' }} opacity=".7" />
        <rect x={wx + 12} y={wy + 12} width={ww - 24} height={wh - 24} rx={w * 0.03} fill={`url(#${gid})`} />
        {[0, 1, 2].map(k => <path key={k} className="bk-wave" style={css({ '--d': `${k * 0.6}s` })} d={`M${wx + ww * 0.22 + k * ww * 0.28} ${wy + wh * 0.28} q-8 12 0 24 q8 12 0 24`} stroke="#fff" strokeWidth="2.5" fill="none" opacity=".3" />)}
        <line x1={wx + 24} y1={wy + wh - 44} x2={wx + ww - 24} y2={wy + wh - 44} stroke="#2b1a10" strokeWidth="5" />
        {variant === 'run' && (
          <g transform={`translate(${wx + ww / 2} ${wy + wh - 46})`}>
            <rect x={-ww * 0.24} y="-26" width={ww * 0.48} height="26" rx="6" fill="#c7cbd1" />
            <rect x={-ww * 0.24} y="-26" width={ww * 0.48} height="8" rx="4" fill="#dfe2e6" />
            <g className="bk-rise" style={{ transform: `scaleY(${0.3 + 0.7 * Math.min(1, Math.max(0, rise))})` }}>
              <g transform="translate(0 -26)">
                <path d={`M${-ww * 0.22} 0 Q${-ww * 0.24} ${-H} 0 ${-H - 12} Q${ww * 0.24} ${-H} ${ww * 0.22} 0Z`} style={{ fill: dough(Math.min(1, Math.max(0, rise))) }} />
                <path d={`M${-ww * 0.15} ${-H * 0.75} Q0 ${-H - 6} ${ww * 0.15} ${-H * 0.75}`} stroke="#e0a35a" strokeWidth="5" fill="none" />
              </g>
            </g>
          </g>
        )}
        <rect x={wx + 20} y={wy + 16} width={ww * 0.35} height="10" rx="5" fill="#fff" opacity=".18" />
      </>}
      {variant === 'run' && <>
        <text x={w / 2} y={wy + wh + 22} fontWeight="900" fontSize="13" fill="#a593d8" textAnchor="middle">{caption}</text>
        <rect x="150" y="26" width="240" height="80" rx="16" fill="#2b2160" />
        {[70, w - 70].map((cx, k) => (
          <g key={k}>
            <circle cx={cx} cy="66" r="32" fill="#fff" />
            <circle cx={cx} cy="66" r="32" fill="none" stroke="#cfc4ef" strokeWidth="4" />
            <g className="bk-hand" style={{ transform: `rotate(${k ? progress * 330 - 33 : 33}deg)` }}>
              <circle cx={cx} cy="66" r="32" fill="none" />
              <line x1={cx} y1="66" x2={cx} y2="40" stroke="#7c5ce0" strokeWidth="7" strokeLinecap="round" />
            </g>
            <text x={cx} y="118" fontWeight="900" fontSize="11" fill="#fff" textAnchor="middle">{k ? dialLabel : '180°'}</text>
          </g>
        ))}
        <rect x={w * 0.18} y={h * 0.83} width={w * 0.64} height={h * 0.04} rx={h * 0.02} fill="#e6dffa" />
        <rect className="bk-track" x={w * 0.18} y={h * 0.83} width={w * 0.64 * Math.min(1, Math.max(0, progress))} height={h * 0.04} rx={h * 0.02} fill="#b7a5f3" />
      </>}
      {variant !== 'run' && <rect x={w * 0.18} y={h * 0.83} width={w * 0.64} height={h * 0.04} rx={h * 0.02} fill="#cfc4ef" />}
      <rect x={w * 0.1} y={h * 0.9} width={w * 0.8} height={h * 0.06} rx="10" fill="#f3eefc" />
      {variant === 'open' && <><Steam x={w * 0.4} y={-6} s={1} /><Steam x={w * 0.72} y={-16} s={0.8} delay={0.9} /></>}
    </svg>
  );
}

// ---------- characters and props ----------

export function ChefHat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 46" aria-hidden="true">
      <rect x="13" y="30" width="34" height="12" rx="3" fill="#fff" stroke="#e6e0f5" strokeWidth="2" />
      <circle cx="18" cy="21" r="11" fill="#fff" stroke="#efeaf8" strokeWidth="1.5" />
      <circle cx="30" cy="14" r="13" fill="#fff" stroke="#efeaf8" strokeWidth="1.5" />
      <circle cx="42" cy="21" r="11" fill="#fff" stroke="#efeaf8" strokeWidth="1.5" />
    </svg>
  );
}

/** Sóc in a chef hat. Never the raised-arm yay; the hat follows the head size. */
export function ChefSoc({ size, mood = 'hi', className }: { size: number; mood?: SocMood; className?: string }) {
  return (
    <span className={'bk-chef' + (className ? ' ' + className : '')} style={css({ width: size, '--s': `${size}px` })}>
      <Soc state={mood} size={size} />
      <ChefHat className="bk-hat" />
    </span>
  );
}

export function Whisk({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-22 -66 44 110" aria-hidden="true">
      <g className="bk-whisk">
        <rect x="-4" y="0" width="8" height="40" rx="4" fill="#a26c43" />
        <path d="M0 0 C-16 -20 -14 -52 0 -60 C14 -52 16 -20 0 0 M0 0 C-7 -22 -6 -50 0 -60 C6 -50 7 -22 0 0" fill="none" stroke="#b9bcc4" strokeWidth="3" />
      </g>
    </svg>
  );
}

/** Tray with a cupcake that Sóc carries out of the oven. */
export function Tray() {
  return (
    <svg viewBox="-80 -60 160 70" aria-hidden="true">
      <rect x="-70" y="-6" width="140" height="10" rx="5" fill="#c7cbd1" />
      <Cupcake y={-12} s={0.6} />
    </svg>
  );
}

/** Small dish icon for the recent-batches list. */
export function DishIcon({ dish }: { dish: Dish }) {
  return (
    <svg className="bk-dish-icon" viewBox="-50 -70 100 100" aria-hidden="true">
      {dish === 'layer' && <LayerCake y={24} s={0.45} tiers={2} />}
      {dish === 'tiers' && <LayerCake y={30} s={0.4} tiers={3} />}
      {dish === 'cupcake' && <Cupcake y={-10} s={0.7} />}
      {dish === 'cookies' && <Cookies y={-8} s={0.7} />}
    </svg>
  );
}
