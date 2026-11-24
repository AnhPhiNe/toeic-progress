import type { CSSProperties, ReactNode } from 'react';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { Chop, FishJump, Gull, Sailboat, Sparkle, SkyCloud, StormCloud } from '@/shared/illustrations/Islands';
import { blobPath, seeded } from '@/shared/illustrations/geometry';
import { IslandArt } from './IslandArt';
import { ART_RADIUS, PCT_COLOUR, type MapPart } from '../lib/islandLook';
import { SIGN_H, SIGN_W, boatRoute, chestSpot, radiusOf, rOf, signBox, stormSpot, type MapLayout } from '../lib/islandMap';


interface Props {
  device: 'desktop' | 'phone';
  L: MapLayout;
  height: number;
  parts: Record<PartNumber, MapPart>;
  plan: PartNumber[];
  shown: PartNumber;
  ariaLabel: string;
  onChoose: (p: PartNumber) => void;
  /** Desktop only: hover picks an island after a short delay. */
  onHover?: (p: PartNumber) => void;
  onLeave?: () => void;
  onOpenNotebook: (p: PartNumber) => void;
  tip: PartNumber | null;
  onTip: (p: PartNumber | null) => void;
}

function Chest({ x, y, k, rank, open, label, interactive = true, onClick, onHover }: { x: number; y: number; k: number; rank: number; open: boolean; label: string; interactive?: boolean; onClick: () => void; onHover: (on: boolean) => void }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} className={'jr-chest' + (open ? ' is-open' : '')}
      role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? label : undefined} aria-hidden={interactive ? undefined : true} pointerEvents={interactive ? undefined : 'none'}
      onClick={interactive ? e => { e.stopPropagation(); onClick(); } : undefined} onKeyDown={interactive ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(); } } : undefined}
      onMouseEnter={interactive ? () => onHover(true) : undefined} onMouseLeave={interactive ? () => onHover(false) : undefined} onFocus={interactive ? () => onHover(true) : undefined} onBlur={interactive ? () => onHover(false) : undefined}>
      {!open && <><circle r="28" fill="#fff6c8" opacity=".5" /><circle className="il-pulse" r="19" fill="#fff6c8" opacity=".6" /></>}
      <ellipse cx="0" cy="13" rx="19" ry="4" fill="#000" opacity=".12" />
      {open ? (
        <>
          <path d="M-15 -8 L-11 -26 H11 L15 -8Z" fill="#d18f4e" /><rect x="-17" y="-8" width="34" height="22" rx="4" fill="#b8763e" /><rect x="-14" y="-8" width="28" height="6" rx="3" fill="#5a3a22" /><rect x="-17" y="-8" width="34" height="4" fill="#ffc83d" opacity=".7" />
        </>
      ) : (
        <>
          <rect x="-17" y="-6" width="34" height="20" rx="4" fill="#b8763e" /><path d="M-17 -6 Q0 -24 17 -6Z" fill="#d18f4e" /><rect x="-17" y="-8" width="34" height="5" fill="#ffc83d" /><rect x="-4" y="-4" width="8" height="9" rx="2" fill="#ffc83d" />
          <path d="M-17 4 H17" stroke="#9a5f2e" strokeWidth="1.5" />
          <path className="il-twinkle" d="M-12 -18 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#fff" />
          <g transform="translate(19 -21)"><circle r="12" fill="#ff7a9c" stroke="#fff" strokeWidth="3" /><text y="4.6" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">{rank}</text></g>
        </>
      )}
      <rect x="-24" y="-30" width="48" height="50" fill="transparent" />
    </g>
  );
}

