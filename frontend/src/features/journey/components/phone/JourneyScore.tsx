import { useMemo, useState, type CSSProperties } from 'react';
import type { StudySession, UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { DEFAULT_LIMIT, daysUntil, journeySeries, splitTarget, type ScoreMetric } from '../../lib/scoreJourney';
import { pointsToGo } from '../../lib/mountainScene';
import { ddmm } from '../../lib/journeyData';
import { emptyClimb, phoneMountain, polyAt, type Pt } from '../../lib/phoneJourney';
import { useSize } from './useSize';

interface Props {
  sessions: StudySession[];
  profile: UserProfile;
  today: string;
  onOpenTest: (id: string) => void;
  onLog: () => void;
}

const LABEL: Record<ScoreMetric, string> = { total: 'Tổng', listening: 'Nghe', reading: 'Đọc' };
const line = (pts: readonly Pt[]) => pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');

const pine = (key: string, x: number, y: number, s = 1) => (
  <g key={key} transform={`translate(${x} ${y}) scale(${s})`}><rect x="-2" y="0" width="4" height="8" fill="#7a5130" /><path d="M0 -28 L11 0 H-11Z" fill="#2f8a42" /></g>
);

/** Điểm số on phones (mock-phone-journey.html, "Bản bớt chữ" + "Khi chạm"): a vertical mountain of score flags and one panel. */
export function JourneyScore({ sessions, profile, today, onOpenTest, onLog }: Props) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [metric, setMetric] = useState<ScoreMetric>('total');
  const [pick, setPick] = useState<string | null>(null);
  const split = useMemo(() => splitTarget(profile.targetScore, sessions), [profile.targetScore, sessions]);
  const target = metric === 'total' ? profile.targetScore : split[metric];
  const T = useMemo(() => journeySeries(sessions, { limit: DEFAULT_LIMIT, metric }).points, [sessions, metric]);
  const n = T.length;
  const m = useMemo(() => phoneMountain(T, target, metric, w, h), [T, target, metric, w, h]);
  const empty = useMemo(() => emptyClimb(w, h), [w, h]);
  const examIn = daysUntil(profile.examDate, today);

  const latestIdx = m.latestIdx >= 0 ? m.latestIdx : n - 1;
  const selIdx = pick ? T.findIndex(p => p.id === pick) : -1;
  const shownIdx = selIdx >= 0 && selIdx !== latestIdx ? selIdx : latestIdx;
  const sel = shownIdx !== latestIdx ? T[shownIdx] : null;
  const p = T[shownIdx];
  const delta = p && shownIdx > 0 ? p.score - T[shownIdx - 1].score : null;
  const togo = pointsToGo(T, target);
  const pre = metric === 'total' ? '' : `${LABEL[metric]}: `;
  const dx = n > 1 ? m.xs[1] - m.xs[0] : 46;

  const ridgePts: Pt[] = n ? (m.ridge.length ? m.ridge : [[w * .4, m.base]]) : empty.ridge;
  const [ax, ay] = n ? m.apex : empty.apex;
  const last = ridgePts[ridgePts.length - 1], first = ridgePts[0];
  const body = `M-20 ${h} L-20 ${Math.min(h, first[1] + 90)} L${first[0] - 80} ${Math.min(h, first[1] + 50)} L${line(ridgePts)} L${last[0] + 26} ${last[1] + 40} L${last[0] + 62} ${h}Z`;

  const campY = polyAt(empty.ridge, empty.camp[0]);
  const socPos: Pt = n ? [m.xs[latestIdx] - 54, m.ys[latestIdx] - 50] : [empty.camp[0] + 18, polyAt(empty.ridge, empty.camp[0] + 40) - 40];
  const deltaPill = delta !== null && delta !== 0 && <i className={'jp-dl' + (delta < 0 ? ' is-dn' : '')}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</i>;
  const examText = examIn !== null && <span className="jp-sub">Thi {ddmm(profile.examDate)} · {examIn === 0 ? 'hôm nay' : `${examIn} ngày`}</span>;

  return (
    <div ref={ref} className="jp-scene is-score">
      <svg className="jp-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <defs><linearGradient id="jp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfe9fb" /><stop offset="1" stopColor="#eaf6ff" /></linearGradient></defs>
        <rect width={w} height={h} fill="url(#jp-sky)" />
        <circle cx={w * .59} cy={Math.max(ay + 70, 250)} r="54" fill="#fff6cf" opacity=".9" />
        <path d={`M-20 ${m.base + 10} L90 ${m.base - 120} L190 ${m.base - 10} L260 ${m.base - 100} L${w + 30} ${m.base + 20} V${h} H-20Z`} fill="#bcd4ea" />
        <path d={`M${ax - 66} ${h} L${ax - 20} ${ay + 22} L${ax} ${ay} L${ax + 22} ${ay + 26} L${ax + 84} ${h}Z`} fill="#7d9ccc" />
        <path d={`M${ax - 24} ${ay + 40} L${ax} ${ay} L${ax + 20} ${ay + 34} L${ax + 8} ${ay + 38} L${ax - 2} ${ay + 30} L${ax - 8} ${ay + 42}Z`} fill="#fff" />
        <line x1={ax} y1={ay + 4} x2={ax} y2={ay - 40} stroke="#2f3a33" strokeWidth="3" strokeLinecap="round" />
        <path d={`M${ax + 1} ${ay - 40} L${ax + 33} ${ay - 32} L${ax + 1} ${ay - 22}Z`} fill="#ff5c86" />
        <text x={ax + 14} y={ay - 29} fontSize="9" fontWeight="900" fill="#fff" textAnchor="middle">{target}</text>
        <path d={body} fill="#5fbf6e" />
        <path d={`M${last[0]} ${last[1] + 4} Q${last[0] + 14} ${last[1] - 6} ${last[0] + 26} ${last[1] + 40} L${last[0] + 62} ${h} L${last[0] - 10} ${h}Z`} fill="#4fae5e" opacity=".7" />
        {pine('p1', w * .15, m.base + 4)}{pine('p2', w * .38, m.base + 34)}{pine('p3', w * .56, m.base + 24, 1.1)}{pine('p4', w * .82, m.base + 40)}
        <path d={`M-20 ${h} L-20 ${h - 52} Q${w * .38} ${h - 90} ${w + 20} ${h - 48} V${h}Z`} fill="#4caa5c" />
        {m.trail.length > 0 && <path d={`M${line(m.trail)}`} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />}
        {n > 1 && <path d={`M${line(m.ridge)}`} fill="none" stroke="#ffc83d" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />}
        {n === 0 && <path d={`M${line(empty.ridge)}`} fill="none" stroke="#ffc83d" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" opacity=".55" strokeDasharray="1 10" />}
        {n === 0 && (
          <g transform={`translate(${empty.camp[0] - 34} ${campY - 40})`}>
            <path d="M4 42 L34 4 L64 42Z" fill="#ff9a4d" /><path d="M34 4 L34 42 L24 42Z" fill="#e57a2e" /><path d="M29 42 L34 24 L39 42Z" fill="#7a3f12" />
            <line x1="34" y1="4" x2="34" y2="-8" stroke="#7a5130" strokeWidth="2.5" /><path d="M35 -8 L46 -4 L35 0Z" fill="#ffc83d" />
          </g>
        )}
      </svg>

      {n === 0 && empty.stakes.map(([x, y], k) => {
        const style = { left: x, top: y } as CSSProperties;
        return k === 0
          ? <button key={k} type="button" className="jp-sign is-ghost is-first" style={style} aria-label="Ghi điểm đề đầu tiên" onClick={onLog}><b>+ Đề 1</b></button>
          : <span key={k} className="jp-sign is-ghost" style={style} aria-hidden="true"><b>Đề {k + 1}</b></span>;
      })}

      {T.map((pt, k) => {
        const cls = 'jp-sign' + (k === latestIdx ? ' is-now' : '') + (sel && k === shownIdx ? ' is-sel' : '') + (pt.excluded ? ' is-out' : '');
        return (
          <button key={pt.id} type="button" className={cls} data-guide={k === latestIdx ? 'journey' : undefined} style={{ left: m.xs[k], top: m.ys[k], '--hit': `${Math.max(34, Math.min(48, dx))}px` } as CSSProperties}
            aria-label={`${ddmm(pt.date)} · ${pt.testName}: ${pt.score}`} aria-pressed={sel ? k === shownIdx : k === latestIdx}
            onClick={() => setPick(k === latestIdx ? null : pt.id)}><b>{pt.score}</b></button>
        );
      })}

      <span className="jp-soc" style={{ left: socPos[0], top: socPos[1] }}><Soc state={n === 0 ? 'think' : 'idle'} size={46} /></span>

      <div className="jp-chips" role="group" aria-label="Xem điểm">
        {(['total', 'listening', 'reading'] as ScoreMetric[]).map(k => (
          <button key={k} type="button" aria-pressed={metric === k} onClick={() => { setMetric(k); setPick(null); }}>{LABEL[k]}</button>
        ))}
      </div>

      <div className="jp-panel">
        {!p ? (
          <>
            <div className="jp-panel__row"><div className="jp-big">{target}</div>{examText}</div>
            <p className="jp-say">{pre}{pre ? 'ghi' : 'Ghi'} đề đầu tiên để cắm cọc đầu tiên trên núi</p>
          </>
        ) : sel ? (
          <>
            <div className="jp-panel__row">
              <div className="jp-big">{sel.score}</div>{deltaPill}
              <span className="jp-sub">{sel.testName} · {ddmm(sel.date)}</span>
              <button type="button" className="jp-x" aria-label="Quay lại đề mới nhất" onClick={() => setPick(null)}>×</button>
            </div>
            <div className="jp-panel__row is-2">
              <span className="jp-lr">Nghe <b>{sel.listening ?? '–'}</b></span><span className="jp-lr">Đọc <b>{sel.reading ?? '–'}</b></span>
              <button type="button" className="jp-link" onClick={() => onOpenTest(sel.id)}>Xem đề ›</button>
            </div>
          </>
        ) : (
          <>
            <div className="jp-panel__row">
              <div className="jp-big">{p.score}</div>{deltaPill}
              {delta === 0 && <i className="jp-dl is-flat">bằng đề trước</i>}
              {delta === null && <i className="jp-dl is-flat">đề đầu tiên</i>}
              {examText}
            </div>
            <p className="jp-say">
              {m.reached ? <>{pre}bạn đã cắm cờ <b>{target}</b>, giữ phong độ nhé</> : <>{pre}{pre ? 'còn' : 'Còn'} <em>{togo} điểm</em> nữa là cắm cờ {target}</>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
