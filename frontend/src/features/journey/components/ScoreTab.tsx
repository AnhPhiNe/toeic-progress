import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { StudySession, UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { DEFAULT_LIMIT, daysUntil, forecast, journeySeries, splitTarget, type JourneyPoint, type ScoreMetric } from '../lib/scoreJourney';
import { FLOOR, SCENE_H as H, SCENE_W as W, X_LAST, buildMountain, dateGroups, pointsToGo } from '../lib/mountainScene';
import { ddmm } from '../lib/journeyData';
import { SceneStage } from './SceneStage';

interface Props {
  sessions: StudySession[];
  profile: UserProfile;
  today: string;
  onOpenTest: (id: string) => void;
  onShowTests: () => void;
}

const FORCE_KEY = 'rd_journey_force_v1';
const readForced = (): string[] => { try { return JSON.parse(localStorage.getItem(FORCE_KEY) || '[]'); } catch { return []; } };
const METRIC_LABEL: Record<ScoreMetric, string> = { total: 'Tổng', listening: 'Nghe', reading: 'Đọc' };
const METRIC_MAX: Record<ScoreMetric, number> = { total: 990, listening: 495, reading: 495 };
/** How long the ridge takes to draw on first show (see journey.css). */
const DRAW_SECONDS = 1.6;

const pine = (key: string, x: number, y: number, s = 1, c = '#3f9a54') => (
  <g key={key} transform={`translate(${x} ${y}) scale(${s})`}><rect x="-3" y="0" width="6" height="12" fill="#8a5a36" /><path d="M0 -40 L16 -12 H8 L20 4 H-20 L-8 -12 H-16Z" fill={c} /></g>
);
const sparkle = (key: string, x: number, y: number, r: number, delay: number) => (
  <path key={key} className="jr-spark" style={{ '--d': `${delay}s` } as CSSProperties} fill="#fff" d={`M${x} ${y - r} l${r * .3} ${r * .7} ${r * .7} ${r * .3} -${r * .7} ${r * .3} -${r * .3} ${r * .7} -${r * .3} -${r * .7} -${r * .7} -${r * .3} ${r * .7} -${r * .3}Z`} />
);

/** Điểm số tab (design/previews/mock-journey-score3.html, J1 "Leo núi tuyết"): the ridge of the mountain is the score line. */
export function ScoreTab({ sessions, profile, today, onOpenTest, onShowTests }: Props) {
  const [metric, setMetric] = useState<ScoreMetric>('total');
  const [forced, setForced] = useState<string[]>(readForced);
  const split = useMemo(() => splitTarget(profile.targetScore, sessions), [profile.targetScore, sessions]);
  const target = metric === 'total' ? profile.targetScore : split[metric];
  const series = useMemo(() => journeySeries(sessions, { limit: DEFAULT_LIMIT, metric, forceInclude: forced }), [sessions, metric, forced]);
  const everything = useMemo(() => journeySeries(sessions, { limit: 100000, metric, forceInclude: forced }).points, [sessions, metric, forced]);
  const T = series.points, hidden = series.hiddenCount, n = T.length;
  const fc = useMemo(() => forecast(T, target, profile.examDate, today, { metric }), [T, target, profile.examDate, today, metric]);
  const rising = fc && fc.kind === 'rising' ? fc : null;
  const examIn = daysUntil(profile.examDate, today);
  const mt = useMemo(() => buildMountain(T, target, metric), [T, target, metric]);
  const prefix = metric === 'total' ? '' : `${METRIC_LABEL[metric]}: `;
  const togo = pointsToGo(T, target);

  const force = (id: string) => {
    const next = [...new Set([...forced, id])];
    setForced(next);
    try { localStorage.setItem(FORCE_KEY, JSON.stringify(next)); } catch { /* Kept for this visit only. */ }
  };

  const sentence = (text: string) => prefix + (prefix ? text : text.charAt(0).toUpperCase() + text.slice(1));
  let headline: ReactNode;
  if (n === 0) headline = 'Ghi đề đầu tiên để vẽ hành trình';
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
  const sitPoint = mt.sitIdx >= 0 ? T[mt.sitIdx] : null;

  let bubble: ReactNode = null;
  if (n === 0) bubble = <>Ghi một đề là mình có <b>cọc đầu tiên</b> trên núi.</>;
  else if (mt.reached) bubble = <>Chạm đỉnh <b>{target}</b> rồi, cắm cờ thôi!</>;
  else if (excludedShown && latest && excludedShown.id === latest.id) bubble = <>Đề {ddmm(excludedShown.date)} lệch hẳn so với các đề quanh nó nên mình chưa tính vào đà. Bấm <b>Vẫn tính đề này</b> nếu đó là điểm thật.</>;
  else if (excludedShown) bubble = <>Đề {ddmm(excludedShown.date)} lệch hẳn nên mình chưa tính vào đà. Bấm <b>Vẫn tính đề này</b> nếu đó là điểm thật.</>;
  else if (sitPoint?.retake) bubble = <>Cọc mới nhất <b>{sitPoint.score}</b> là đề làm lại, điểm có thể cao hơn thực tế một chút.</>;
  else if (sitPoint && bestBefore === -Infinity) bubble = <>Cọc đầu tiên <b>{sitPoint.score}</b>, mình leo lên nhé!</>;
  else if (sitPoint && sitPoint.score > bestBefore) bubble = <>Cọc mới nhất <b>{sitPoint.score}</b>, cao nhất từ trước tới giờ!</>;
  else if (sitPoint && sitPoint.score === bestBefore) bubble = <>Cọc mới nhất <b>{sitPoint.score}</b>, bằng mức cao nhất từ trước tới giờ.</>;
  else if (sitPoint) bubble = <>Cọc mới nhất <b>{sitPoint.score}</b>, mình leo tiếp nhé!</>;

  // Draw-in timing: the ridge is revealed left to right, each stake drops when the line reaches it.
  // The reveal clip is measured on the whole 1068px scene (clip-path ... view-box), so progress is simply x / W.
  const frac = (x: number) => Math.max(0, Math.min(1, x / W));
  const lineFrom = mt.ridgeLine.length ? frac(mt.ridgeLine[0][0]) : 0;
  const lineTo = mt.ridgeLine.length ? frac(mt.ridgeLine[mt.ridgeLine.length - 1][0]) : 0;
  const ridgePath = (pts: ReadonlyArray<readonly [number, number]>) => pts.map(p => `${p[0]} ${p[1]}`).join(' L');
  const [ax, ay] = mt.apex;
  const slopePines = [420, 540, 660].map(x => ({ x, y: mt.ridgeAt(x) + 84 })).filter(p => p.y < H - 76 && p.y > mt.ridgeAt(p.x) + 40);
  const groups = dateGroups(T);
  const dateY = H - 20;
  const bubbleRight = (mt.soc ? mt.soc[0] + (mt.reached ? 10 : 34) : 800);
  const bubbleTop = mt.soc ? Math.max(14, mt.soc[1] - (mt.reached ? 118 : 160)) : 60;
  const last = mt.soc;

  return (
    <div>
      <div className="jr-hl">
        <div><small>Mình có kịp không?</small><h2>{headline}</h2></div>
        <div className="jr-seg" role="group" aria-label="Xem điểm">
          {(['total', 'listening', 'reading'] as ScoreMetric[]).map(m => (
            <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}>{METRIC_LABEL[m]}</button>
          ))}
        </div>
      </div>
      <SceneStage width={W} height={H} className="jr-mtn">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Điểm ${METRIC_LABEL[metric]} qua ${n} đề gần nhất, mục tiêu ${target}`}>
          <defs>
            <linearGradient id="jm-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfeaff" /><stop offset=".7" stopColor="#fdf3e3" /></linearGradient>
            <linearGradient id="jm-mt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7fd18c" /><stop offset="1" stopColor="#3f9a54" /></linearGradient>
            <linearGradient id="jm-pk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9fb7d9" /><stop offset="1" stopColor="#7d95bd" /></linearGradient>
          </defs>
          <rect width={W} height={H} fill="url(#jm-sky)" />
          <circle cx="620" cy="110" r="80" fill="#fff3c4" opacity=".35" /><circle cx="620" cy="110" r="46" fill="#fff3c4" />
          <path d={`M0 470 L120 380 L220 430 L360 320 L470 400 L560 350 L640 410 L760 300 L860 380 L${W} 330 V${H} H0Z`} fill="#d6e6f5" />
          <path d={`M0 540 L160 450 L300 510 L420 440 L540 500 V${H} H0Z`} fill="#c4dcef" />
          <g className="jr-cloud" style={{ '--x': '46px', '--t': '46s' } as CSSProperties} fill="#fff" opacity=".95"><ellipse cx="500" cy="210" rx="56" ry="15" /><ellipse cx="530" cy="198" rx="32" ry="17" /></g>
          <g className="jr-cloud" style={{ '--x': '-38px', '--t': '58s' } as CSSProperties} fill="#fff" opacity=".9"><ellipse cx="170" cy="452" rx="46" ry="12" /><ellipse cx="192" cy="443" rx="26" ry="14" /></g>
          <g className="jr-bird" style={{ '--t': '70s', '--d': '-30s' } as CSSProperties} fill="none" stroke="#6b7a90" strokeWidth="2" strokeLinecap="round"><path d="M720 150 q7 -7 14 0 q7 -7 14 0" /><path d="M760 128 q5 -5 10 0 q5 -5 10 0" /></g>

          {/* snowy peak = the target */}
          <path d={`M${X_LAST - 120} ${H} L${ax} ${ay} L${W + 120} ${H}Z`} fill="url(#jm-pk)" />
          <path d={`M${ax} ${ay} L${W + 120} ${H} L${ax + 50} ${H}Z`} fill="#6f87b0" opacity=".55" />
          <path d={`M${ax - 46} ${ay + 58} L${ax} ${ay} L${ax + 48} ${ay + 60} L${ax + 30} ${ay + 52} L${ax + 16} ${ay + 66} L${ax} ${ay + 50} L${ax - 14} ${ay + 64} L${ax - 28} ${ay + 50}Z`} fill="#fff" />
          <g transform={`translate(${ax} ${ay})`}>
            <line x1="0" y1="0" x2="0" y2="-62" stroke="#3a463e" strokeWidth="4" strokeLinecap="round" />
            <g className="jr-cloth"><path d="M2 -62 Q30 -66 52 -56 Q30 -46 2 -40Z" fill="#ff7a9c" /><text x="24" y="-47" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">{target}</text></g>
          </g>
          {sparkle('s1', ax - 70, ay - 30, 10, 0)}{sparkle('s2', ax + 64, ay + 10, 7, 1.2)}{sparkle('s3', ax + 86, ay - 40, 6, 2.1)}

          {/* the mountain: its ridge is the score line */}
          <g className="jr-reveal" style={{ '--t': `${DRAW_SECONDS}s` } as CSSProperties}>
            <path d={`M${ridgePath(mt.ridge)} V${H} H0Z`} fill="url(#jm-mt)" />
            {mt.onRidge.slice(1).map((idx, k) => {
              const a = mt.onRidge[k];
              const [bx, by] = [mt.xs[idx], mt.ys[idx]], [axx, ayy] = [mt.xs[a], mt.ys[a]];
              return k % 2 === 0 ? <path key={idx} d={`M${axx} ${ayy} L${bx} ${by} L${bx} ${by + 90} L${axx} ${ayy + 80}Z`} fill="#fff" opacity=".08" /> : null;
            })}
            {last && mt.ridgeLine.length > 0 && (() => { const tl = mt.ridgeLine[mt.ridgeLine.length - 1]; return <path d={`M${tl[0]} ${tl[1]} L${mt.ridge[mt.ridge.length - 3][0]} ${mt.ridge[mt.ridge.length - 3][1]} L${mt.ridge[mt.ridge.length - 2][0]} ${mt.ridge[mt.ridge.length - 2][1]} L${tl[0] + 120} ${H} L${tl[0] - 20} ${H}Z`} fill="#2f7d43" opacity=".35" />; })()}
          </g>
          <g className="jr-reveal" style={{ '--t': `${DRAW_SECONDS}s` } as CSSProperties}>{slopePines.map((p, i) => pine('sp' + i, p.x, p.y, .8 - i * .03, '#2f8a42'))}</g>
          {mt.trail && <path className="jr-trail" d={`M${ridgePath(mt.trail)}`} fill="none" stroke="#fff" strokeWidth="5" strokeDasharray="2 10" strokeLinecap="round" strokeLinejoin="round" />}
          {mt.ridgeLine.length > 1 && <path className="jr-ridge" pathLength="1" style={{ '--t': `${DRAW_SECONDS * (lineTo - lineFrom)}s`, '--d': `${DRAW_SECONDS * lineFrom}s` } as CSSProperties} d={`M${ridgePath(mt.ridgeLine)}`} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />}

          {/* meadow, pines, dates */}
          <path d={`M0 ${H - 50} Q260 ${H - 86} 560 ${H - 56} T${W} ${H - 66} V${H} H0Z`} fill="#5bb46b" />
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

          {/* stakes: one per test */}
          {T.map((p, k) => {
            const x = mt.xs[k], y = mt.ys[k], pole = mt.poles[k], out = p.excluded, sit = k === mt.sitIdx;
            const delay = 0.15 + DRAW_SECONDS * frac(x);
            return (
              <g key={p.id} transform={`translate(${x} ${y})`} className="jr-pt" role="button" tabIndex={0} aria-label={`${ddmm(p.date)} · ${p.testName}: ${p.score}`}
                onClick={() => onOpenTest(p.id)} onKeyDown={e => { if (e.key === 'Enter') onOpenTest(p.id); }}>
                <title>{`${ddmm(p.date)} · ${p.testName}: ${p.score}${p.retake ? ' (làm lại)' : ''}`}</title>
                <rect x={-26} y={sit ? -30 : -pole - 26} width="52" height={sit ? 40 : pole + 34} fill="transparent" />
                <g className="jr-drop" style={{ '--d': `${delay}s` } as CSSProperties}>
                  {!sit && (
                    <g className="jr-board">
                      <line x1="0" y1="2" x2="0" y2={-pole} stroke={out ? '#a89a8a' : '#8a5a36'} strokeWidth="4" strokeLinecap="round" strokeDasharray={out ? '2 7' : undefined} />
                      <rect x="-22" y={-pole - 22} width="44" height="22" rx="6" fill={out ? '#fff' : '#c98b4e'} stroke={out ? '#a3aba5' : '#9e6634'} strokeWidth="2" strokeDasharray={out ? '4 3' : undefined} />
                      <text y={-pole - 6.5} fontWeight="900" fontSize="13.5" fill={out ? '#8a948c' : '#fff'} textAnchor="middle">{p.score}</text>
                      {p.retake && <g><rect x="-26" y={-pole - 48} width="52" height="20" rx="10" fill="#efeaff" /><text y={-pole - 34} fontWeight="900" fontSize="11.5" fill="#6a4fd0" textAnchor="middle">làm lại</text></g>}
                    </g>
                  )}
                </g>
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

        {last && <span className="jr-soc-pos jr-soc-in" style={{ left: last[0] - 34, top: last[1] - 72 }}><span className="jr-soc-b"><Soc state="hi" size={66} /></span></span>}
        {bubble && <div className="jr-bubble jr-soc-in" style={{ right: W - bubbleRight, top: bubbleTop }}>{bubble}</div>}

        <div className="jr-stat">
          {latest ? (
            <>
              <div className="jr-st">
                <small>{metric === 'total' ? 'ĐIỂM GẦN NHẤT' : `ĐIỂM ${METRIC_LABEL[metric].toUpperCase()} GẦN NHẤT`} · {ddmm(latest.date)}</small>
                <div className="jr-big">{latest.score}<span>/{METRIC_MAX[metric]}</span></div>
                <div className="jr-pillrow">
                  {delta === null ? <span className="jr-pill">Đề đầu tiên của bạn</span>
                    : delta > 0 ? <span className="jr-pill is-up">▲ {delta} so với đề trước</span>
                    : delta < 0 ? <span className="jr-pill is-dn">▼ {-delta} so với đề trước</span>
                    : <span className="jr-pill">Bằng đề trước</span>}
                </div>
              </div>
              <div className="jr-st">
                <div className="jr-r">Nghe <span>{latest.listening ?? '–'}</span></div>
                <div className="jr-r">Đọc <span>{latest.reading ?? '–'}</span></div>
                {first && first.id !== latest.id && <div className="jr-r">Tăng từ đề đầu <span className={latest.score - first.score >= 0 ? 'is-up' : 'is-dn'}>{latest.score - first.score >= 0 ? '+' : '−'}{Math.abs(latest.score - first.score)}</span></div>}
                {metric !== 'total' && <p className="jr-note">Mình chia mục tiêu {profile.targetScore} theo điểm hiện tại của bạn: Nghe {split.listening}, Đọc {split.reading}.</p>}
              </div>
            </>
          ) : (
            <div className="jr-st"><small>MỤC TIÊU</small><div className="jr-big">{target}<span>/{METRIC_MAX[metric]}</span></div></div>
          )}
        </div>
      </SceneStage>
    </div>
  );
}

