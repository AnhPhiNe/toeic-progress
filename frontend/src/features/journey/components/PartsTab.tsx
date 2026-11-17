import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { PART_NAMES, ddmm, fullTests, partSize, wrongCountsByPart } from '../lib/journeyData';
import { ISLAND_STATE_LABEL, chestPlan, islandState, partAccuracy, partChests, wrongTrend, type IslandState } from '../lib/islands';
import { MAP_H, MIN_MAP_W, SIGN_H, SIGN_W, boatRoute, chestSpot, mapLayout, radiusOf, signBox } from '../lib/islandMap';
import { SceneStage } from './SceneStage';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  onOpenNotebook: (testName: string, part?: number) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onOpenSessionLogger: () => void;
}

const LOOK: Record<IslandState, { top: string; side: string; ink: string; bg: string }> = {
  strong: { top: '#7fd18c', side: '#4fae5f', ink: '#2f8a42', bg: '#e3f6e6' },
  ok: { top: '#c6e58c', side: '#98bd56', ink: '#a87a00', bg: '#fff1c9' },
  weak: { top: '#f8dcc0', side: '#e6b48f', ink: '#d64570', bg: '#ffe3ea' }
};
const TREND_TEXT = { down: 'đang giảm', up: 'đang tăng', flat: 'đứng yên' } as const;
const TREND_INK = { down: '#2f8a42', up: '#c23c63', flat: '#7a857e' } as const;
const HELP: Array<[string, string]> = [
  ['big', 'Đảo to là Part có nhiều câu'],
  ['lush', 'Cây rậm là Part vững'],
  ['sand', 'Cát và dừa là Part cần ôn'],
  ['chest', 'Rương là chỗ nên ghé trước']
];

const tree = (key: string, x: number, y: number, s = 1) => (
  <g key={key} transform={`translate(${x} ${y}) scale(${s})`}><rect x="-5" y="-8" width="10" height="30" rx="4" fill="#a26c43" /><circle cx="0" cy="-24" r="22" fill="#5bb46b" /><circle cx="-12" cy="-14" r="14" fill="#4fa55f" /><circle cx="11" cy="-31" r="12" fill="#8fdb9c" /></g>
);
const palm = (key: string, x: number, y: number, s = 1) => (
  <g key={key} transform={`translate(${x} ${y}) scale(${s})`}><path d="M0 14 Q4 -10 0 -34" stroke="#a26c43" strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M0 -34 q-16 -6 -28 4 M0 -34 q16 -8 28 2 M0 -34 q-8 -16 -22 -16 M0 -34 q10 -14 22 -12" stroke="#5bb46b" strokeWidth="6" fill="none" strokeLinecap="round" /></g>
);
const rock = (key: string, x: number, y: number) => <g key={key}><ellipse cx={x} cy={y} rx="9" ry="6" fill="#b9a99a" /><ellipse cx={x - 2} cy={y - 2} rx="5" ry="3" fill="#d3c6b9" /></g>;
const flower = (key: string, x: number, y: number, c: string) => (
  <g key={key} transform={`translate(${x} ${y})`}><circle cx="-3" r="3" fill={c} /><circle cx="3" r="3" fill={c} /><circle cy="-3" r="3" fill={c} /><circle r="2" fill="#ffe58f" /></g>
);

function Vegetation({ state, x, y, r, chest }: { state: IslandState; x: number; y: number; r: number; chest: boolean }) {
  if (state === 'strong') {
    return <>{tree('a', x - r * .55, y - 2, .75)}{tree('b', x + r * .55, y + 2, .85)}{!chest && tree('c', x + r * .2, y + r * .25, .6)}{flower('f1', x - r * .2, y + r * .3, '#ff9eb8')}{flower('f2', x - r * .7, y + r * .15, '#fff')}</>;
  }
  if (state === 'ok') {
    return <>{tree('a', x - r * .58, y, .7)}{tree('b', x + r * .6, y + 2, .75)}{flower('f1', x + r * .25, y + r * .32, '#fff')}{rock('r1', x - r * .3, y + r * .32)}</>;
  }
  return <>{palm('p', x + r * .55, y + 4, .8)}{rock('r1', x - r * .55, y + r * .2)}{rock('r2', x - r * .25, y + r * .36)}</>;
}

