import { useMemo, useState, type ReactNode } from 'react';
import type { StudySession, UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { DEFAULT_LIMIT, GHOST_SLOTS, daysUntil, forecast, journeySeries, splitTarget, yGuides, type ScoreMetric } from '../lib/scoreJourney';
import { ddmm } from '../lib/journeyData';

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

/** Điểm số tab (design/previews/mock-journey-score2.html): x-axis by test, last 8, forecast pin and exam flag. */
export function ScoreTab({ sessions, profile, today, onOpenTest, onShowTests }: Props) {
  const [metric, setMetric] = useState<ScoreMetric>('total');
  const [forced, setForced] = useState<string[]>(readForced);
  const split = useMemo(() => splitTarget(profile.targetScore, sessions), [profile.targetScore, sessions]);
  const target = metric === 'total' ? profile.targetScore : split[metric];
  const series = useMemo(() => journeySeries(sessions, { limit: DEFAULT_LIMIT, metric, forceInclude: forced }), [sessions, metric, forced]);
  const T = series.points, hidden = series.hiddenCount, n = T.length;
  const fc = useMemo(() => forecast(T, target, profile.examDate, today, { metric }), [T, target, profile.examDate, today, metric]);
  const rising = fc && fc.kind === 'rising' ? fc : null;
  const ys = yGuides(T, target, { forecastScore: rising?.inView ? rising.score : null, metric });
  const examIn = daysUntil(profile.examDate, today);
  const prefix = metric === 'total' ? '' : `${METRIC_LABEL[metric]}: `;

  const force = (id: string) => {
    const next = [...new Set([...forced, id])];
    setForced(next);
    try { localStorage.setItem(FORCE_KEY, JSON.stringify(next)); } catch { /* Kept for this visit only. */ }
  };

  let headline: string;
  if (n === 0) headline = 'Ghi đề đầu tiên để vẽ hành trình';
  else if (fc?.kind === 'reached') headline = `${prefix}bạn đã chạm ${target}, giữ phong độ nhé`;
  else if (rising?.inView) headline = `${prefix}khoảng ${rising.testsAhead} đề nữa bạn chạm ${target}`;
  else if (rising?.atExam) headline = `${prefix}theo đà này, ngày thi bạn khoảng ${rising.atExam}`;
  else if (rising) headline = `${prefix}bạn đang lên khoảng ${Math.round(rising.slopePerTest)} điểm mỗi đề`;
  else if (n < 2) headline = `${prefix}ghi thêm một đề nữa để thấy đà của bạn`;
  else headline = `${prefix}điểm đang chững, xem Part nào kéo điểm lại nhé`;
  headline = headline.charAt(0).toUpperCase() + headline.slice(1);

  // Geometry of the 1064×620 sketch scene.
  const x0 = hidden ? 180 : 110;
  const slot = (1010 - x0) / (Math.max(n, 1) + GHOST_SLOTS + 0.6);
  const X = (i: number) => x0 + i * slot;
  const Y = (s: number) => 400 - (s - ys.min) / Math.max(1, ys.max - ys.min) * 350;
  const end = Math.max(n - 1, 0) + GHOST_SLOTS;
  const flagX = X(end) + 96;
  const guideX = hidden ? 150 : 80;
  const targetLabel = metric === 'total' ? `Mục tiêu ${target}` : `Mục tiêu ${METRIC_LABEL[metric]} ${target}`;
  const best = n ? Math.max(...T.map(p => p.score)) : 0;
  const counted = T.filter(p => !p.excluded || p.forced);

  const dateLabels: ReactNode[] = [];
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && T[j + 1].sameDayGroup === T[i].sameDayGroup) j++;
    const cx = (X(i) + X(j)) / 2;
    if (j > i) dateLabels.push(<g key={i}><path d={`M${X(i)} 428 V434 H${X(j)} V428`} fill="none" stroke="#9fb3a5" strokeWidth="2" /><text x={cx} y="452" fontWeight="900" fontSize="13.5" fill="#3f5a45" textAnchor="middle">{ddmm(T[i].date)}</text><text x={cx} y="469" fontWeight="800" fontSize="12.5" fill="#7a857e" textAnchor="middle">{j - i + 1} đề cùng ngày</text></g>);
    else dateLabels.push(<text key={i} x={cx} y="446" fontWeight={i === n - 1 ? 900 : 800} fontSize="13.5" fill={i === n - 1 ? '#2f3a33' : '#5c6b60'} textAnchor="middle">{ddmm(T[i].date)}</text>);
    i = j + 1;
  }

  const latest = T[n - 1];
  const excludedShown = T.find(p => p.excluded && !p.forced);
  let bubble: ReactNode = 'Bấm vào một điểm để xem chi tiết đề đó.';
  if (metric !== 'total') bubble = <>Mình chia mục tiêu {profile.targetScore} theo điểm hiện tại của bạn: <b>Nghe {split.listening}, Đọc {split.reading}</b>.</>;
  else if (excludedShown) bubble = <>Đề {ddmm(excludedShown.date)} lệch hẳn so với các đề quanh nó nên mình chưa tính vào đà. Bấm <b>Vẫn tính đề này</b> nếu đó là điểm thật.</>;
  else if (latest?.retake) bubble = <>Đề {ddmm(latest.date)} là <b>đề làm lại</b>, bạn đã gặp câu hỏi rồi nên điểm có thể cao hơn thực tế một chút.</>;
  else if (hidden) bubble = <>Biểu đồ chỉ hiện {DEFAULT_LIMIT} đề gần nhất cho dễ nhìn. Bấm <b>+{hidden} đề</b> để xem hết.</>;

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
      <div className="jr-scene">
        <svg viewBox="0 0 1064 620" role="img" aria-label={`Điểm ${METRIC_LABEL[metric]} qua ${n} đề gần nhất`}>
          <path d="M0 520 Q200 495 420 515 T820 505 T1064 495 V620 H0Z" fill="#cdeed2" />
          <path d="M0 575 Q260 552 540 572 T1064 566 V620 H0Z" fill="#b6e3be" />
          {ys.ticks.map(v => <g key={v}><line x1={guideX} y1={Y(v)} x2="1010" y2={Y(v)} stroke="#2f3a33" strokeOpacity=".06" strokeWidth="2" /><text x={guideX - 8} y={Y(v) + 5} fontWeight="800" fontSize="12.5" fill="#9aa69d" textAnchor="end">{v}</text></g>)}
          {n > 0 && (ys.targetPinned
            ? <g><rect x="60" y="34" width="270" height="34" rx="17" fill="#fff" /><text x="195" y="57" fontWeight="900" fontSize="14.5" fill="#d9547a" textAnchor="middle">↑ {targetLabel}, còn {target - best} điểm</text></g>
            : <g><line x1="60" y1={Y(target)} x2={flagX} y2={Y(target)} stroke="#ff7a9c" strokeWidth="3" strokeDasharray="3 9" strokeLinecap="round" /><text x={guideX - 20} y={Y(target) - 10} fontWeight="900" fontSize="15" fill="#d9547a">{targetLabel}</text></g>)}
          {rising?.inView && (() => {
            const x = X(rising.slot), y = Y(rising.score), right = x > 950;
            return <g><circle cx={x} cy={y} r="11" fill="#fff" stroke="#ff7a9c" strokeWidth="5" /><rect x={x - (right ? 150 : 74)} y={y - 56} width="148" height="32" rx="16" fill="#2f3a33" /><text x={x - (right ? 76 : 0)} y={y - 35} fill="#fff" fontWeight="900" fontSize="14.5" textAnchor="middle">Chạm {target} ở đây</text><text x={x} y="446" fontWeight="900" fontSize="13.5" fill="#d9547a" textAnchor="middle">{rising.testsAhead} đề nữa</text></g>;
          })()}
          {examIn !== null && <g><line x1={flagX} y1="60" x2={flagX} y2="400" stroke="#5c675f" strokeWidth="5" strokeLinecap="round" /><path d={`M${flagX + 2} 62 L${flagX - 42} 78 L${flagX + 2} 94Z`} fill="#ff7a9c" /><rect x={flagX - 52} y="402" width="104" height="54" rx="16" fill="#ff7a9c" /><text x={flagX} y="425" fontWeight="900" fontSize="15" fill="#fff" textAnchor="middle">Thi {ddmm(profile.examDate)}</text><text x={flagX} y="444" fontWeight="800" fontSize="12.5" fill="#fff" textAnchor="middle" opacity=".9">{examIn === 0 ? 'hôm nay' : `còn ${examIn} ngày`}</text></g>}
          {n > 0 && <line x1={guideX} y1="420" x2={X(n - 1) + slot * 0.4} y2="420" stroke="#c9d6cc" strokeWidth="2" />}
          {hidden > 0 && <g className="jr-click" role="button" tabIndex={0} onClick={onShowTests} onKeyDown={e => { if (e.key === 'Enter') onShowTests(); }}><rect x="40" y="404" width="82" height="32" rx="16" fill="#fff" stroke="#d5dcd6" strokeWidth="2" /><text x="81" y="425" fontWeight="900" fontSize="13.5" fill="#5c675f" textAnchor="middle">+{hidden} đề</text></g>}
          {counted.length > 1 && <polyline points={T.map((p, i) => (!p.excluded || p.forced) ? `${X(i)},${Y(p.score)}` : '').filter(Boolean).join(' ')} fill="none" stroke="#ffc83d" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />}
          {dateLabels}
          {T.map((p, k) => {
            const last = k === n - 1, prev = T[k - 1], down = !!prev && p.score < prev.score, out = p.excluded && !p.forced;
            const ty = Y(p.score) + (down ? 32 : -20);
            return (
              <g key={p.id} className="jr-pt" role="button" tabIndex={0} aria-label={`${ddmm(p.date)} · ${p.testName}: ${p.score}`}
                onClick={() => onOpenTest(p.id)} onKeyDown={e => { if (e.key === 'Enter') onOpenTest(p.id); }}>
                <circle cx={X(k)} cy={Y(p.score)} r="22" fill="transparent" />
                <circle cx={X(k)} cy={Y(p.score)} r={last ? 13 : 10} fill={out ? '#fff' : last ? '#46b35a' : '#fff'} stroke={out ? '#a3aba5' : last ? '#fff' : '#d99a00'} strokeWidth="5" strokeDasharray={out ? '4 4' : undefined} />
                <text x={X(k)} y={ty} fontWeight="900" fontSize={last ? 21 : 16} fill={out ? '#8a948c' : '#2f3a33'} textAnchor="middle">{p.score}</text>
                {p.retake && <g><rect x={X(k) - 84} y={ty - 16} width="60" height="22" rx="11" fill="#efeaff" /><text x={X(k) - 54} y={ty - 1} fontWeight="900" fontSize="12" fill="#6a4fd0" textAnchor="middle">làm lại</text></g>}
              </g>
            );
          })}
          {T.map((p, k) => p.excluded && !p.forced ? (
            <g key={'f' + p.id} className="jr-click" role="button" tabIndex={0} onClick={() => force(p.id)} onKeyDown={e => { if (e.key === 'Enter') force(p.id); }}>
              <rect x={X(k) - 62} y={Y(p.score) + (T[k - 1] && p.score < T[k - 1].score ? 42 : -66)} width="124" height="26" rx="13" fill="#fff" stroke="#d5dcd6" strokeWidth="2" />
              <text x={X(k)} y={Y(p.score) + (T[k - 1] && p.score < T[k - 1].score ? 60 : -48)} fontWeight="900" fontSize="12.5" fill="#1c8fe3" textAnchor="middle">Vẫn tính đề này</text>
            </g>) : null)}
        </svg>
        <Soc state="idle" size={80} className="jr-soc" />
        <div className="jr-bub">{bubble}</div>
      </div>
    </div>
  );
}
