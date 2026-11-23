import { useMemo, useState, type ReactNode } from 'react';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import type { StudySession, UserProfile } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { DEFAULT_LIMIT, forecast, journeySeries, splitTarget, type JourneyPoint, type ScoreMetric } from '../lib/scoreJourney';
import { MTN_H, MTN_W, verdict } from '../lib/summitTrail';
import { ddmm } from '../lib/journeyData';
import { SceneStage } from './SceneStage';
import { SummitScene } from './SummitScene';

interface Props {
  sessions: StudySession[];
  profile: UserProfile;
  today: string;
  onOpenTest: (id: string) => void;
  onShowTests: () => void;
  /** Opens the score logger (the empty card's button). */
  onLog?: () => void;
  gear?: readonly string[];
}

const FORCE_KEY = 'rd_journey_force_v1';
const forceKey = () => `${FORCE_KEY}:${getActiveAccountId() ?? 'guest'}`;
const readForced = (): string[] => { try { return JSON.parse(localStorage.getItem(forceKey()) || '[]'); } catch { return []; } };
export const METRIC_LABEL: Record<ScoreMetric, string> = { total: 'Tổng', listening: 'Nghe', reading: 'Đọc' };
export const METRIC_MAX: Record<ScoreMetric, number> = { total: 990, listening: 495, reading: 495 };

/** Score data shared by the desktop and phone Điểm số: the shown tests, the forecast, the card's answer. */
export function useSummitData(sessions: StudySession[], profile: UserProfile, today: string) {
  const [metric, setMetric] = useState<ScoreMetric>('total');
  const [forced, setForced] = useState<string[]>(readForced);
  const split = useMemo(() => splitTarget(profile.targetScore, sessions), [profile.targetScore, sessions]);
  const target = metric === 'total' ? profile.targetScore : split[metric];
  const series = useMemo(() => journeySeries(sessions, { limit: DEFAULT_LIMIT, metric, forceInclude: forced }), [sessions, metric, forced]);
  const everything = useMemo(() => journeySeries(sessions, { limit: 100000, metric, forceInclude: forced }).points, [sessions, metric, forced]);
  const T = series.points;
  const fc = useMemo(() => forecast(T, target, profile.examDate, today, { metric }), [T, target, profile.examDate, today, metric]);
  const counted = T.filter(p => !p.excluded);
  const latestIdx = counted.length ? T.indexOf(counted[counted.length - 1]) : -1;
  const latest: JourneyPoint | undefined = T[latestIdx >= 0 ? latestIdx : T.length - 1];
  const answer = verdict(T.length, fc, target, profile.examDate);
  const force = (id: string) => {
    const next = [...new Set([...forced, id])];
    setForced(next);
    try { localStorage.setItem(forceKey(), JSON.stringify(next)); } catch { /* Kept for this visit only. */ }
  };
  const prev = latest ? T[T.indexOf(latest) - 1] : undefined;
  const delta = latest && prev ? latest.score - prev.score : null;
  const first = everything[0];
  const bestBefore = latest ? Math.max(-Infinity, ...everything.slice(0, everything.findIndex(p => p.id === latest.id)).map(p => p.score)) : -Infinity;
  return { metric, setMetric, split, target, T, hidden: series.hiddenCount, fc, latestIdx, latest, answer, force, delta, first, bestBefore, counted: counted.length };
}

/** The sentence with the given parts (first occurrence of each, in order) in bold. */
function withBold(text: string, bold: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  bold.forEach((part, i) => {
    const at = rest.indexOf(part);
    if (at < 0) return;
    out.push(rest.slice(0, at), <b key={i}>{part}</b>);
    rest = rest.slice(at + part.length);
  });
  out.push(rest);
  return out;
}