function Chest({ x, y, rank, open, label, onClick, onHover }: { x: number; y: number; rank: number; open: boolean; label: string; onClick: () => void; onHover: (on: boolean) => void }) {
  return (
    <g transform={`translate(${x} ${y})`} className={'jr-chest' + (open ? ' is-open' : '')} role="button" tabIndex={0} aria-label={label}
      onClick={e => { e.stopPropagation(); onClick(); }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onClick(); } }}
      onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onFocus={() => onHover(true)} onBlur={() => onHover(false)}>
      {!open && <circle className="jr-glow" r="30" fill="#fff6c8" opacity=".55" />}
      {open ? (
        <>
          <path d="M-15 -8 L-11 -26 H11 L15 -8Z" fill="#d18f4e" /><rect x="-17" y="-8" width="34" height="22" rx="4" fill="#b8763e" /><rect x="-14" y="-8" width="28" height="6" rx="3" fill="#5a3a22" /><rect x="-17" y="-8" width="34" height="4" fill="#ffc83d" opacity=".7" />
        </>
      ) : (
        <>
          <rect x="-17" y="-6" width="34" height="20" rx="4" fill="#b8763e" /><path d="M-17 -6 Q0 -24 17 -6Z" fill="#d18f4e" /><rect x="-17" y="-8" width="34" height="5" fill="#ffc83d" /><rect x="-4" y="-4" width="8" height="9" rx="2" fill="#ffc83d" />
          <path className="jr-glint" d="M-12 -16 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#fff" />
          <g transform="translate(18 -22)"><circle r="12" fill="#ff7a9c" stroke="#fff" strokeWidth="3" /><text y="4.5" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">{rank}</text></g>
        </>
      )}
      <rect x="-24" y="-30" width="48" height="50" fill="transparent" />
    </g>
  );
}

