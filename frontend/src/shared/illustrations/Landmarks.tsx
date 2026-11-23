/**
 * Landmarks of the illustrated scenes: the trophy on its podium, the flower arch ("Đích"), the wooden bridge, the road
 * coins and stones, the small summit trophy. Art: design/previews/journey-v2/_todayb2.cjs, _today.cjs, journey-v3/_build.cjs.
 */
import { useMemo } from 'react';
import { socMoodSvg, type SocMood } from '@/shared/ui/soc/socSvg';
import { useSocCoat } from '@/shared/ui/soc/Soc';
import '@/shared/ui/soc/soc.css';

/** Big gold cup with the label plate under it; (0, 0) is the bottom of the plate. `id` prefixes its gradients. */
export function Trophy({ id, label }: { id: string; label: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${id}cup`} x1="0" x2="1"><stop offset="0" stopColor="#ffe9a3" /><stop offset=".45" stopColor="#ffc83d" /><stop offset="1" stopColor="#e09a12" /></linearGradient>
        <clipPath id={`${id}cupclip`}><path d="M-46 -60 H46 C46 -10 24 22 0 24 C-24 22 -46 -10 -46 -60Z" /></clipPath>
      </defs>
      <ellipse cx="0" cy="6" rx="70" ry="12" fill="#e0a400" opacity=".18" />
      <path d="M-36 -128 C-74 -128 -74 -80 -34 -74" fill="none" stroke="#e09a12" strokeWidth="11" strokeLinecap="round" />
      <path d="M36 -128 C74 -128 74 -80 34 -74" fill="none" stroke="#e09a12" strokeWidth="11" strokeLinecap="round" />
      <g transform="translate(0 -88)">
        <path d="M-46 -60 H46 C46 -10 24 22 0 24 C-24 22 -46 -10 -46 -60Z" fill={`url(#${id}cup)`} />
        <ellipse cx="0" cy="-60" rx="46" ry="9" fill="#ffe9a3" />
        <path d="M0 -36 l6 12 13 2 -9.5 9 2.3 13 -11.8 -6.3 -11.8 6.3 2.3 -13 -9.5 -9 13 -2z" fill="#fff" opacity=".9" />
        <g clipPath={`url(#${id}cupclip)`}><rect className="il-glint" x="-80" y="-70" width="22" height="110" fill="#fff" opacity=".55" transform="skewX(-18)" /></g>
      </g>
      <rect x="-10" y="-66" width="20" height="22" fill="#e09a12" /><rect x="-34" y="-46" width="68" height="12" rx="4" fill="#d99a00" />
      <rect x="-50" y="-36" width="100" height="36" rx="9" fill="#3a3f3b" />
      <text x="0" y="-10" textAnchor="middle" fontWeight="900" fontSize="22" fill="#ffd766">{label}</text>
    </g>
  );
}

/** Two-step gold podium with the trophy on top; (x, y) is the podium's foot, s its scale. */
export function Podium({ id, x, y, s, label }: { id: string; x: number; y: number; s: number; label: string }) {
  return (
    <g>
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <ellipse cx="0" cy="6" rx="66" ry="12" fill="#000" opacity=".1" />
        <rect x="-56" y="-22" width="112" height="26" rx="6" fill="#e09a12" /><rect x="-56" y="-26" width="112" height="10" rx="5" fill="#ffd766" />
        <rect x="-38" y="-46" width="76" height="24" rx="6" fill="#f0b02a" /><rect x="-38" y="-50" width="76" height="9" rx="4.5" fill="#ffe08a" />
        <path d="M-50 -6 H50" stroke="#fff" strokeOpacity=".35" strokeWidth="2" />
      </g>
      <g transform={`translate(${x} ${y - 48 * s}) scale(${s * .8})`}><Trophy id={id} label={label} /></g>
    </g>
  );
}

/** Flower arch over the road with the "Đích" ribbon; (x, y) is between its feet, s its scale. */
export function FlowerArch({ x, y, s, font }: { x: number; y: number; s: number; font: number }) {
  const cols = ['#ff8fb0', '#ffd766', '#fff', '#ffadc4'];
  const fl = (fx: number, fy: number, i: number) => (
    <g key={`${i}-${fx.toFixed(0)}-${fy.toFixed(0)}`}>
      <circle cx={fx.toFixed(1)} cy={fy.toFixed(1)} r={6.5 * s} fill={cols[i % 4]} />
      <circle cx={fx.toFixed(1)} cy={fy.toFixed(1)} r={2.2 * s} fill={i % 4 === 1 ? '#ff9a3d' : '#ffd766'} />
    </g>
  );
  const arc = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, u = 1 - t;
    arc.push(fl(u * u * (x - 52 * s) + 2 * u * t * x + t * t * (x + 52 * s), u * u * (y - 88 * s) + 2 * u * t * (y - 150 * s) + t * t * (y - 88 * s), i));
  }
  const posts = [];
  for (let i = 0; i < 5; i++) posts.push(fl(x - 51.5 * s + (i % 2) * 3 * s, y - 70 * s + i * 15 * s, i + 1), fl(x + 51.5 * s - (i % 2) * 3 * s, y - 70 * s + i * 15 * s, i + 2));
  const bw = 62 * s, bh = 24 * s;
  return (
    <g className="il-arch">
      <ellipse cx={x} cy={y + 4 * s} rx={70 * s} ry={9 * s} fill="#000" opacity=".08" />
      <rect x={x - 56 * s} y={y - 92 * s} width={9 * s} height={94 * s} rx={4 * s} fill="#5cbf6b" />
      <rect x={x + 47 * s} y={y - 92 * s} width={9 * s} height={94 * s} rx={4 * s} fill="#5cbf6b" />
      <path d={`M${x - 52 * s} ${y - 88 * s} Q${x} ${y - 150 * s} ${x + 52 * s} ${y - 88 * s}`} fill="none" stroke="#4fb35f" strokeWidth={9 * s} strokeLinecap="round" />
      {arc}{posts}
      <path d={`M${x - bw / 2 - 8 * s} ${y - 82 * s} l${8 * s} ${bh / 2} l${-8 * s} ${bh / 2} h${bw + 16 * s} l${-8 * s} ${-bh / 2} l${8 * s} ${-bh / 2}Z`} fill="#e0457a" />
      <rect x={x - bw / 2} y={y - 84 * s} width={bw} height={bh} rx={4 * s} fill="#ff7a9c" />
      <text x={x} y={y - 84 * s + bh * .68} textAnchor="middle" fontWeight="900" fontSize={font} fill="#fff">Đích</text>
    </g>
  );
}