/** Desktop card: "MÌNH CÓ KỊP KHÔNG?" with the answer, the latest score and its Nghe / Đọc. */
export function SummitCard({ data, phone, onLog, onShowTests, profileTarget }: { data: ReturnType<typeof useSummitData>; phone?: boolean; onLog?: () => void; onShowTests?: () => void; profileTarget: number }) {
  const { answer, latest, metric, delta, first, target, split, hidden } = data;
  const pill = delta === null ? <span className="sm-pill">Đề đầu tiên của bạn</span>
    : delta > 0 ? <span className="sm-pill is-up">▲ {delta} so với đề trước</span>
    : delta < 0 ? <span className="sm-pill is-dn">▼ {-delta} so với đề trước</span>
    : <span className="sm-pill">Bằng đề trước</span>;
  const grow = latest && first && first.id !== latest.id ? latest.score - first.score : null;
  const growText = grow === null ? null : <span className={grow >= 0 ? 'is-up' : 'is-dn'}>{grow >= 0 ? '+' : '−'}{Math.abs(grow)}</span>;
  let head: ReactNode;
  if (answer.title) head = <><h3 className={answer.kind === 'late' ? 'is-late' : undefined}>{answer.title}</h3><p>{withBold(answer.text, answer.bold ?? [])}</p></>;
  else head = <div className="sm-new"><Soc state="think" size={phone ? 36 : 42} /><h4>{answer.text}</h4></div>;
  return (
    <div className="sm-card">
      <small className="sm-kick">Mình có kịp không?</small>
      {head}
      {latest ? <>
        <div className="sm-big">{latest.score}<span>/{METRIC_MAX[metric]} · {ddmm(latest.date)}</span>{phone && pill}</div>
        {!phone && <div className="sm-pills">{pill}</div>}
        {phone
          ? <div className="sm-prow"><span>Nghe <b>{latest.listening ?? '–'}</b></span><span>Đọc <b>{latest.reading ?? '–'}</b></span>{growText && <span>Từ đề đầu <b>{growText}</b></span>}</div>
          : <div className="sm-rows">
            <div>Nghe <span>{latest.listening ?? '–'}</span></div>
            <div>Đọc <span>{latest.reading ?? '–'}</span></div>
            {growText && <div>Tăng từ đề đầu {growText}</div>}
          </div>}
        {metric !== 'total' && <p className="sm-note">Mình chia mục tiêu {profileTarget} theo điểm hiện tại của bạn: Nghe {split.listening}, Đọc {split.reading}.</p>}
        {hidden > 0 && onShowTests && !phone && <button type="button" className="sm-hidden" onClick={onShowTests}>+{hidden} đề cũ hơn trong Các đề</button>}
      </> : <>
        <div className="sm-big">{target}<span>/{METRIC_MAX[metric]} · mục tiêu</span></div>
        {onLog && <button type="button" className="rd-btn sm-first" onClick={onLog}>+ Ghi điểm đề</button>}
      </>}
    </div>
  );
}

export function MetricToggle({ metric, onChange }: { metric: ScoreMetric; onChange: (m: ScoreMetric) => void }) {
  return (
    <div className="sm-tog" role="group" aria-label="Xem điểm">
      {(['total', 'listening', 'reading'] as ScoreMetric[]).map(m => (
        <button key={m} type="button" aria-pressed={metric === m} onClick={() => onChange(m)}>{METRIC_LABEL[m]}</button>
      ))}
    </div>
  );
}

/** Điểm số tab, desktop (approved mockup design/previews/journey-v3/score-mountain-v3.html). */
export function ScoreTab({ sessions, profile, today, onOpenTest, onShowTests, onLog, gear }: Props) {
  const data = useSummitData(sessions, profile, today);
  const { T, latestIdx, bestBefore, target, fc } = data;
  const sit = latestIdx >= 0 ? T[latestIdx] : null;
  const excluded = T.find(p => p.excluded);

  let bubble: ReactNode = null;
  if (fc?.kind === 'reached') bubble = <>Chạm đỉnh <b>{target}</b> rồi, cắm cờ thôi!</>;
  else if (excluded) bubble = <>Đề {ddmm(excluded.date)} lệch hẳn nên mình chưa tính vào đà. Bấm <b>Vẫn tính đề này</b> nếu đó là điểm thật.</>;
  else if (sit?.retake) bubble = <>Cọc mới nhất <b>{sit.score}</b> là đề làm lại, điểm có thể cao hơn thực tế một chút.</>;
  else if (sit && bestBefore === -Infinity) bubble = <>Cọc đầu tiên <b>{sit.score}</b>, mình leo lên nhé!</>;
  else if (sit && sit.score > bestBefore) bubble = <>Cọc mới nhất <b>{sit.score}</b>, cao nhất từ trước tới giờ!</>;
  else if (sit && sit.score === bestBefore) bubble = <>Cọc mới nhất <b>{sit.score}</b>, bằng mức cao nhất từ trước tới giờ.</>;
  else if (sit) bubble = <>Cọc mới nhất <b>{sit.score}</b>, mình leo tiếp nhé!</>;

  return (
    <SceneStage height={MTN_H} minWidth={MTN_W} className="jr-mtn sm-stage">{W => (<>
      <SummitScene variant="desk" W={W} H={MTN_H} points={T} hidden={data.hidden} target={target} latestIdx={latestIdx} ghost={data.counted < 2}
        onOpenTest={onOpenTest} onForce={data.force} bubble={bubble} gear={gear} />
      <SummitCard data={data} onLog={onLog} onShowTests={onShowTests} profileTarget={profile.targetScore} />
      <MetricToggle metric={data.metric} onChange={data.setMetric} />
    </>)}</SceneStage>
  );
}