/** Từng Part tab (design/previews/mock-journey-parts4.html): one island per Part, chests on the Parts to visit first. */
export function PartsTab({ sessions, mistakes, onOpenNotebook, onPractice, onOpenSessionLogger }: Props) {
  const withParts = useMemo(() => fullTests(sessions).filter(s => wrongCountsByPart(s)).reverse(), [sessions]);
  const [pick, setPick] = useState<string | null>(null);
  const [sel, setSel] = useState<PartNumber | null>(null);
  const [tip, setTip] = useState<PartNumber | null>(null);
  const [help, setHelp] = useState(false);
  const intent = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(intent.current), []);
  useEffect(() => {
    if (!help) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelp(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [help]);

  const test = withParts.find(s => s.id === pick) ?? withParts[0];
  const now = test ? wrongCountsByPart(test)! : null;
  const chests = useMemo(() => (test && now ? partChests(test, now, mistakes) : null), [test, now, mistakes]);
  const plan = useMemo(() => (chests ? chestPlan(chests) : { numbered: [], opened: [] }), [chests]);

  if (!test || !now || !chests) {
    return (
      <div className="jr-empty">
        <Soc state="think" size={110} />
        <p>Chưa có đề nào ghi câu sai theo Part. Ghi một đề kèm ảnh kết quả, Sóc sẽ chia câu sai theo từng Part.</p>
        <button type="button" className="rd-btn" onClick={onOpenSessionLogger}>+ Ghi điểm</button>
      </div>
    );
  }

  const idx = withParts.indexOf(test);
  const recent = withParts.slice(idx, idx + 4).reverse().map(s => wrongCountsByPart(s)!);
  const total = PART_NUMBERS.reduce((sum, p) => sum + now[p], 0);
  const acc = (p: PartNumber) => partAccuracy(partSize(p), now[p]);
  const defaultPart = plan.numbered[0] ?? PART_NUMBERS.reduce((w, p) => (acc(p) < acc(w) ? p : w), 1 as PartNumber);
  const shown: PartNumber = sel ?? defaultPart;
  const choose = (p: PartNumber) => { setSel(p); };
  const hoverIsland = (p: PartNumber) => { window.clearTimeout(intent.current); intent.current = window.setTimeout(() => choose(p), 110); };
  const leaveIsland = () => window.clearTimeout(intent.current);
  const openNotebook = (p: PartNumber) => onOpenNotebook(test.testName, p);

  const names = plan.numbered.map(p => <em key={p}>Part {p}</em>);
  let headline: ReactNode;
  if (total === 0) headline = 'Đề này không sai câu nào!';
  else if (names.length === 2) headline = <>Ghé {names[0]} rồi {names[1]} trước</>;
  else if (names.length === 1) headline = <>Ghé {names[0]} trước</>;
  else headline = 'Bạn đã gỡ hết câu sai của đề này, giỏi lắm!';

  const planRows = [
    ...plan.numbered.map((part, i) => ({ part, rank: i + 1 })),
    ...plan.opened.slice(0, 2).map(part => ({ part, rank: 0 }))
  ];
  const baseY = mapLayout(MIN_MAP_W).pos;
  const order = [...PART_NUMBERS].sort((a, b) => baseY[a][1] - baseY[b][1]);
  const tipChest = tip && chests[tip].wrong > 0 ? chests[tip] : null;
  const detail = chests[shown];
  const look = LOOK[islandState(acc(shown))];
  const series = recent.map(r => r[shown]);
  const trend = wrongTrend(series);
  const lo = Math.min(...series), hi = Math.max(...series);
  const spark = series.map((v, i) => [8 + i * (80 / Math.max(1, series.length - 1)), hi === lo ? 15 : 26 - (v - lo) / (hi - lo) * 22] as const);

  return (
    <SceneStage height={MAP_H} minWidth={MIN_MAP_W} className="jr-sea">{W => {
      const L = mapLayout(W);
      const route = boatRoute(plan.numbered, L);
      const sb1 = signBox(1, L), sb5 = signBox(5, L), f = L.space / (MIN_MAP_W - 306);
      return (<>
        <svg width={W} height={MAP_H} viewBox={`0 0 ${W} ${MAP_H}`} role="group" aria-label={`Câu sai theo Part của đề ${ddmm(test.date)}`}>
          <defs><linearGradient id="jm-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8ecff" /><stop offset="1" stopColor="#6fc4ee" /></linearGradient></defs>
          <rect width={W} height={MAP_H} fill="url(#jm-sea)" />
          <g transform={`scale(${W / 1068} 1)`}>
            <path d="M20 120 C120 60 380 70 470 150 C540 230 520 420 430 560 C330 650 120 640 50 560 C-10 470 -20 200 20 120Z" fill="#e2f6ff" opacity=".55" />
            <path d="M500 90 C600 60 740 90 750 180 C770 300 760 520 700 640 C640 690 520 680 490 600 C470 480 470 180 500 90Z" fill="#e2f6ff" opacity=".55" />
          </g>
          {[0, 1].map(g => (
            <g key={g} className="jr-waves" style={{ '--x': g ? '-14px' : '16px', '--t': g ? '11s' : '8s' } as CSSProperties} fill="none" stroke="#fff" strokeWidth="2.4" opacity=".55" strokeLinecap="round">
              {Array.from({ length: 17 }, (_, k) => { const i = k * 2 + g, x = (i * 173 + 40) % (W - 40), y = 40 + (i * 97) % 640; return <path key={i} d={`M${x} ${y} q7 -5 14 0 q7 5 14 0`} />; })}
            </g>
          ))}
          <text x={sb1.x + sb1.w / 2} y={sb1.y - 20} fontWeight="900" fontSize="15" fill="#2d84b8" textAnchor="middle" letterSpacing="1.5">NGHE</text>
          <text x={sb5.x + sb5.w / 2} y={sb5.y - 20} fontWeight="900" fontSize="15" fill="#2d84b8" textAnchor="middle" letterSpacing="1.5">ĐỌC</text>
          <g className="jr-gull" transform={`translate(${L.space * .6 - 440} 0)`} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M440 110 q7 -7 14 0 q7 -7 14 0" /><path d="M470 92 q5 -5 10 0 q5 -5 10 0" /></g>
          <g transform={`translate(${L.boat[0] - 260 * f} ${L.boat[1] - 195})`}><g className="jr-bob"><path d="M-22 0 H22 L14 12 H-14Z" fill="#fff" /><path d="M0 -2 V-40 L22 -6Z" fill="#ffc83d" /><path d="M-2 -6 V-32 L-18 -6Z" fill="#fff" /></g></g>
          <g transform={`translate(${L.space * .86} 330)`}><path d="M0 0 q-12 -18 -22 -14 q8 6 14 18 q6 -12 14 -18 q-10 -4 -6 14Z" fill="#4a90c2" /><path d="M-16 6 q16 6 32 0" stroke="#fff" strokeWidth="2" fill="none" /></g>

          {route.map((leg, i) => <path key={i} className="jr-route" d={leg.d} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" opacity={i ? .7 : 1} />)}

          {order.map(p => {
            const [x, y] = L.pos[p], r = radiusOf(p), pct = acc(p), state = islandState(pct), c = LOOK[state], on = p === shown;
            const sb = signBox(p, L), ch = chests[p];
            const rank = plan.numbered.indexOf(p);
            const showChest = rank >= 0 || ch.open;
            const [cx, cy] = chestSpot(p, rank === 1 ? 1 : 0, L);
            return (
              <g key={p} className={'jr-isl' + (on ? ' is-on' : '')} role="button" tabIndex={0}
                aria-label={`Part ${p}: ${pct}% đúng, ${ch.wrong} câu sai${rank >= 0 ? `, rương số ${rank + 1}` : ''}`} aria-pressed={on}
                onMouseEnter={() => hoverIsland(p)} onMouseLeave={leaveIsland} onFocus={() => choose(p)} onClick={() => choose(p)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(p); } }}>
                <ellipse cx={x} cy={y + r * .36} rx={r * 1.16} ry={r * .52} fill="#fff" opacity={on ? .8 : .45} />
                {on && <ellipse className="jr-ring" cx={x} cy={y + r * .36} rx={r * 1.22} ry={r * .58} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="10 8" />}
                <rect x={Math.min(sb.x, x - r * 1.16)} y={sb.y} width={Math.max(sb.w, r * 2.32)} height={y + r * .9 - sb.y} fill="transparent" />
                <g className="jr-lift">
                  <ellipse cx={x} cy={y + r * .2} rx={r} ry={r * .5} fill={c.side} /><ellipse cx={x} cy={y} rx={r} ry={r * .5} fill={c.top} />
                  <Vegetation state={state} x={x} y={y} r={r} chest={showChest} />
                  <line x1={x} y1={sb.y + SIGN_H} x2={x} y2={y + 4} stroke="#8a5a36" strokeWidth="5" strokeLinecap="round" />
                  {showChest && (
                    <Chest x={cx} y={cy} rank={rank + 1} open={ch.open}
                      label={ch.open ? `Rương Part ${p} đã mở, xem lại câu sai` : `Rương số ${rank + 1}, Part ${p}: xem ${ch.wrong} câu sai`}
                      onClick={() => openNotebook(p)} onHover={o => setTip(o ? p : null)} />
                  )}
                  <rect x={sb.x} y={sb.y + 4} width={SIGN_W} height={SIGN_H} rx="12" fill="rgba(20,80,120,.18)" />
                  <rect x={sb.x} y={sb.y} width={SIGN_W} height={SIGN_H} rx="12" fill="#fff" stroke={on ? '#ff7a9c' : 'none'} strokeWidth="3" />
                  <text x={x} y={sb.y + 24} textAnchor="middle" fontWeight="900" fontSize="16" fill="#2f3a33">Part {p}<tspan dx="8" fill={c.ink}>{pct}%</tspan></text>
                </g>
              </g>
            );
          })}

          <g transform={`translate(${L.boat[0]} ${L.boat[1]})`}>
            <g className="jr-bob"><path d="M-48 0 H48 L36 22 H-36Z" fill="#a26c43" /><path d="M-48 0 H48" stroke="#7d4f2e" strokeWidth="4" /></g>
            <path d="M-60 26 q12 -6 24 0 q12 6 24 0 q12 -6 24 0 q12 6 24 0 q12 -6 24 0" stroke="#fff" strokeWidth="2.5" fill="none" />
          </g>
          {tipChest && (() => {
            const rank = plan.numbered.indexOf(tipChest.part), [tx, ty] = chestSpot(tipChest.part, rank === 1 ? 1 : 0, L);
            const text = tipChest.open ? 'Đã gỡ hết câu sai' : `${tipChest.remaining} câu gỡ lại được`;
            const w = 20 + text.length * 7.4, x = Math.max(8, Math.min(L.space - w - 8, tx - w / 2));
            return <g className="jr-tip2" pointerEvents="none"><rect x={x} y={ty - 66} width={w} height="30" rx="15" fill="#2f3a33" /><text x={x + w / 2} y={ty - 46} fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">{text}</text></g>;
          })()}
        </svg>

        <div className="jr-card is-parts">
          <small className="jr-kick is-pink">Mất điểm ở đâu?</small>
          <h2>{headline}</h2>
          <label className="jr-dd">
            <span className="sr-only">Chọn đề</span>
            <select value={test.id} onChange={e => { setPick(e.target.value); setSel(null); setTip(null); }}>
              {withParts.map(s => <option key={s.id} value={s.id}>Đề {ddmm(s.date)} · {s.testName}</option>)}
            </select>
          </label>
        </div>

        <div className="jr-boat-soc" style={{ left: L.boat[0] - 34, top: L.boat[1] - 66 }}><span className="jr-bob"><Soc state="hi" size={68} /></span></div>

        <div className="jr-side">
        <div className="jr-pn" aria-live="polite">
          <div className="jr-pn-h">
            <div><b>Part {shown}</b><small>{PART_NAMES[shown]} · {partSize(shown)} câu · {shown <= 4 ? 'Nghe' : 'Đọc'}</small></div>
            <span className="jr-tag" style={{ background: look.bg, color: look.ink }}>{ISLAND_STATE_LABEL[islandState(acc(shown))]}</span>
          </div>
          <div className="jr-pn-big"><strong className={detail.wrong === 0 ? 'is-zero' : undefined}>{detail.wrong}</strong><span>câu sai</span></div>
          <div className="jr-acc"><div className="jr-acc-bar"><i style={{ width: `${acc(shown)}%` }} /></div><p>{acc(shown)}% đúng</p></div>
          {trend && (
            <div className="jr-trend">
              <svg viewBox="0 0 96 30" aria-hidden="true"><path d={`M${spark.map(p => `${p[0]} ${p[1]}`).join(' L')}`} fill="none" stroke={TREND_INK[trend]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {spark.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === spark.length - 1 ? 4.5 : 3} fill={i === spark.length - 1 ? TREND_INK[trend] : '#fff'} stroke={TREND_INK[trend]} strokeWidth="2" />)}</svg>
              <span><b style={{ color: TREND_INK[trend] }}>{TREND_TEXT[trend]}</b> qua {series.length} đề</span>
            </div>
          )}
          <div className="jr-pn-btns">
            {shown >= 5 && <button type="button" className="jr-btn" onClick={() => onPractice(shown as 5 | 6 | 7)}>Bấm giờ Part {shown}</button>}
            {detail.wrong > 0
              ? <button type="button" className={'jr-btn' + (shown >= 5 ? ' is-w' : '')} onClick={() => openNotebook(shown)}>Xem {detail.wrong} câu sai</button>
              : <p className="jr-clean">Part này không sai câu nào.</p>}
          </div>
        </div>
        {planRows.length > 0 && (
          <div className="jr-plan">
            <h4>Lộ trình của Sóc</h4>
            {planRows.map(({ part, rank }) => {
              const c = chests[part], done = c.open;
              return (
                <button key={part} type="button" className={'jr-plan-row' + (done ? ' is-done' : '') + (part === shown ? ' is-on' : '')}
                  aria-pressed={part === shown} onClick={() => choose(part)}>
                  <div className="jr-plan-top"><i>{done ? '✓' : rank}</i><em>Part {part} · {PART_NAMES[part]}</em>
                    <span>{done ? 'đã gỡ hết' : `đã ôn ${c.reviewed}/${c.wrong}`}</span></div>
                  {!done && <div className="jr-plan-bar"><b style={{ width: `${c.wrong ? c.reviewed / c.wrong * 100 : 0}%` }} /></div>}
                </button>
              );
            })}
          </div>
        )}
        </div>

        <button type="button" className="jr-help" aria-label="Chú thích bản đồ" aria-expanded={help} onClick={() => setHelp(h => !h)}>?</button>
        {help && (
          <div className="jr-helpbox" role="dialog" aria-label="Chú thích bản đồ">
            <b>Đọc bản đồ</b>
            {HELP.map(([k, t]) => <div key={k} className="jr-hrow">{legendIcon(k)}<span>{t}</span></div>)}
            <button type="button" className="jr-hx" aria-label="Đóng chú thích" onClick={() => setHelp(false)}>×</button>
          </div>
        )}
      </>);
    }}</SceneStage>
  );
}