export function Bridge({ x, y, angle, s }: { x: number; y: number; angle: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${s})`}>
      <rect x="-56" y="-27" width="112" height="54" rx="8" fill="#c98a4f" />
      {[-40, -24, -8, 8, 24, 40].map(v => <line key={v} x1={v} y1="-27" x2={v} y2="27" stroke="#9a6a3f" strokeWidth="2.5" />)}
      <rect x="-60" y="-34" width="120" height="8" rx="4" fill="#8e5a35" /><rect x="-60" y="26" width="120" height="8" rx="4" fill="#8e5a35" />
      {[-52, 0, 52].map(v => <g key={v}><circle cx={v} cy="-30" r="5" fill="#8e5a35" /><circle cx={v} cy="30" r="5" fill="#8e5a35" /></g>)}
    </g>
  );
}

/** Gold coin of a reached milestone, or the green "today" coin with its halo (glowId = a radial gradient). */
export function Coin({ x, y, r, text, today, glowId }: { x: number; y: number; r: number; text: string; today?: boolean; glowId?: string }) {
  const c = today ? ['#46b35a', '#2f8a42', '#8fe09d'] : ['#ffc83d', '#d99a00', '#ffe9a3'];
  return (
    <g>
      {today && <>
        {glowId && <circle cx={x} cy={y} r={r * 1.9} fill={`url(#${glowId})`} />}
        <circle className="il-halo" cx={x} cy={y} r={r * 1.32} fill="none" stroke="#7fd890" strokeWidth="3" opacity=".7" style={{ transformOrigin: `${x}px ${y}px` }} />
      </>}
      <ellipse cx={x} cy={y + r * .55} rx={r * 1.05} ry={r * .5} fill="#000" opacity=".1" />
      <circle cx={x} cy={y + r * .16} r={r} fill={c[1]} /><circle cx={x} cy={y} r={r} fill={c[0]} />
      <circle cx={x} cy={y} r={r * .8} fill="none" stroke={c[2]} strokeWidth={Math.max(1.5, r * .07)} strokeDasharray={`${r * .12} ${r * .1}`} opacity=".9" />
      <text x={x} y={y + r * .3} textAnchor="middle" fontWeight="900" fontSize={r * .78} fill={today ? '#fff' : '#5a3d00'}>{text}</text>
    </g>
  );
}