/** Sea, islands, weather, route and Sóc's boat of "Từng Part" (desktop scene units or phone pixels). */
export function IslandMap({ device, L, height, parts, plan, shown, ariaLabel, onChoose, onHover, onLeave, onOpenNotebook, tip, onTip }: Props) {
  const W = L.width, phone = device === 'phone';
  const k = phone ? 0.62 : 1;
  const route = boatRoute(plan, L);
  const radius = (p: PartNumber) => rOf(p, L) * (phone ? 1 : ART_RADIUS);
  const artK = (p: PartNumber) => (phone ? Math.max(0.5, radius(p) / (radiusOf(p) * 0.88) * 1.15) : ART_RADIUS / 0.88);
  const order = [...PART_NUMBERS].sort((a, b) => L.pos[a][1] - L.pos[b][1]);
  const near = (x: number, y: number) => PART_NUMBERS.some(p => Math.hypot((x - L.pos[p][0]) / (radius(p) * 1.6), (y - L.pos[p][1] - radius(p) * 0.18) / (radius(p) * 0.95)) < 1)
    || (L.avoid ?? []).some(([ax, ay, aw, ah]) => x > ax && x < ax + aw && y > ay && y < ay + ah) || x > L.space - 6
    || Math.hypot(x - L.boat[0], (y - L.boat[1]) * 1.6) < 80;
  const R = seeded(phone ? 9 : 7);
  const step = phone ? 40 : 54, top = phone ? 20 : 30;
  const wavePaths: [ReactNode[], ReactNode[]] = [[], []];
  for (let gy = top; gy < height - 8; gy += step) {
    for (let gx = 14; gx < L.space - 20; gx += step * 1.55) {
      const x = gx + (R() - 0.5) * step, y = gy + (R() - 0.5) * step * 0.6, skip = R() < 0.3, g = R() < 0.5 ? 0 : 1, sc = (0.75 + R() * 0.5) * k;
      if (skip || near(x, y)) continue;
      wavePaths[g].push(<path key={`${x}${y}`} d={`M${x.toFixed(1)} ${y.toFixed(1)} q${(6 * sc).toFixed(1)} ${(-5 * sc).toFixed(1)} ${(12 * sc).toFixed(1)} 0 q${(6 * sc).toFixed(1)} ${(5 * sc).toFixed(1)} ${(12 * sc).toFixed(1)} 0`} />);
    }
  }
  const heavyPart = PART_NUMBERS.find(p => parts[p].weather.chop);
  const sb = (p: PartNumber) => signBox(p, L);
  const sw = L.sign?.w ?? SIGN_W, sh = L.sign?.h ?? SIGN_H, fs = phone ? 12 : 16;
  const sx = L.space;
  const nghe = sb(1), doc = sb(5);
  const tipPart = tip && parts[tip].wrong > 0 ? tip : null;
  const id = phone ? 'pm' : 'dm';

  const decor = phone
    ? { sailboat: [[22, height * 0.42, 0.5]], fish: [[W * 0.5, height * 0.4, 0.55, 1]], gulls: [[W * 0.64, 118, 0.6], [W * 0.68, 110, 0.45]], clouds: [[W * 0.58, 110, 0.3]], sparkle: [[20, 160, 4], [W - 30, 140, 4]] }
    : { sailboat: [[46, 470, 0.9], [sx * 0.88, 70, 0.6]], fish: [[sx * 0.34, 330, 0.9, 1], [60, 650, 0.8, -1], [sx * 0.9, 570, 0.7, 1]], gulls: [[sx * 0.62, 112, 1], [sx * 0.66, 98, 0.7], [34, 232, 0.8]], clouds: [[sx * 0.66, 66, 0.9], [W - 190, 575, 0.55], [48, 612, 0.5]], sparkle: [[54, 330, 6], [196, 318, 5], [sx * 0.88, 168, 6], [sx * 0.78, 300, 4], [sx * 0.55, 360, 4]] };

  return (
    <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="group" aria-label={ariaLabel}>
      <defs>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stopColor="#c3ebff" /><stop offset=".5" stopColor="#8fd3f3" /><stop offset="1" stopColor="#5cb8e6" /></linearGradient>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={phone ? 12 : 18} /></filter>
        <radialGradient id={`${id}-sun`}><stop offset="0" stopColor="#fff3c4" stopOpacity=".75" /><stop offset="1" stopColor="#fff3c4" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${id}-deep`}><stop offset="0" stopColor="#2f8fc8" stopOpacity=".45" /><stop offset="1" stopColor="#2f8fc8" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={W} height={height} fill={`url(#${id}-sea)`} />
      <g filter={`url(#${id}-soft)`}>
        {PART_NUMBERS.map(p => <path key={p} d={blobPath(L.pos[p][0], L.pos[p][1] + radius(p) * 0.2, radius(p) * 2.3, radius(p) * 1.45, 100 + p, 0.1)} fill="#dff6ff" opacity=".6" />)}
      </g>
      {PART_NUMBERS.map(p => <path key={p} d={blobPath(L.pos[p][0], L.pos[p][1] + radius(p) * 0.2, radius(p) * 2.0, radius(p) * 1.2, 100 + p, 0.1)} fill="none" stroke="#fff" strokeWidth={1.6 * k} opacity=".28" strokeDasharray={`${2 * k} ${9 * k}`} strokeLinecap="round" />)}
      {PART_NUMBERS.filter(p => parts[p].weather.sky === 'sunny').map(p => <ellipse key={p} cx={L.pos[p][0]} cy={L.pos[p][1]} rx={radius(p) * 2.1} ry={radius(p) * 1.3} fill={`url(#${id}-sun)`} />)}
      {PART_NUMBERS.filter(p => parts[p].weather.sky === 'storm' || parts[p].weather.sky === 'heavy').map(p => <ellipse key={p} cx={L.pos[p][0]} cy={L.pos[p][1] + radius(p) * 0.25} rx={radius(p) * 2} ry={radius(p) * 1.15} fill={`url(#${id}-deep)`} />)}
      <g className="il-waves" fill="none" stroke="#fff" strokeWidth={2.2 * k} strokeLinecap="round" opacity=".55">{wavePaths[0]}</g>
      <g className="il-waves2" fill="none" stroke="#fff" strokeWidth={2.2 * k} strokeLinecap="round" opacity=".4">{wavePaths[1]}</g>
      {heavyPart && <Chop x={L.pos[heavyPart][0]} y={L.pos[heavyPart][1]} r={radius(heavyPart)} k={k} />}
      <g>
        {decor.sailboat.map(([x, y, s]) => <Sailboat key={`${x}${y}`} x={x} y={y} s={s} />)}
        {decor.fish.map(([x, y, s, f]) => <FishJump key={`${x}${y}`} x={x} y={y} s={s} flip={f as 1 | -1} />)}
        <g className="il-drift2">{decor.gulls.map(([x, y, s]) => <Gull key={`${x}${y}`} x={x} y={y} s={s} />)}</g>
        {decor.sparkle.map(([x, y, r]) => <Sparkle key={`${x}${y}`} x={x} y={y} r={r} />)}
      </g>
      {!phone && (
        <g fontWeight="900" letterSpacing="2.5" textAnchor="middle" paintOrder="stroke" stroke="#e6f7ff" strokeWidth="5" strokeLinejoin="round" fontSize="16" fill="#2678ad">
          <text x={nghe.x + nghe.w / 2} y={nghe.y - 24}>NGHE</text><text x={doc.x + doc.w / 2} y={doc.y - 24}>ĐỌC</text>
        </g>
      )}
      {phone && (
        <g fontWeight="900" letterSpacing="2" textAnchor="middle" paintOrder="stroke" stroke="#e6f7ff" strokeWidth="4" strokeLinejoin="round" fontSize="12" fill="#2678ad">
          <text x={W * 0.28} y={L.pos[1][1] - radius(1) * 0.32 - 70}>NGHE</text><text x={W * 0.8} y={L.pos[5][1] - radius(5) * 0.32 - 62}>ĐỌC</text>
        </g>
      )}

      {route.map((leg, i) => (
        <g key={i} opacity={i ? 0.78 : 1} className="il-route" style={{ '--dl': `${0.3 + i * 0.5}s` } as CSSProperties}>
          <path d={leg.d} transform={`translate(0 ${2 * k})`} fill="none" stroke="#1f6f9f" strokeWidth={4 * k} strokeDasharray={`${2 * k} ${10 * k}`} strokeLinecap="round" opacity=".16" />
          <path d={leg.d} fill="none" stroke="#fff" strokeWidth={4 * k} strokeDasharray={`${2 * k} ${10 * k}`} strokeLinecap="round" />
        </g>
      ))}

      {order.map(p => {
        const [x, y] = L.pos[p], r = rOf(p, L), info = parts[p], c = PCT_COLOUR[info.state], on = p === shown;
        const box = sb(p), showChest = info.rank >= 0 || info.open;
        const [cx, cy] = chestSpot(p, info.rank === 1 ? 1 : 0, L);
        return (
          <g key={p}>
            <g className={'jr-isl' + (on ? ' is-on' : '')} role="button" tabIndex={0}
              aria-label={`Part ${p}: ${info.pct}% đúng, ${info.wrong} câu sai${info.rank >= 0 ? `, rương số ${info.rank + 1}` : ''}`} aria-pressed={on}
              onMouseEnter={onHover ? () => onHover(p) : undefined} onMouseLeave={onLeave} onFocus={phone ? undefined : () => onChoose(p)} onClick={() => onChoose(p)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(p); } }}>
              <rect x={Math.min(box.x, x - r * 1.16)} y={box.y - 4} width={Math.max(box.w, r * 2.32)} height={y + r * 0.9 - box.y + 4} fill="transparent" />
              {on && <path className="il-pulse" d={blobPath(x, y + radius(p) * 0.18, radius(p) * 1.46, radius(p) * 0.8, 3, 0.02)} fill="none" stroke="#fff" strokeWidth={3.5 * k} strokeDasharray={`${11 * k} ${8 * k}`} strokeLinecap="round" />}
              <g className="jr-lift">
                <IslandArt part={p} x={x} y={y} r={radius(p)} k={artK(p)} weather={info.weather} />
                <line x1={x} y1={box.y + sh} x2={x} y2={y + 4 * k} stroke="#8a5a36" strokeWidth={4 * k} strokeLinecap="round" />
                <rect x={box.x} y={box.y + 3 * k} width={sw} height={sh} rx={sh / 2.3} fill="#1f5f86" opacity=".2" />
                <rect x={box.x} y={box.y} width={sw} height={sh} rx={sh / 2.3} fill="#fff" stroke={on ? '#ff7a9c' : 'none'} strokeWidth={2.6 * k + 0.4} />
                <text x={x} y={box.y + sh * 0.68} textAnchor="middle" fontWeight="900" fontSize={fs} fill="#2f3a33">Part {p}<tspan dx={fs * 0.45} fill={c.ink}>{info.pct}%</tspan></text>
              </g>
            </g>
            {showChest && (
              <Chest x={cx} y={cy} k={phone ? 0.62 : 1} rank={info.rank + 1} open={info.open} interactive={!phone}
                label={info.open ? `Rương Part ${p} đã mở, xem lại câu sai` : `Rương số ${info.rank + 1}, Part ${p}: xem ${info.wrong} câu sai`}
                onClick={() => onOpenNotebook(p)} onHover={o => onTip(o ? p : null)} />
            )}
          </g>
        );
      })}

      <g transform={`translate(${L.boat[0]} ${L.boat[1]}) scale(${phone ? 0.62 : 1})`}>
        <ellipse cx="0" cy="24" rx="58" ry="8" fill="#1f6f9f" opacity=".18" />
        <g className="il-boat">
          <path d="M-50 -2 Q0 4 50 -2 L38 20 Q0 24 -38 20Z" fill="#b97a45" />
          <path d="M-47 6 Q0 12 47 6 M-43 13 Q0 19 43 13" stroke="#9a6134" strokeWidth="1.6" fill="none" />
          <path d="M-50 -2 Q0 4 50 -2" stroke="#e0a467" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M30 -2 L64 20" stroke="#8a5a32" strokeWidth="3.5" strokeLinecap="round" /><ellipse cx="66" cy="22" rx="7" ry="3.5" fill="#8a5a32" transform="rotate(30 66 22)" />
        </g>
        <path d="M-60 28 q12 -6 24 0 q12 6 24 0 q12 -6 24 0 q12 6 24 0 q12 -6 24 0" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>

      {/* weather over the weak islands and clouds over the sea; they drift in over a few seconds and keep clear of the signs */}
      <g pointerEvents="none">
        {PART_NUMBERS.filter(p => parts[p].weather.sky === 'storm' || parts[p].weather.sky === 'heavy').map(p => {
          const heavy = parts[p].weather.sky === 'heavy', s = (heavy ? 0.9 : 0.66) * (phone ? 0.55 : 1), [x, y] = stormSpot(p, 52 * s, L);
          return <StormCloud key={p} x={x} y={y} s={s} heavy={heavy} />;
        })}
        {decor.clouds.map(([x, y, s], i) => <SkyCloud key={i} x={x} y={y} s={s} className={i ? 'il-drift2' : 'il-drift'} />)}
      </g>

      {tipPart !== null && (() => {
        const c = parts[tipPart], [tx, ty] = chestSpot(tipPart, c.rank === 1 ? 1 : 0, L);
        const text = c.open ? 'Đã gỡ hết câu sai' : `${c.remaining} câu gỡ lại được`;
        const w = 20 + text.length * 7.4, x = Math.max(8, Math.min(L.space - w - 8, tx - w / 2));
        return <g pointerEvents="none"><rect x={x} y={ty - 66} width={w} height="30" rx="15" fill="#2f3a33" /><text x={x + w / 2} y={ty - 46} fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">{text}</text></g>;
      })()}
    </svg>
  );
}