function legendIcon(kind: string) {
  const top = kind === 'sand' ? '#f8dcc0' : '#7fd18c', side = kind === 'sand' ? '#e6b48f' : '#4fae5f';
  return (
    <svg viewBox="0 0 34 26" width="34" height="26" aria-hidden="true">
      {kind === 'chest'
        ? <g transform="translate(17 15)"><rect x="-12" y="-4" width="24" height="14" rx="3" fill="#b8763e" /><path d="M-12 -4 Q0 -17 12 -4Z" fill="#d18f4e" /><rect x="-12" y="-6" width="24" height="4" fill="#ffc83d" /></g>
        : <><ellipse cx="17" cy="16" rx={kind === 'big' ? 16 : 13} ry={kind === 'big' ? 8 : 6} fill={side} /><ellipse cx="17" cy="13" rx={kind === 'big' ? 16 : 13} ry={kind === 'big' ? 8 : 6} fill={top} />
          {kind === 'lush' && <><circle cx="11" cy="9" r="5" fill="#5bb46b" /><circle cx="22" cy="8" r="5.5" fill="#4fa55f" /></>}
          {kind === 'sand' && <path d="M20 14 Q22 6 20 1 M20 1 q-6 -1 -9 3 M20 1 q6 -1 8 3" stroke="#5bb46b" strokeWidth="2.4" fill="none" strokeLinecap="round" />}</>}
    </svg>
  );
}

