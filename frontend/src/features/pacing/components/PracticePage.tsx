import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PacingRun, ReadingPartType, StudySession } from '@/shared/types';
import { getActiveAccountId, readDataBundle } from '@/shared/data/dataBundle';
import { getPracticeParts } from '@/shared/domain/etsScoring';
import { Soc } from '@/shared/ui/soc/Soc';
import { pickTodayTasks } from '@/features/today/lib/todayTasks';
import { usePacingTimer } from '../hooks/usePacingTimer';
import { PRESETS, elapsedMs, formatClock, localDate, supportedMode, type PacingMode } from '../lib/pacingModel';
import { pacingRunsNow, readPomodoroSettings, savePacingResult } from '../services/pacingStorage';
import { pacingError } from '../lib/pacingErrors';
import './practice.css';

interface Props {
  sessions: StudySession[];
  initialPart?: ReadingPartType;
  /** Results arrive while a logger or another dialog is open; the finish card waits for it to close. */
  resultDialogBlocked?: boolean;
  onOpenSessionLogger: (prefill?: { sessionType?: 'PART_PRACTICE'; partNumber?: number; durationMinutes?: number }) => void;
  onEditSession: (session: StudySession) => void;
  onSessionsChanged: () => void;
  onOpenPomodoro: () => void;
}