/** Soft stone of a milestone still ahead (next = green rim and glow); `date` is the projected "~dd/mm" under it. */
export function Stone({ x, y, r, f, text, date, next, glowId }: { x: number; y: number; r: number; f: number; text: string; date?: string; next?: boolean; glowId?: string }) {
  return (
    <g>
      {next
        ? <>
          {glowId && <ellipse cx={x} cy={y} rx={r * 1.55} ry={r * .95} fill={`url(#${glowId})`} />}
          <ellipse cx={x} cy={y + r * .18} rx={r * 1.12} ry={r * .62} fill="#7fcb85" />
          <ellipse cx={x} cy={y} rx={r * 1.12} ry={r * .6} fill="#e7f6ea" stroke="#46b35a" strokeWidth="2.5" />
        </>
        : <>
          <ellipse cx={x} cy={y + r * .18} rx={r * 1.1} ry={r * .58} fill="#d9ccb6" />
          <ellipse cx={x} cy={y} rx={r * 1.1} ry={r * .58} fill="#f6efe2" />
          <ellipse cx={x - r * .3} cy={y - r * .15} rx={r * .4} ry={r * .14} fill="#fff" opacity=".8" />
        </>}
      <text x={x} y={y + f * .35} textAnchor="middle" fontWeight="900" fontSize={f} fill={next ? '#2f8a42' : '#8a6a3a'}>{text}</text>
      {date && <text x={x} y={y + r * .95 + f * .8} textAnchor="middle" fontWeight="800" fontSize={f * .76} fill={next ? '#2f8a42' : '#9a7a4a'}
        paintOrder="stroke" stroke="#fff5e0" strokeWidth="3">{date}</text>}
    </g>
  );
}

/** Small trophy beside the summit flag; (x, y) is its foot. */
export function MiniTrophy({ x, y, k }: { x: number; y: number; k: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <ellipse cx="0" cy="1" rx="10" ry="2.4" fill="#7d8fb8" opacity=".35" />
      <path d="M-9 -24 H9 V-16 A9 9 0 0 1 -9 -16Z" fill="#ffc83d" />
      <path d="M-9 -22 C-15 -22 -15 -14 -8 -13 M9 -22 C15 -22 15 -14 8 -13" fill="none" stroke="#e09a12" strokeWidth="2.4" />
      <rect x="-2.5" y="-8" width="5" height="5" fill="#e09a12" /><rect x="-7" y="-3.5" width="14" height="4" rx="1.5" fill="#d99a00" />
      <path d="M-5 -22 L-2 -22 L-5 -14Z" fill="#fff" opacity=".75" />
    </g>
  );
}

/**
 * Sóc inside an SVG scene: (x, y) is the point between the feet, w the width in scene units. Wears the learner's coat
 * and gear; carries data-coat / data-mood like the HTML <Soc>. The markup is the fixed, trusted mascot template.
 */
export function SocSprite({ x, y, w, mood, gear, className }: { x: number; y: number; w: number; mood: SocMood; gear?: readonly string[]; className?: string }) {
  const coat = useSocCoat();
  const gearKey = gear ? gear.join(',') : '';
  const h = w * 260 / 240;
  const html = useMemo(() => socMoodSvg(mood, gearKey ? gearKey.split(',') : undefined, coat)
    .replace('<svg viewBox="0 0 240 260"', `<svg x="${(x - w * .47).toFixed(1)}" y="${(y - h * .95).toFixed(1)}" width="${w}" height="${h.toFixed(1)}" viewBox="0 0 240 260" style="width:${w}px;height:${h.toFixed(1)}px"`),
  [mood, gearKey, coat, x, y, w, h]);
  return <g className={'soc' + (className ? ' ' + className : '')} data-coat={coat} data-mood={mood} dangerouslySetInnerHTML={{ __html: html }} />;
}
