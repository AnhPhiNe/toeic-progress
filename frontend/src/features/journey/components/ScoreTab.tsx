import { Children, isValidElement, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import type { StudySession, UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { DEFAULT_LIMIT, daysUntil, forecast, journeySeries, splitTarget, type JourneyPoint, type ScoreMetric } from '../lib/scoreJourney';
import { FLOOR, MIN_SCENE_W, SCENE_H as H, SCENE_W as W0, buildMountain, dateGroups, deltaText, lastX, placeBubble, pointsToGo, standOn, trailDots, type Rect } from '../lib/mountainScene';
import { ddmm } from '../lib/journeyData';
import { SceneStage } from './SceneStage';

interface Props {
  sessions: StudySession[];
  profile: UserProfile;
  today: string;
  onOpenTest: (id: string) => void;
  onShowTests: () => void;
  /** Opens the score logger (the empty mountain's first stake and the card button). */
  onLog?: () => void;
}

const FORCE_KEY = 'rd_journey_force_v1';
const forceKey = () => `${FORCE_KEY}:${getActiveAccountId() ?? 'guest'}`;
const readForced = (): string[] => { try { return JSON.parse(localStorage.getItem(forceKey()) || '[]'); } catch { return []; } };
const METRIC_LABEL: Record<ScoreMetric, string> = { total: 'Tổng', listening: 'Nghe', reading: 'Đọc' };
const METRIC_MAX: Record<ScoreMetric, number> = { total: 990, listening: 495, reading: 495 };
/** How long the ridge takes to draw on first show (see journey.css). */
const DRAW_SECONDS = 1.6;
/** Sóc's width in scene units; the artwork is 240×260. */
const SOC_W = 58;
const SOC_H = SOC_W * 260 / 240;
/** The stat card (left 20, width 284), as a box a bubble must stay clear of. */
const CARD_BOX: Rect = { x: 14, y: 14, w: 300, h: 330 };

const pine = (key: string, x: number, y: number, s = 1, c = '#3f9a54') => (
  <g key={key} transform={`translate(${x} ${y}) scale(${s})`}><rect x="-3" y="0" width="6" height="12" fill="#8a5a36" /><path d="M0 -40 L16 -12 H8 L20 4 H-20 L-8 -12 H-16Z" fill={c} /></g>
);
const sparkle = (key: string, x: number, y: number, r: number, delay: number) => (
  <path key={key} className="jr-spark" style={{ '--d': `${delay}s` } as CSSProperties} fill="#fff" d={`M${x} ${y - r} l${r * .3} ${r * .7} ${r * .7} ${r * .3} -${r * .7} ${r * .3} -${r * .3} ${r * .7} -${r * .3} -${r * .7} -${r * .7} -${r * .3} ${r * .7} -${r * .3}Z`} />
);
/** Length of the text in a React node, to size the speech bubble before it is drawn. */
const textLen = (node: ReactNode): number => {
  if (typeof node === 'string' || typeof node === 'number') return String(node).length;
  if (isValidElement<{ children?: ReactNode }>(node)) return textLen(node.props.children);
  return Children.toArray(node).reduce<number>((sum, c) => sum + (typeof c === 'object' && isValidElement(c) ? textLen(c) : typeof c === 'string' || typeof c === 'number' ? String(c).length : 0), 0);
};

/** Điểm số tab (design/previews/mock-journey-compact.html): the ridge of the mountain is the score line. */
export function ScoreTab({ sessions, profile, today, onOpenTest, onShowTests, onLog }: Props) {
  const [metric, setMetric] = useState<ScoreMetric>('total');
  const [forced, setForced] = useState<string[]>(readForced);
  const [hover, setHover] = useState<number | null>(null);
  const split = useMemo(() => splitTarget(profile.targetScore, sessions), [profile.targetScore, sessions]);
  const target = metric === 'total' ? profile.targetScore : split[metric];
  const series = useMemo(() => journeySeries(sessions, { limit: DEFAULT_LIMIT, metric, forceInclude: forced }), [sessions, metric, forced]);
  const everything = useMemo(() => journeySeries(sessions, { limit: 100000, metric, forceInclude: forced }).points, [sessions, metric, forced]);
  const T = series.points, hidden = series.hiddenCount, n = T.length;
  const fc = useMemo(() => forecast(T, target, profile.examDate, today, { metric }), [T, target, profile.examDate, today, metric]);
  const rising = fc && fc.kind === 'rising' ? fc : null;
  const examIn = daysUntil(profile.examDate, today);
  const logic = useMemo(() => buildMountain(T, target, metric), [T, target, metric]);
  const prefix = metric === 'total' ? '' : `${METRIC_LABEL[metric]}: `;
  const togo = pointsToGo(T, target);

  const force = (id: string) => {
    const next = [...new Set([...forced, id])];
    setForced(next);
    try { localStorage.setItem(forceKey(), JSON.stringify(next)); } catch { /* Kept for this visit only. */ }
  };

  const sentence = (text: string) => prefix + (prefix ? text : text.charAt(0).toUpperCase() + text.slice(1));
  let headline: ReactNode;
  if (n === 0) headline = 'Ghi đề đầu tiên để cắm cọc đầu tiên trên núi';
  else if (fc?.kind === 'reached') headline = sentence(`bạn đã cắm cờ ${target}, giữ phong độ nhé`);
  else if (rising?.inView) headline = <>{prefix}{prefix ? 'còn ' : 'Còn '}<em>{togo} điểm</em>, khoảng {rising.testsAhead} đề nữa là cắm cờ</>;
  else if (rising?.atExam) headline = sentence(`theo đà này, ngày thi bạn khoảng ${rising.atExam}`);
  else if (rising) headline = sentence(`bạn đang lên khoảng ${Math.round(rising.slopePerTest)} điểm mỗi đề`);
  else if (n < 2) headline = sentence('ghi thêm một đề nữa để thấy đà của bạn');
  else headline = sentence('điểm đang chững, xem Part nào kéo điểm lại nhé');

  const latest: JourneyPoint | undefined = T[n - 1];
  const prevPoint = T[n - 2];
  const first = everything[0];
  const bestBefore = latest ? Math.max(-Infinity, ...everything.filter(p => p.id !== latest.id && (p.date < latest.date || (p.date === latest.date && everything.indexOf(p) < everything.indexOf(latest)))).map(p => p.score)) : -Infinity;
  const delta = latest && prevPoint ? latest.score - prevPoint.score : null;
  const excludedShown = T.find(p => p.excluded);
  const sitPoint = logic.sitIdx >= 0 ? T[logic.sitIdx] : null;

  let bubble: ReactNode = null;
  if (n === 0) bubble = <>Mình dựng trại sẵn rồi. Ghi <b>đề đầu tiên</b> là cắm cọc 1!</>;
  else if (logic.reached) bubble = <>Chạm đỉnh <b>{target}</b> rồi, cắm cờ thôi!</>;
  else if (excludedShown && latest && excludedShown.id === latest.id) bubble = <>Đề {ddmm(excludedShown.date)} lệch hẳn so với các đề quanh nó nên mình chưa tính vào đà. Bấm <b>Vẫn tính đề này</b> nếu đó là điểm thật.</>;
  else if (excludedShown) bubble = <>Đề {ddmm(excludedShown.date)} lệch hẳn nên mình chưa tính vào đà. Bấm <b>Vẫn tính đề này</b> nếu đó là điểm thật.</>;
  else if (sitPoint?.retake) bubble = <>Cọc mới nhất <b>{sitPoint.score}</b> là đề làm lại, điểm có thể cao hơn thực tế một chút.</>;
  else if (sitPoint && bestBefore === -Infinity) bubble = <>Cọc đầu tiên <b>{sitPoint.score}</b>, mình leo lên nhé!</>;
  else if (sitPoint && sitPoint.score > bestBefore) bubble = <>Cọc mới nhất <b>{sitPoint.score}</b>, cao nhất từ trước tới giờ!</>;
  else if (sitPoint && sitPoint.score === bestBefore) bubble = <>Cọc mới nhất <b>{sitPoint.score}</b>, bằng mức cao nhất từ trước tới giờ.</>;
  else if (sitPoint) bubble = <>Cọc mới nhất <b>{sitPoint.score}</b>, mình leo tiếp nhé!</>;

  const scene = (W: number) => {
    const mt = buildMountain(T, target, metric, W);
    const sx = W / W0;
    // Draw-in timing: the ridge is revealed left to right, each stake drops when the line reaches it.
    // The reveal clip is measured on the whole scene (clip-path ... view-box), so progress is simply x / W.
    const frac = (x: number) => Math.max(0, Math.min(1, x / W));
    const lineFrom = mt.ridgeLine.length ? frac(mt.ridgeLine[0][0]) : 0;
    const lineTo = mt.ridgeLine.length ? frac(mt.ridgeLine[mt.ridgeLine.length - 1][0]) : 0;
    const ridgePath = (pts: ReadonlyArray<readonly [number, number]>) => pts.map(p => `${p[0]} ${p[1]}`).join(' L');
    const [ax, ay] = mt.apex;
    const slopePines = [.39, .5, .62].map(f => ({ x: Math.round(W * f), y: mt.ridgeAt(W * f) + 84 })).filter(p => p.y < H - 76 && p.y > mt.ridgeAt(p.x) + 40);
    const groups = dateGroups(T);
    const dateY = H - 20;
    const empty = n === 0;
    // Empty mountain: Sóc waits at a base camp on the foot of the slope instead of half-way up.
    const soc = empty ? standOn(mt.ridgeAt, mt.ridgeLine[0][0] + 70) : mt.soc;
    // Five waiting stakes along the climb: three on the green slope, two on the trail to the flag.
    const ghosts = (() => {
      if (!empty || !mt.trail) return [];
      const at = (pts: ReadonlyArray<readonly [number, number]>, t: number) => {
        const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
        let d = t * lens.reduce((a, b) => a + b, 0);
        for (let i = 0; i < lens.length; i++) {
          if (d <= lens[i]) { const f = d / lens[i]; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f] as const; }
          d -= lens[i];
        }
        return pts[pts.length - 1];
      };
      const tr = mt.trail.slice(1);
      return [at(mt.ridgeLine, .4), at(mt.ridgeLine, .7), at(mt.ridgeLine, .97), at(tr, .45), at(tr, .8)];
    })();
    const dots = trailDots(mt.trail, mt.apex);
    const lk = mt.latestIdx;

    // The speech bubble sits left of the latest stake (above Sóc when the flag is reached), clear of stakes, card and slope.
    let bubbleBox: { right: number; top: number } | null = null;
    if (bubble && soc) {
      const len = textLen(bubble), bw = Math.min(280, len * 6.4 + 30), bh = 26 + Math.ceil(len * 6.4 / 250) * 16;
      if (lk < 0) {
        bubbleBox = { right: soc[0] + 30, top: Math.max(14, soc[1] - 120) };
      } else {
        const right = mt.xs[lk] - 40;
        const avoid: Rect[] = [CARD_BOX, { x: W - 210, y: 14, w: 200, h: 50 }, ...T.map((p, k) => { const up = mt.poles[k] + (p.retake ? 54 : 30); return { x: mt.xs[k] - 28, y: mt.ys[k] - up, w: 56, h: up + 8 }; })];
        bubbleBox = { right, top: placeBubble(mt.ridgeAt, right, bw, bh, mt.ys[lk] - mt.poles[lk] - 76 - (bh - 42), avoid) };
      }
    }
    const tipK = hover !== null && hover < n ? hover : null;

    return (<>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Điểm ${METRIC_LABEL[metric]} qua ${n} đề gần nhất, mục tiêu ${target}`}>
        <defs>
          <linearGradient id="jm-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfeaff" /><stop offset=".7" stopColor="#fdf3e3" /></linearGradient>
          <linearGradient id="jm-mt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fd18c" /><stop offset="1" stopColor="#3f9a54" /></linearGradient>
          <linearGradient id="jm-pk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9fb7d9" /><stop offset="1" stopColor="#7d95bd" /></linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#jm-sky)" />
        <circle cx={W * .58} cy="110" r="80" fill="#fff3c4" opacity=".35" /><circle cx={W * .58} cy="110" r="46" fill="#fff3c4" />
        {/* far hills, clouds and birds are drawn on the reference width and stretched across the scene */}
        <g transform={`scale(${sx} 1)`}>
          <path d={`M0 470 L120 380 L220 430 L360 320 L470 400 L560 350 L640 410 L760 300 L860 380 L${W0} 330 L${W0 + 300} 360 V${H} H0Z`} fill="#d6e6f5" />
          <path d={`M0 540 L160 450 L300 510 L420 440 L540 500 V${H} H0Z`} fill="#c4dcef" />
          <g className="jr-cloud" style={{ '--x': '46px', '--t': '46s' } as CSSProperties} fill="#fff" opacity=".95"><ellipse cx="500" cy="210" rx="56" ry="15" /><ellipse cx="530" cy="198" rx="32" ry="17" /></g>
          <g className="jr-cloud" style={{ '--x': '-38px', '--t': '58s' } as CSSProperties} fill="#fff" opacity=".9"><ellipse cx="170" cy="452" rx="46" ry="12" /><ellipse cx="192" cy="443" rx="26" ry="14" /></g>
          <g className="jr-bird" style={{ '--t': '70s', '--d': '-30s' } as CSSProperties} fill="none" stroke="#6b7a90" strokeWidth="2" strokeLinecap="round"><path d="M720 150 q7 -7 14 0 q7 -7 14 0" /><path d="M760 128 q5 -5 10 0 q5 -5 10 0" /></g>
        </g>

        {/* snowy peak = the target */}
        <path d={`M${lastX(W) - 120} ${H} L${ax} ${ay} L${ax + 258} ${H}Z`} fill="url(#jm-pk)" />
        <path d={`M${ax} ${ay} L${ax + 258} ${H} L${ax + 50} ${H}Z`} fill="#6f87b0" opacity=".55" />
        <path d={`M${ax - 46} ${ay + 58} L${ax} ${ay} L${ax + 48} ${ay + 60} L${ax + 30} ${ay + 52} L${ax + 16} ${ay + 66} L${ax} ${ay + 50} L${ax - 14} ${ay + 64} L${ax - 28} ${ay + 50}Z`} fill="#fff" />
        <g transform={`translate(${ax} ${ay})`}>
          <line x1="0" y1="0" x2="0" y2="-62" stroke="#3a463e" strokeWidth="4" strokeLinecap="round" />
          <g className="jr-cloth"><path d="M2 -62 Q30 -66 52 -56 Q30 -46 2 -40Z" fill="#ff7a9c" /><text x="24" y="-47" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">{target}</text></g>
        </g>
        {sparkle('s1', ax - 70, ay - 30, 10, 0)}{sparkle('s2', ax + 64, ay + 10, 7, 1.2)}{sparkle('s3', ax + 86, ay - 40, 6, 2.1)}

        {/* the mountain: its ridge, from the scene's left edge, is the score line */}
        <g className="jr-reveal" style={{ '--t': `${DRAW_SECONDS}s` } as CSSProperties}>
          <path d={`M${ridgePath(mt.ridge)} V${H} H0Z`} fill="url(#jm-mt)" />
          {mt.onRidge.slice(1).map((idx, k) => {
            const a = mt.onRidge[k];
            const [bx, by] = [mt.xs[idx], mt.ys[idx]], [axx, ayy] = [mt.xs[a], mt.ys[a]];
            return k % 2 === 0 ? <path key={idx} d={`M${axx} ${ayy} L${bx} ${by} L${bx} ${by + 90} L${axx} ${ayy + 80}Z`} fill="#fff" opacity=".08" /> : null;
          })}
          {soc && mt.ridgeLine.length > 0 && (() => { const tl = mt.ridgeLine[mt.ridgeLine.length - 1]; return <path d={`M${tl[0]} ${tl[1]} L${mt.ridge[mt.ridge.length - 3][0]} ${mt.ridge[mt.ridge.length - 3][1]} L${mt.ridge[mt.ridge.length - 2][0]} ${mt.ridge[mt.ridge.length - 2][1]} L${tl[0] + 120} ${H} L${tl[0] - 20} ${H}Z`} fill="#2f7d43" opacity=".35" />; })()}
        </g>
        <g className="jr-reveal" style={{ '--t': `${DRAW_SECONDS}s` } as CSSProperties}>{slopePines.map((p, i) => pine('sp' + i, p.x, p.y, .8 - i * .03, '#2f8a42'))}</g>
        {dots.length > 0 && <g className="jr-trail">{dots.map((d, i) => <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r="2.4" fill={d.snow ? '#a9b6c9' : '#fff'} opacity={d.snow ? 1 : .8} />)}</g>}
        {!empty && mt.ridgeLine.length > 1 && [['#fff', 10], ['#ffc83d', 6]].map(([c, w]) => (
          <path key={c} className="jr-ridge" pathLength="1" style={{ '--t': `${DRAW_SECONDS * (lineTo - lineFrom)}s`, '--d': `${DRAW_SECONDS * lineFrom}s` } as CSSProperties} d={`M${ridgePath(mt.ridgeLine)}`} fill="none" stroke={c as string} strokeWidth={w as number} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* meadow, pines, dates */}
        <path transform={`scale(${sx} 1)`} d={`M0 ${H - 50} Q260 ${H - 86} 560 ${H - 56} T${W0} ${H - 66} L${W0 + 300} ${H - 66} V${H} H0Z`} fill="#5bb46b" />
        {[[60, H - 48, 1, '#3f9a54'], [140, H - 62, .9, '#3f9a54'], [W - 150, H - 52, 1, '#3f9a54'], [W - 96, H - 40, 1.2, '#2f8a42'], [W - 210, H - 30, 1, '#2f8a42']].map(([x, y, s, c], i) => pine('gp' + i, x as number, y as number, s as number, c as string))}
        {groups.map(g => {
          const x1 = mt.xs[g.from], x2 = mt.xs[g.to], cx = (x1 + x2) / 2, many = g.to > g.from;
          const isLast = g.to === n - 1;
          return (
            <g key={g.from}>
              {many && <path d={`M${x1} ${H - 46} V${H - 40} H${x2} V${H - 46}`} fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2" />}
              <text x={cx} y={dateY - (many ? 6 : 0)} fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle" opacity={isLast ? 1 : .92}>{ddmm(T[g.from].date)}</text>
              {many && <text x={cx} y={dateY + 9} fontWeight="800" fontSize="11.5" fill="#fff" opacity=".9" textAnchor="middle">{g.to - g.from + 1} đề cùng ngày</text>}
            </g>
          );
        })}
        {hidden > 0 && (
          <g className="jr-click" role="button" tabIndex={0} onClick={onShowTests} onKeyDown={e => { if (e.key === 'Enter') onShowTests(); }}>
            <rect x={mt.xs[0] - 112} y={H - 46} width="74" height="28" rx="14" fill="#fff" /><text x={mt.xs[0] - 75} y={H - 27} fontWeight="900" fontSize="13" fill="#2f8a42" textAnchor="middle">+{hidden} đề</text>
          </g>
        )}

        {/* stakes: one per test, the latest one in gold */}
        {T.map((p, k) => {
          const x = mt.xs[k], y = mt.ys[k], pole = mt.poles[k], out = p.excluded, gold = k === lk;
          const delay = 0.15 + DRAW_SECONDS * frac(x);
          const step = k > 0 ? p.score - T[k - 1].score : 0;
          const top = -pole - (gold ? 26 : 22);
          return (
            <g key={p.id} transform={`translate(${x} ${y})`} className="jr-pt" data-guide={gold ? 'journey' : undefined} data-guide-avoid={gold ? undefined : 'journey'} role="button" tabIndex={0} aria-label={`${ddmm(p.date)} · ${p.testName}: ${p.score}`}
              onClick={() => onOpenTest(p.id)} onKeyDown={e => { if (e.key === 'Enter') onOpenTest(p.id); }}
              onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(h => (h === k ? null : h))} onFocus={() => setHover(k)} onBlur={() => setHover(h => (h === k ? null : h))}>
              <rect x={-28} y={top - (p.retake ? 28 : 4)} width="56" height={pole + 34 + (p.retake ? 28 : 4) - (gold ? 0 : 4)} fill="transparent" />
              <g className="jr-drop" style={{ '--d': `${delay}s` } as CSSProperties}>
                <g className="jr-board">
                  <line x1="0" y1="2" x2="0" y2={-pole} stroke={out ? '#a89a8a' : '#8a5a36'} strokeWidth="4" strokeLinecap="round" strokeDasharray={out ? '2 7' : undefined} />
                  {gold
                    ? <rect x="-26" y={top} width="52" height="26" rx="7" fill="#ffc83d" stroke="#d99a00" strokeWidth="2.5" />
                    : <rect x="-22" y={top} width="44" height="22" rx="6" fill={out ? '#fff' : '#c98b4e'} stroke={out ? '#a3aba5' : '#9e6634'} strokeWidth="2" strokeDasharray={out ? '4 3' : undefined} />}
                  <text y={top + (gold ? 19 : 15.5)} fontWeight="900" fontSize={gold ? 15.5 : 13.5} fill={gold ? '#5a3d00' : out ? '#8a948c' : '#fff'} textAnchor="middle">{p.score}</text>
                  {p.retake && <g><rect x="-26" y={top - 26} width="52" height="20" rx="10" fill="#efeaff" /><text y={top - 12} fontWeight="900" fontSize="11.5" fill="#6a4fd0" textAnchor="middle">làm lại</text></g>}
                </g>
              </g>
              {k > 0 && step !== 0 && !out && <text className={'jr-pop' + (step < 0 ? ' is-dn' : '')} style={{ '--d': `${delay + .5}s` } as CSSProperties} y={top - (p.retake ? 34 : 9)} textAnchor="middle">{step > 0 ? '+' : '−'}{Math.abs(step)}</text>}
            </g>
          );
        })}
        {T.map((p, k) => {
          if (!p.excluded) return null;
          const x = mt.xs[k], y = mt.ys[k], above = y < mt.ridgeAt(x), py = above ? y - mt.poles[k] - 56 - (p.retake ? 24 : 0) : y + 14;
          return (
            <g key={'f' + p.id} className="jr-click" role="button" tabIndex={0} onClick={() => force(p.id)} onKeyDown={e => { if (e.key === 'Enter') force(p.id); }}>
              <rect x={x - 62} y={py} width="124" height="26" rx="13" fill="#fff" stroke="#d5dcd6" strokeWidth="2" />
              <text x={x} y={py + 18} fontWeight="900" fontSize="12.5" fill="#1c8fe3" textAnchor="middle">Vẫn tính đề này</text>
            </g>
          );
        })}

        {empty && soc && (
          <g transform={`translate(${soc[0] - 96} ${soc[1] - 62})`} aria-hidden="true">
            <path d="M8 62 L52 6 L96 62Z" fill="#ff9a4d" /><path d="M52 6 L52 62 L38 62Z" fill="#e57a2e" /><path d="M44 62 L52 34 L60 62Z" fill="#7a3f12" />
            <line x1="52" y1="6" x2="52" y2="-10" stroke="#7a5130" strokeWidth="3" /><path d="M53 -10 L68 -5 L53 0Z" fill="#ffc83d" />
          </g>
        )}
        {ghosts.map(([gx, gy], k) => {
          const first = k === 0, label = first ? '+ Đề 1' : `Đề ${k + 1}`, w = first ? 64 : 52;
          return (
            <g key={'g' + k} transform={`translate(${gx} ${gy})`} className={first && onLog ? 'jr-click' : undefined} role={first && onLog ? 'button' : undefined}
              tabIndex={first && onLog ? 0 : undefined} aria-label={first ? 'Ghi điểm đề đầu tiên' : undefined}
              onClick={first ? onLog : undefined} onKeyDown={first && onLog ? e => { if (e.key === 'Enter') onLog(); } : undefined}>
              <line x1="0" y1="2" x2="0" y2="-26" stroke={first ? '#d99a00' : '#b9b2d8'} strokeWidth="3" strokeDasharray={first ? undefined : '3 4'} strokeLinecap="round" />
              <rect x={-w / 2} y="-52" width={w} height="26" rx="8" fill={first ? '#fff7d6' : 'rgba(255,255,255,.8)'} stroke={first ? '#ffc83d' : '#b9b2d8'} strokeWidth="2" strokeDasharray={first ? undefined : '4 3'} />
              <text y="-34" fontWeight="900" fontSize="13" fill={first ? '#a06a00' : '#8a7aa0'} textAnchor="middle">{label}</text>
            </g>
          );
        })}

        {/* exam signpost */}
        {examIn !== null && (
          <g transform={`translate(${W - 70} ${FLOOR - 88})`}>
            <rect x="-4" y="0" width="8" height="92" fill="#8a5a36" />
            <path d="M-58 -6 H46 L60 16 L46 38 H-58Z" fill="#c98b4e" stroke="#9e6634" strokeWidth="3" />
            <text x="-4" y="14" fontWeight="900" fontSize="14" fill="#fff" textAnchor="middle">Thi {ddmm(profile.examDate)}</text>
            <text x="-4" y="31" fontWeight="800" fontSize="11.5" fill="#fff3dc" textAnchor="middle">{examIn === 0 ? 'thi hôm nay' : `còn ${examIn} ngày`}</text>
          </g>
        )}
      </svg>

      {soc && <span className="jr-soc-pos jr-soc-in" style={{ left: soc[0] - SOC_W / 2, top: soc[1] - SOC_H + 2, width: SOC_W }}><span className="jr-soc-b"><Soc state="hi" size={SOC_W} /></span></span>}
      {bubble && bubbleBox && <div className="jr-bubble jr-soc-in" style={{ right: W - bubbleBox.right, top: bubbleBox.top }}>{bubble}</div>}
      {tipK !== null && (() => {
        const p = T[tipK], d = tipK > 0 ? p.score - T[tipK - 1].score : null;
        return <div className="jr-tip" role="tooltip" style={{ left: mt.xs[tipK], top: mt.ys[tipK] - mt.poles[tipK] - (p.retake ? 58 : 34) - (tipK === lk ? 6 : 0) }}>{ddmm(p.date)} · {p.score} · {deltaText(d)}{p.retake ? ' · làm lại' : ''}</div>;
      })()}

      <div className="jr-chip" role="group" aria-label="Xem điểm">
        {(['total', 'listening', 'reading'] as ScoreMetric[]).map(m => (
          <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}>{METRIC_LABEL[m]}</button>
        ))}
      </div>
    </>);
  };

  return (
    <SceneStage height={H} minWidth={MIN_SCENE_W} className="jr-mtn">{W => (<>
      {scene(W)}
      <div className="jr-card">
        <small className="jr-kick">Mình có kịp không?</small>
        <h2>{headline}</h2>
        {latest ? (
          <>
            <div className="jr-big">{latest.score}<span>/{METRIC_MAX[metric]} · {ddmm(latest.date)}</span></div>
            <div className="jr-pillrow">
              {delta === null ? <span className="jr-pill">Đề đầu tiên của bạn</span>
                : delta > 0 ? <span className="jr-pill is-up">▲ {delta} so với đề trước</span>
                : delta < 0 ? <span className="jr-pill is-dn">▼ {-delta} so với đề trước</span>
                : <span className="jr-pill">Bằng đề trước</span>}
            </div>
            <div className="jr-rows">
              <div className="jr-r">Nghe <span>{latest.listening ?? '–'}</span></div>
              <div className="jr-r">Đọc <span>{latest.reading ?? '–'}</span></div>
              {first && first.id !== latest.id && <div className="jr-r">Tăng từ đề đầu <span className={latest.score - first.score >= 0 ? 'is-up' : 'is-dn'}>{latest.score - first.score >= 0 ? '+' : '−'}{Math.abs(latest.score - first.score)}</span></div>}
              {metric !== 'total' && <p className="jr-note">Mình chia mục tiêu {profile.targetScore} theo điểm hiện tại của bạn: Nghe {split.listening}, Đọc {split.reading}.</p>}
            </div>
          </>
        ) : (
          <><small className="jr-lbl">Mục tiêu</small><div className="jr-big">{target}<span>/{METRIC_MAX[metric]}</span></div>
            {onLog && <button type="button" className="rd-btn jr-first" onClick={onLog}>+ Ghi điểm đề</button>}</>
        )}
      </div>
    </>)}</SceneStage>
  );
}