const CHOICES: Array<{ mode: PacingMode; label: string }> = [
  { mode: 'PART_5', label: 'Part 5' }, { mode: 'PART_6', label: 'Part 6' }, { mode: 'PART_7', label: 'Part 7' }, { mode: 'FULL_READING', label: 'Cả phần Đọc' }
];
const label = (mode: PacingMode) => CHOICES.find(c => c.mode === mode)?.label ?? PRESETS[mode].name;
const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${formatClock(s % 3600)}` : formatClock(s);
};
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Luyện tập on computers (design/previews/mock-practice.html). Pomodoro stays in the older clock view. */
export function PracticePage(props: Props) {
  const owner = getActiveAccountId();
  return <PracticeWorkspace key={owner ?? 'guest'} owner={owner} {...props} />;
}

function PracticeWorkspace({ owner, sessions, initialPart, resultDialogBlocked = false, onOpenSessionLogger, onEditSession, onSessionsChanged, onOpenPomodoro }: Props & { owner: string | null }) {
  const [settings] = useState(() => readPomodoroSettings(owner));
  const timer = usePacingTimer(owner, supportedMode(initialPart ?? 'PART_5'), settings);
  const { snapshot, now } = timer;
  const [runs, setRuns] = useState<PacingRun[]>(pacingRunsNow);
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState(0);
  const saving = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const played = useRef<string | null>(null);

  // Pomodoro lives in the older view; land on a Reading preset here.
  useEffect(() => { if (snapshot.mode === 'POMODORO' && snapshot.status === 'ready') timer.reset('PART_5'); }, [snapshot.mode, snapshot.status, timer]);
  const mode: PacingMode = snapshot.mode === 'POMODORO' ? 'PART_5' : snapshot.mode;
  const preset = PRESETS[mode];
  const planned = snapshot.plannedSeconds, questions = snapshot.questions;
  const spent = elapsedMs(snapshot, now) / 1000, left = Math.max(0, planned - spent);

  const suggestion = useMemo(() => pickTodayTasks(readDataBundle(), localDate(Date.now())).find(t => t.kind === 'PART_TIMER'), [sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setWrong(0); }, [snapshot.id]);

  useEffect(() => {
    if (snapshot.status !== 'finished' || played.current === snapshot.id) return;
    played.current = snapshot.id;
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* optional */ }
    try {
      const ctx = audio.current; if (!ctx) return;
      const tone = ctx.createOscillator(), gain = ctx.createGain();
      tone.frequency.setValueAtTime(587.33, ctx.currentTime); tone.frequency.setValueAtTime(880, ctx.currentTime + .15);
      gain.gain.setValueAtTime(.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .7);
      tone.connect(gain); gain.connect(ctx.destination); tone.start(); tone.stop(ctx.currentTime + .7);
    } catch { /* Sound is optional. */ }
  }, [snapshot.status, snapshot.id]);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);

  const start = useCallback(() => {
    try { if (!audio.current && window.AudioContext) audio.current = new AudioContext(); void audio.current?.resume().catch(() => {}); } catch { /* optional */ }
    timer.start();
  }, [timer]);
  const pick = (next: PacingMode) => { if (snapshot.status === 'ready' && next !== snapshot.mode) timer.reset(next); };
  const stop = () => { if (window.confirm('Dừng phiên này? Thời gian đang bấm sẽ không được lưu.')) timer.reset(mode); };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || document.querySelector('[role="dialog"]')) return;
      if (event.target instanceof Element && event.target.closest('input,textarea,select,button')) return;
      if (snapshot.status === 'running') { event.preventDefault(); timer.pause(); }
      else if (snapshot.status === 'ready' || snapshot.status === 'paused') { event.preventDefault(); start(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [snapshot.status, timer, start]);

  const save = (withScore: boolean) => {
    if (saving.current) return;
    saving.current = true;
    try {
      const correct = withScore ? String(Math.max(0, questions - wrong)) : '';
      setRuns(savePacingResult({ ...snapshot, correct }));
      timer.saved(); onSessionsChanged(); setError('');
    } catch (reason) { setError(pacingError(reason, 'Chưa lưu được kết quả. Dữ liệu vẫn được giữ.')); }
    finally { saving.current = false; }
  };

  // Recent Part practice: sessions saved by the timer or the logger; the paired run gives the pace.
  const recent = useMemo(() => sessions.filter(s => !s.deletedAt && s.sessionType === 'PART_PRACTICE')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 8), [sessions]);
  const weekStart = useMemo(() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return localDate(d.getTime()); }, []);
  const thisWeek = sessions.filter(s => !s.deletedAt && s.sessionType === 'PART_PRACTICE' && s.date >= weekStart).length;
  const runOf = (id: string) => runs.find(r => r.id === id && !r.deletedAt);

  if (snapshot.status === 'running' || snapshot.status === 'paused' || snapshot.status === 'finished') {
    const share = planned ? left / planned : 0;
    const R = 165, C = 2 * Math.PI * R;
    const at = Math.min(questions, Math.max(1, Math.floor(spent / Math.max(1, planned / questions)) + 1));
    const per = planned / Math.max(1, questions);
    const pace = per >= 60 ? `${Math.round(per / 6) / 10} phút` : `${Math.round(per)} giây`;
    const diff = planned - spent;
    return (
      <div className="rd pr-focus">
        <div className="pr-fhead">
          <b>{label(mode)} <span>{questions} câu · {Math.round(planned / 60)} phút</span></b>
          <button type="button" className="pr-stop" onClick={stop}>× Dừng</button>
        </div>
        <div className="pr-dial">
          <svg viewBox="0 0 360 360" aria-hidden="true">
            <circle cx="180" cy="180" r={R} fill="none" stroke="#ece6ff" strokeWidth="24" />
            <circle cx="180" cy="180" r={R} fill="none" stroke="#a78bfa" strokeWidth="24" strokeLinecap="round" strokeDasharray={`${share * C} ${C}`} transform="rotate(-90 180 180)" />
          </svg>
          <div className="pr-time" role="timer" aria-live="off"><b>{clock(left)}</b><span>{snapshot.status === 'paused' ? 'đang tạm dừng' : `còn lại trong ${clock(planned)}`}</span></div>
        </div>
        <p className="pr-pace">Theo nhịp {pace} một câu, lúc này bạn nên ở khoảng <b>câu {at}</b>.</p>
        <div className="pr-acts">
          {snapshot.status === 'running'
            ? <button type="button" className="rd-btn rd-btn--white" onClick={timer.pause}>Tạm dừng</button>
            : <button type="button" className="rd-btn rd-btn--white" onClick={start} disabled={snapshot.status === 'finished'}>Tiếp tục</button>}
          <button type="button" className="rd-btn" onClick={timer.finish}>Xong rồi</button>
        </div>
        <p className="pr-note">Đồng hồ vẫn chạy khi bạn chuyển sang tab làm đề. Phím cách để tạm dừng.</p>
        <Soc state="idle" size={120} className="pr-fsoc" />
        {(error || timer.error) && <p role="alert" className="pr-err">{error || timer.error}</p>}

        {snapshot.status === 'finished' && !resultDialogBlocked && (
          <div className="pr-modalwrap">
            <div className="pr-modal" role="dialog" aria-modal="true" aria-labelledby="pr-done-title">
              <Soc state="cheerB" size={120} />
              <h2 id="pr-done-title">Xong {label(mode)} trong {clock(spent)}</h2>
              <p>{diff >= 1 ? `Nhanh hơn giờ gợi ý ${clock(diff)}. ` : 'Vừa hết giờ gợi ý. '}Chấm bài rồi ghi lại nhé.</p>
              <div className="pr-row">
                <div><b>Số câu sai</b><small>trên {questions} câu</small></div>
                <div className="pr-step">
                  <button type="button" aria-label="Bớt một câu sai" onClick={() => setWrong(w => Math.max(0, w - 1))} disabled={wrong <= 0}>−</button>
                  <input type="number" inputMode="numeric" min={0} max={questions} value={wrong} aria-label="Số câu sai"
                    onChange={e => setWrong(Math.min(questions, Math.max(0, Math.round(Number(e.target.value)) || 0)))} onFocus={e => e.target.select()} />
                  <button type="button" aria-label="Thêm một câu sai" onClick={() => setWrong(w => Math.min(questions, w + 1))} disabled={wrong >= questions}>+</button>
                </div>
              </div>
              <div className="pr-row"><div><b>Thời gian</b><small>lấy từ đồng hồ</small></div><b className="pr-val">{clock(spent)}</b></div>
              {(error || timer.error) && <p role="alert" className="pr-err">{error || timer.error}</p>}
              <div className="pr-mbtns">
                <button type="button" className="rd-btn rd-btn--white" onClick={() => save(false)}>Để sau</button>
                <button type="button" className="rd-btn" onClick={() => save(true)}>Lưu kết quả</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const suggested = suggestion?.part ? `PART_${suggestion.part}` as PacingMode : null;
  return (
    <div className="rd pr-page">
      <h1>Luyện tập</h1>
      <p className="pr-lead">Bấm giờ một Part như trong phòng thi, xong thì ghi số câu sai. Mỗi buổi đều tính vào chuỗi ngày.</p>
      <section className="pr-hero">
        <div className="pr-hl">
          {suggested === mode ? <span className="pr-chip">Gợi ý hôm nay</span> : <span className="pr-chip is-plain">Bạn chọn</span>}
          <h2>{label(mode)}, {questions} câu trong {Math.round(planned / 60)} phút</h2>
          <p>{suggested === mode && suggestion ? suggestion.reason : 'Cứ như phòng thi thật: hết giờ là dừng.'}</p>
          <div className="pr-choices" role="group" aria-label="Chọn phần luyện">
            {CHOICES.map(c => (
              <button key={c.mode} type="button" aria-pressed={mode === c.mode} onClick={() => pick(c.mode)}>
                <b>{c.label}</b><small>{PRESETS[c.mode].questions} câu · {PRESETS[c.mode].minutes} phút</small>
              </button>
            ))}
          </div>
          <div className="pr-go">
            <button type="button" className="rd-btn pr-start" onClick={start}>Bắt đầu bấm giờ</button>
            <div className="pr-min" aria-label="Số phút">
              <span>Phút</span>
              <button type="button" aria-label="Bớt một phút" onClick={() => timer.configure(Math.max(1, planned / 60 - 1), questions)} disabled={planned <= 60}>−</button>
              <b>{Math.round(planned / 60)}</b>
              <button type="button" aria-label="Thêm một phút" onClick={() => timer.configure(Math.min(180, planned / 60 + 1), questions)}>+</button>
            </div>
            <button type="button" className="pr-ghost" onClick={() => onOpenSessionLogger({ sessionType: 'PART_PRACTICE', partNumber: preset.part ?? undefined })}>Ghi kết quả, không bấm giờ</button>
          </div>
        </div>
        <Soc state="idle" size={190} className="pr-hsoc" />
      </section>
      {(error || timer.error) && <p role="alert" className="pr-err">{error || timer.error}</p>}

      <section className="pr-recent">
        <div className="pr-rh"><div><h3>Buổi luyện gần đây</h3><p>Tuần này {thisWeek} buổi. Phần Nghe không bấm giờ được vì chạy theo audio, chỉ ghi kết quả.</p></div>
          <button type="button" className="pr-link" onClick={onOpenPomodoro}>Đồng hồ Pomodoro ›</button></div>
        {recent.length ? (
          <table className="pr-table">
            <thead><tr><th>Ngày</th><th>Part</th><th>Số câu sai</th><th>Thời gian</th><th>So với giờ gợi ý</th></tr></thead>
            <tbody>
              {recent.map(s => {
                const parts = getPracticeParts(s), run = runOf(s.id);
                const wrongTotal = parts.reduce((a, p) => a + (p.total - p.correct), 0), total = parts.reduce((a, p) => a + p.total, 0);
                const graded = run ? run.correctAnswers !== undefined : parts.length > 0;
                const secs = run?.actualSeconds;
                const delta = run && secs !== undefined ? run.plannedMinutes * 60 - secs : null;
                return (
                  <tr key={s.id} tabIndex={0} onClick={() => onEditSession(s)} onKeyDown={e => { if (e.key === 'Enter') onEditSession(s); }}>
                    <td>{ddmm(s.date)}</td>
                    <td>{(parts.length ? parts.map(p => `Part ${p.part}`) : [run?.presetName ?? 'Part']).map(t => <span key={t} className="pr-pt">{t}</span>)}</td>
                    <td>{graded && total ? <b>{wrongTotal} / {total}</b> : <span className="pr-mut">chưa chấm</span>}</td>
                    <td>{secs !== undefined ? clock(secs) : '—'}</td>
                    <td>{delta === null ? <span className="pr-tag">không bấm giờ</span>
                      : delta >= 0 ? <span className="pr-tag is-fast">nhanh hơn {clock(delta)}</span>
                      : <span className="pr-tag is-slow">chậm hơn {clock(-delta)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="pr-empty">Chưa có buổi luyện nào. Bấm giờ một Part để bắt đầu.</p>}
      </section>
    </div>
  );
}
