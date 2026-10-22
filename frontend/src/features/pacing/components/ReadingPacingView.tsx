import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Clock3, History, Pause, Play, RotateCcw, Settings2, Timer, Volume2, VolumeX } from 'lucide-react';
import type { PacingRun, ReadingPartType } from '@/shared/types';
import { collectTestNames } from '@/shared/domain/testNames';
import { getActiveAccountId, readDataBundle } from '@/shared/data/dataBundle';
import { elapsedMs, formatClock, formatNumber, localDate, PRESETS, supportedMode, type PacingMode, type PomodoroPhase, type PomodoroSettings } from '@/features/pacing/lib/pacingModel';
import { associatedStudyId, linkedStudyVersion, pacingRunsNow, readPomodoroSettings, removePacingResult, savePacingResult, savePomodoroSettings, updatePacingResult, type LinkedStudyVersion } from '@/features/pacing/services/pacingStorage';
import { runLabel, runSeconds, studySecondsForDay, studyTimeLabel } from '@/features/pacing/lib/pacingStats';
import { pacingError } from '@/features/pacing/lib/pacingErrors';
import { usePacingTimer } from '@/features/pacing/hooks/usePacingTimer';
import { PacingHistory } from './PacingHistory';
import { PacingCharts } from './PacingCharts';
import { PacingResultModal, PomodoroSettingsModal, ReadingSettingsModal, pacingPrimary, pacingSecondary } from './PacingDialogs';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Sheet } from '@/app/components/MobileNav';
import './pacing.css';

export interface ReadingPacingViewProps {
  onOpenSessionLogger?: (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB' }) => void;
  onSessionsChanged?: () => void;
  theme?: 'light' | 'dark';
  initialPart?: ReadingPartType;
  resultDialogBlocked?: boolean;
}
type Part7Mode = 'PART_7' | 'PART_7_SINGLE' | 'PART_7_MULTI';
const PART_7_SHORT: Record<Part7Mode, string> = { PART_7: 'Part 7', PART_7_SINGLE: 'Part 7 · Đơn', PART_7_MULTI: 'Part 7 · Đôi/ba' };
function sourcesNow() { const data = readDataBundle(); return collectTestNames(data.sessions, data.mistakes); }
function initialSound(owner: string | null) { try { return localStorage.getItem(`toeic_pacing_sound_${owner ?? 'guest'}`) !== 'off'; } catch { return true; } }

/** Owner-keyed workspace keeps active drafts and results in the same account scope. */
export function ReadingPacingView(props: ReadingPacingViewProps) {
  const owner = getActiveAccountId();
  return <PacingWorkspace key={owner ?? 'guest'} owner={owner} {...props} />;
}
export { ReadingPacingView as ExamTimerView };
function PacingWorkspace({ owner, onSessionsChanged, theme = 'light', initialPart = 'PART_5', resultDialogBlocked = false }: ReadingPacingViewProps & { owner: string | null }) {
  const [settings, setSettings] = useState(() => readPomodoroSettings(owner));
  const timer = usePacingTimer(owner, supportedMode(initialPart), settings);
  const { snapshot, now } = timer;
  const { start: startClock, pause: pauseClock, saved: finishSaved, returnToClock } = timer;
  const [tab, setTab] = useState<'timer' | 'history' | 'stats'>('timer');
  const [runs, setRuns] = useState<PacingRun[]>(pacingRunsNow), [suggestions, setSuggestions] = useState(sourcesNow);
  const [configOpen, setConfigOpen] = useState(false), [settingsOpen, setSettingsOpen] = useState(false);
  const [sound, setSound] = useState(() => initialSound(owner));
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [part7Open, setPart7Open] = useState(false);
  if (!isPhone && part7Open) setPart7Open(false);
  const phoneModes = useRef<HTMLDivElement>(null);
  // The chosen mode can sit past the edge of the scrolling row (Pomodoro on narrow phones).
  useEffect(() => { phoneModes.current?.querySelector('.is-selected')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }); }, [snapshot.mode, isPhone]);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<{ run: PacingRun; name: string; correct: string; study: LinkedStudyVersion | null } | null>(null);
  const savingRef = useRef(false), automaticAttempt = useRef(''), played = useRef('');
  const audio = useRef<AudioContext | null>(null);
  // Screen Wake Lock API — keeps display awake during active pacing
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let released = false;
    const requestLock = async () => {
      if ('wakeLock' in navigator && snapshot.status === 'running' && document.visibilityState === 'visible') {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          if (!released) setWakeLockActive(true);
          wakeLockRef.current.addEventListener('release', () => {
            if (!released) setWakeLockActive(false);
          });
        } catch {
          if (!released) setWakeLockActive(false);
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && snapshot.status === 'running') {
        void requestLock();
      }
    };

    if (snapshot.status === 'running') {
      void requestLock();
      document.addEventListener('visibilitychange', handleVisibility);
    } else {
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      setWakeLockActive(false);
    }

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      setWakeLockActive(false);
    };
  }, [snapshot.status]);
  const actualMs = elapsedMs(snapshot, now), remaining = Math.ceil((snapshot.plannedSeconds * 1000 - actualMs) / 1000);
  const natural = actualMs >= snapshot.plannedSeconds * 1000;
  const isPomodoro = snapshot.mode === 'POMODORO', config = PRESETS[snapshot.mode] ?? PRESETS.PART_5;
  const savedPomodoro = isPomodoro && runs.some(run => run.id === snapshot.id && !run.deletedAt);
  const [today, setToday] = useState(() => localDate(Date.now()));
  useEffect(() => {
    const updateDay = () => setToday(localDate(Date.now()));
    const interval = window.setInterval(updateDay, 60_000);
    document.addEventListener('visibilitychange', updateDay);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', updateDay); };
  }, []);
  const focusRuns = runs.filter(run => !run.deletedAt && run.partType === 'POMODORO' && !run.presetId.includes('BREAK') && run.date === today);
  const completed = focusRuns.filter(run => run.finishedNaturally).length;
  const todaySeconds = useMemo(() => studySecondsForDay(runs, today), [runs, today]);
  const modeTone = snapshot.mode === 'PART_5' ? 'part5' : snapshot.mode === 'PART_6' ? 'part6' : snapshot.mode.startsWith('PART_7') ? 'part7' : snapshot.mode === 'FULL_READING' ? 'reading' : 'pomodoro';
  const clockTone = !isPomodoro ? 'reading' : snapshot.phase === 'WORK' ? 'focus' : snapshot.phase === 'SHORT_BREAK' ? 'short-break' : 'long-break';
  const remainingPercent = Math.round(remaining / snapshot.plannedSeconds * 100);
  const reload = useCallback(() => { if (getActiveAccountId() === owner) { setRuns(pacingRunsNow()); setSuggestions(sourcesNow()); } }, [owner]);
  useEffect(() => {
    window.addEventListener('storage', reload);
    return () => window.removeEventListener('storage', reload);
  }, [reload]);
  const initAudio = useCallback(() => { try { if (!audio.current && window.AudioContext) audio.current = new AudioContext(); void audio.current?.resume().catch(() => {}); } catch { /* Audio remains optional. */ } }, []);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);
  useEffect(() => {
    if (snapshot.status !== 'finished' || played.current === snapshot.id) return;
    played.current = snapshot.id;
    if ('vibrate' in navigator) {
      try { navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
    }
    if (!sound || !audio.current) return;
    try {
      const ctx = audio.current, tone = ctx.createOscillator(), gain = ctx.createGain();
      tone.frequency.setValueAtTime(587.33, ctx.currentTime); tone.frequency.setValueAtTime(880, ctx.currentTime + .15);
      gain.gain.setValueAtTime(.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .7);
      tone.connect(gain); gain.connect(ctx.destination); tone.start(); tone.stop(ctx.currentTime + .7);
    } catch { /* Do not block results if sound is unavailable. */ }
  }, [snapshot.status, snapshot.id, sound]);
  useEffect(() => {
    if (!isPomodoro || !natural || snapshot.status !== 'finished' || savedPomodoro || automaticAttempt.current === snapshot.id) return;
    automaticAttempt.current = snapshot.id;
    try { setRuns(savePacingResult(snapshot)); setSuggestions(sourcesNow()); onSessionsChanged?.(); setError(''); }
    catch (reason) { setError(pacingError(reason, 'Chưa lưu được phiên.')); }
  }, [isPomodoro, natural, snapshot, savedPomodoro, onSessionsChanged]);
  const selectMode = (mode: PacingMode, phase: PomodoroPhase = 'WORK') => {
    if (snapshot.status !== 'ready' && !savedPomodoro && !window.confirm('Thời gian đang làm chưa lưu. Làm mới phiên?')) return;
    if (timer.reset(mode, phase)) { setConfigOpen(false); setError(''); setTab('timer'); }
  };
  const initialRef = useRef(initialPart);
  useEffect(() => {
    if (initialRef.current === initialPart) return;
    initialRef.current = initialPart;
    if (snapshot.status === 'ready') timer.reset(supportedMode(initialPart));
    // An existing active draft has priority; switching it is always an explicit action.
  }, [initialPart, snapshot.status, timer]);
  const toggle = useCallback(() => { initAudio(); if (snapshot.status === 'running') pauseClock(); else startClock(); }, [initAudio, snapshot.status, startClock, pauseClock]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || document.querySelector('[role="dialog"]') || event.target instanceof Element
        && (event.target.closest('input,textarea,select,button,summary,[role="combobox"]') || (event.target as HTMLElement).isContentEditable)) return;
      if (tab !== 'timer' || snapshot.status === 'finished' || remaining <= 0) return;
      event.preventDefault(); toggle();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [tab, snapshot.status, remaining, toggle]);
  const save = () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      setRuns(edit ? updatePacingResult(edit.run, owner, edit.name, edit.correct, edit.study) : savePacingResult(snapshot));
      if (edit) setEdit(null); else timer.saved();
      setSuggestions(sourcesNow()); onSessionsChanged?.(); setError(''); setTab('history');
    } catch (reason) { setError(pacingError(reason, 'Chưa lưu được kết quả. Dữ liệu nhập vẫn được giữ.')); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const closeResult = useCallback(() => {
    if (getActiveAccountId() !== owner) return;
    if (edit) { setEdit(null); setError(''); }
    else if (savedPomodoro) finishSaved();
    else returnToClock();
  }, [owner, edit, savedPomodoro, finishSaved, returnToClock]);
  // Stable close callbacks avoid refocusing the dialog as the clock/background history updates.
  const closeEdit = useCallback(() => { setEdit(null); setError(''); }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeConfig = useCallback(() => setConfigOpen(false), []);
  const deleteRun = (run: PacingRun) => {
    const linked = associatedStudyId(run, readDataBundle().sessions);
    const description = linked ? 'Lượt luyện và buổi học liên quan sẽ được xóa cùng nhau.' : run.id.startsWith('pacing-v2-') ? 'Chỉ xóa lượt này.' : 'Chỉ xóa lượt luyện này; chưa xác định được buổi học liên quan của bản ghi cũ.';
    if (!window.confirm(`Xóa ${run.testName || runLabel(run)}? ${description}`)) return;
    try { setRuns(removePacingResult(run.id, owner)); onSessionsChanged?.(); setError(''); }
    catch (reason) { setError(pacingError(reason, 'Chưa xóa được lượt.')); }
  };
  const selectedMode = (mode: PacingMode) => snapshot.mode === mode ? 'pacing-mode is-selected' : 'pacing-mode';
  const soundButton = <button type="button" aria-label="Âm báo" aria-pressed={sound} title={sound ? 'Âm báo đang bật · Nhấn để tắt' : 'Âm báo đang tắt · Nhấn để bật'} className="pacing-sound" onClick={() => { setSound(!sound); try { localStorage.setItem(`toeic_pacing_sound_${owner ?? 'guest'}`, sound ? 'off' : 'on'); } catch { /* preference only */ } }}>{sound ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}</button>;
  // Phones: no outer card, one scrolling row of modes, the clock in the middle and its controls above the bottom navigation.
  const phonePanel = <section id="pacing-timer" role="tabpanel" aria-labelledby="pacing-timer-tab" className="pacing-panel is-phone" data-clock-tone={clockTone} data-mode-tone={modeTone}>
    <div ref={phoneModes} role="group" aria-label="Chế độ luyện" className="pacing-modes">
      <button type="button" aria-pressed={snapshot.mode === 'PART_5'} data-mode-tone="part5" className={selectedMode('PART_5')} onClick={() => selectMode('PART_5')}>Part 5</button>
      <button type="button" aria-pressed={snapshot.mode === 'PART_6'} data-mode-tone="part6" className={selectedMode('PART_6')} onClick={() => selectMode('PART_6')}>Part 6</button>
      <button type="button" aria-pressed={snapshot.mode.startsWith('PART_7')} aria-haspopup="dialog" data-mode-tone="part7" className={`pacing-mode ${snapshot.mode.startsWith('PART_7') ? 'is-selected' : ''}`} onClick={() => setPart7Open(true)}>{snapshot.mode.startsWith('PART_7') ? PART_7_SHORT[snapshot.mode as Part7Mode] : 'Part 7'}</button>
      <button type="button" aria-pressed={snapshot.mode === 'FULL_READING'} data-mode-tone="reading" className={selectedMode('FULL_READING')} onClick={() => selectMode('FULL_READING')}>Reading 75p</button>
      <button type="button" aria-pressed={isPomodoro} data-mode-tone="pomodoro" className={selectedMode('POMODORO')} onClick={() => selectMode('POMODORO')}>Pomodoro</button>
    </div>
    {isPomodoro && <div role="group" aria-label="Giai đoạn Pomodoro" className="pacing-phases mt-4 justify-center">{([['WORK', 'Tập trung'], ['SHORT_BREAK', 'Nghỉ ngắn'], ['LONG_BREAK', 'Nghỉ dài']] as const).map(([phase, label]) => <button type="button" key={phase} aria-pressed={snapshot.phase === phase} className={`pacing-phase-button ${snapshot.phase === phase ? 'is-selected' : ''}`} onClick={() => selectMode('POMODORO', phase)}>{label}</button>)}</div>}
    {wakeLockActive && (
      <div className="mx-auto my-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>Màn hình luôn sáng (Wake Lock Active)</span>
      </div>
    )}
    <p className="pacing-phone-meta">{isPomodoro ? <strong>{snapshot.phase === 'WORK' ? 'Tập trung' : snapshot.phase === 'SHORT_BREAK' ? 'Nghỉ ngắn' : 'Nghỉ dài'}</strong> : <><strong>{config.name}</strong>{snapshot.questions > 0 && ` · ${snapshot.questions} câu · ≤ ${formatNumber(snapshot.plannedSeconds / snapshot.questions)} giây/câu`}</>}</p>
    <div className="pacing-clock"><div role="timer" className="pacing-time" aria-label={`Còn ${formatClock(remaining)}`}>{formatClock(remaining)}</div>{(snapshot.status === 'paused' || snapshot.status === 'finished') && <p className="pacing-status">{snapshot.status === 'paused' ? 'Đã tạm dừng' : remaining <= 0 ? 'Hết thời gian' : 'Chờ nhập kết quả'}</p>}<div role="progressbar" aria-label="Thời gian còn lại" aria-valuemin={0} aria-valuemax={100} aria-valuenow={remainingPercent} aria-valuetext={`Còn ${formatClock(remaining)}`} className="pacing-track"><div style={{ width: `${remaining / snapshot.plannedSeconds * 100}%` }} /></div>{actualMs > 0 && <p className="pacing-clock-meta">Đã dùng {formatClock(actualMs / 1000)}</p>}</div>
    <div className="pacing-phone-tools">
      {snapshot.status === 'ready' ? <button type="button" className="pacing-settings" aria-expanded={configOpen || settingsOpen} onClick={() => isPomodoro ? setSettingsOpen(true) : setConfigOpen(true)}><Settings2 className="h-4 w-4" aria-hidden="true" />Điều chỉnh</button>
        : <button type="button" className="pacing-settings" onClick={() => selectMode(snapshot.mode, snapshot.phase)}><RotateCcw className="h-4 w-4" aria-hidden="true" />Làm lại</button>}
      {soundButton}
    </div>
    <p className="pacing-phone-today">Đã luyện hôm nay: <strong>{studyTimeLabel(todaySeconds)}</strong></p>
    <div className="fixed inset-x-0 bottom-[calc(4rem+2px+env(safe-area-inset-bottom))] z-30 flex gap-3 bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7] to-transparent px-4 pb-3 pt-6 dark:from-[#070C16] dark:via-[#070C16]">
      {snapshot.status === 'ready' ? (
        <button
          type="button"
          className={`${pacingPrimary} h-[54px] flex-1 !text-base active:scale-[0.98] transition-transform`}
          onClick={toggle}
        >
          <Play className="h-5 w-5" aria-hidden="true" />
          Bắt đầu
        </button>
      ) : (
        <>
          {remaining > 0 && (
            <button
              type="button"
              className={`${pacingPrimary} h-[54px] flex-1 !text-base active:scale-[0.98] transition-transform`}
              onClick={toggle}
            >
              {snapshot.status === 'running' ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
              {snapshot.status === 'running' ? 'Tạm dừng' : 'Tiếp tục'}
            </button>
          )}
          <button
            type="button"
            className={`${pacingSecondary} h-[54px] flex-1 !border-slate-900 !bg-blue-600 !text-base !text-white active:scale-[0.98] transition-transform`}
            onClick={() => { initAudio(); timer.finish(); }}
          >
            {isPomodoro ? 'Kết thúc phiên' : remaining ? 'Xong bài' : 'Nhập kết quả'}
          </button>
        </>
      )}
    </div>
    {part7Open && <Sheet title="Part 7" onClose={() => setPart7Open(false)}>
      <div className="space-y-2 pb-2">{(['PART_7', 'PART_7_SINGLE', 'PART_7_MULTI'] as const).map(mode => <button type="button" key={mode} aria-pressed={snapshot.mode === mode} onClick={() => { setPart7Open(false); selectMode(mode); }}
        className={'flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 text-left ' + (snapshot.mode === mode ? 'border-slate-900 bg-violet-100 dark:border-violet-300 dark:bg-violet-950/50' : 'border-stone-200 bg-white dark:border-slate-700 dark:bg-[#111A2C]')}>
        <span className="text-[15px] font-black text-slate-950 dark:text-white">{PRESETS[mode].name}</span><span className="text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{PRESETS[mode].questions} câu · {PRESETS[mode].minutes} phút</span>
      </button>)}</div>
    </Sheet>}
  </section>;
  return <div className={`pacing-view text-slate-900 dark:text-slate-100 ${isPhone ? 'is-phone pb-36' : 'pb-8'}`}>
    <div className="pacing-frame"><div className="pacing-header"><div role="tablist" aria-label="Luyện tốc độ" className="pacing-tabs">{([['timer', 'Luyện tập', Timer], ['history', 'Lịch sử', History], ['stats', 'Thống kê', BarChart3]] as const).map(([id, label, Icon], index) => <button type="button" key={id} role="tab" aria-selected={tab === id} aria-controls={`pacing-${id}`} id={`pacing-${id}-tab`} className={`pacing-tab ${tab === id ? 'is-selected' : ''}`} onClick={() => setTab(id)} onKeyDown={event => {
      const tabs = ['timer', 'history', 'stats'] as const;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault(); const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3]; setTab(next); document.getElementById(`pacing-${next}-tab`)?.focus();
    }}><Icon className="h-4 w-4" aria-hidden="true" />{label}</button>)}</div>{!isPhone && <div className="pacing-header-tools">
      <div className="pacing-today" title="Thời gian luyện Reading và Pomodoro tập trung đã lưu hôm nay; không gồm lượt nghỉ."><Clock3 className="h-4 w-4" aria-hidden="true" /><span>Đã luyện hôm nay <strong>{studyTimeLabel(todaySeconds)}</strong></span></div>
      {soundButton}
    </div>}</div>
      {tab !== 'timer' && snapshot.status !== 'ready' && <div className="pacing-resume"><span>{config.name} · {formatClock(remaining)} · {snapshot.status === 'running' ? 'Đang chạy' : snapshot.status === 'finished' ? 'Chờ kết quả' : 'Đã tạm dừng'}</span><button type="button" className="pacing-link" onClick={() => setTab('timer')}>Trở về đồng hồ →</button></div>}
      {(error || timer.error) && !edit && snapshot.status !== 'finished' && <p role="alert" className="mx-4 mt-3 text-sm text-rose-700 dark:text-rose-300">{error || timer.error}</p>}
      {tab === 'timer' && isPhone && phonePanel}
      {tab === 'timer' && !isPhone && <section id="pacing-timer" role="tabpanel" aria-labelledby="pacing-timer-tab" className="pacing-panel" data-clock-tone={clockTone} data-mode-tone={modeTone}><div className="pacing-practice"><div className="pacing-mode-row"><div role="group" aria-label="Chế độ luyện" className="pacing-modes"><button type="button" aria-pressed={snapshot.mode === 'PART_5'} data-mode-tone="part5" className={selectedMode('PART_5')} onClick={() => selectMode('PART_5')}>Part 5</button><button type="button" aria-pressed={snapshot.mode === 'PART_6'} data-mode-tone="part6" className={selectedMode('PART_6')} onClick={() => selectMode('PART_6')}>Part 6</button><select data-mode-tone="part7" aria-label="Chọn Part 7" value={snapshot.mode.startsWith('PART_7') ? snapshot.mode : 'PART_7_INACTIVE'} className={`pacing-mode ${snapshot.mode.startsWith('PART_7') ? 'is-selected' : ''}`} onChange={event => selectMode(event.target.value as PacingMode)}><option value="PART_7_INACTIVE" hidden>Part 7 · Toàn bộ</option><option value="PART_7">Part 7 · Toàn bộ</option><option value="PART_7_SINGLE">Part 7 · Đoạn đơn</option><option value="PART_7_MULTI">Part 7 · Đôi/ba</option></select><button type="button" aria-pressed={snapshot.mode === 'FULL_READING'} data-mode-tone="reading" className={selectedMode('FULL_READING')} onClick={() => selectMode('FULL_READING')}>Reading 75p</button><button type="button" aria-pressed={isPomodoro} data-mode-tone="pomodoro" className={selectedMode('POMODORO')} onClick={() => selectMode('POMODORO')}>Pomodoro</button></div></div>
        <div className={`pacing-setup ${isPomodoro ? 'is-pomodoro' : ''}`}>{isPomodoro ? <div role="group" aria-label="Giai đoạn Pomodoro" className="pacing-phases">{([['WORK', 'Tập trung'], ['SHORT_BREAK', 'Nghỉ ngắn'], ['LONG_BREAK', 'Nghỉ dài']] as const).map(([phase, label]) => <button type="button" key={phase} aria-pressed={snapshot.phase === phase} className={`pacing-phase-button ${snapshot.phase === phase ? 'is-selected' : ''}`} onClick={() => selectMode('POMODORO', phase)}>{label}</button>)}</div> : <span><strong>{config.name}</strong>{snapshot.questions ? ` · ${snapshot.questions} câu` : ''}</span>}{snapshot.status === 'ready' && <button type="button" className="pacing-settings" aria-expanded={configOpen || settingsOpen} onClick={() => isPomodoro ? setSettingsOpen(true) : setConfigOpen(!configOpen)}><Settings2 className="h-4 w-4" aria-hidden="true" />Điều chỉnh</button>}</div>
        <div className="pacing-clock">
          {wakeLockActive && (
            <div className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Màn hình luôn sáng (Wake Lock Active)</span>
            </div>
          )}
          <div role="timer" className="pacing-time" aria-label={`Còn ${formatClock(remaining)}`}>{formatClock(remaining)}</div>{(snapshot.status === 'paused' || snapshot.status === 'finished') && <p className="pacing-status">{snapshot.status === 'paused' ? 'Đã tạm dừng' : remaining <= 0 ? 'Hết thời gian' : 'Chờ nhập kết quả'}</p>}<div role="progressbar" aria-label="Thời gian còn lại" aria-valuemin={0} aria-valuemax={100} aria-valuenow={remainingPercent} aria-valuetext={`Còn ${formatClock(remaining)}`} className="pacing-track"><div style={{ width: `${remaining / snapshot.plannedSeconds * 100}%` }} /></div>{(actualMs > 0 || snapshot.questions > 0) && <p className="pacing-clock-meta">{actualMs > 0 && `Đã dùng ${formatClock(actualMs / 1000)}`}{actualMs > 0 && snapshot.questions > 0 && ' · '}{snapshot.questions > 0 && `Mục tiêu gợi ý ≤ ${formatNumber(snapshot.plannedSeconds / snapshot.questions)} giây/câu`}</p>}</div>
        <div className="pacing-controls">{snapshot.status === 'ready' ? <button type="button" className={pacingPrimary} onClick={toggle}><Play className="h-4 w-4" aria-hidden="true" />Bắt đầu</button> : <>{remaining > 0 && <button type="button" className={pacingPrimary} onClick={toggle}>{snapshot.status === 'running' ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}{snapshot.status === 'running' ? 'Tạm dừng' : 'Tiếp tục'}</button>}<button type="button" className={`${pacingSecondary} !border-slate-900 !bg-blue-600 !text-white`} onClick={() => { initAudio(); timer.finish(); }}>{isPomodoro ? 'Kết thúc phiên' : remaining ? 'Xong bài' : 'Nhập kết quả'}</button><button type="button" className="pacing-reset" onClick={() => selectMode(snapshot.mode, snapshot.phase)}>Làm lại</button></>}</div>
        <details className="pacing-tip"><summary>{isPomodoro ? 'Gợi ý tập trung' : `Mẹo luyện ${config.name}`}</summary><p>{config.tip}</p></details>
      </div></section>}
      {tab === 'history' && <div id="pacing-history" role="tabpanel" aria-labelledby="pacing-history-tab"><PacingHistory runs={runs} onNew={() => setTab('timer')} onEdit={run => { setEdit({ run, name: run.testName ?? '', correct: run.correctAnswers?.toString() ?? '', study: linkedStudyVersion(run) }); setError(''); }} onDelete={deleteRun} /></div>}
      {tab === 'stats' && <div id="pacing-stats" role="tabpanel" aria-labelledby="pacing-stats-tab"><PacingCharts runs={runs} initialMode={snapshot.mode} theme={theme} onPractice={selectMode} /></div>}
    </div>
    {configOpen && snapshot.status === 'ready' && !isPomodoro && <ReadingSettingsModal mode={snapshot.mode} minutes={snapshot.plannedSeconds / 60} questions={snapshot.questions} error={timer.error} tip={isPhone ? config.tip : undefined} onClose={closeConfig} onSave={(minutes, questions) => { if (timer.configure(minutes, questions)) setConfigOpen(false); }} />}
    {settingsOpen && <PomodoroSettingsModal settings={settings} tip={isPhone ? config.tip : undefined} onClose={closeSettings} onSave={(value: PomodoroSettings) => { try { savePomodoroSettings(owner, value); setSettings(value); setSettingsOpen(false); if (snapshot.status === 'ready') timer.configure((snapshot.phase === 'WORK' ? value.workMinutes : snapshot.phase === 'SHORT_BREAK' ? value.shortBreakMinutes : value.longBreakMinutes), 0); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Chưa lưu được thiết lập.'); } }} />}
    {!resultDialogBlocked && (edit ? <PacingResultModal title={`Kết quả ${runLabel(edit.run)}`} seconds={runSeconds(edit.run) ?? 0} questions={edit.run.totalQuestions ?? 0} name={edit.name} correct={edit.correct} suggestions={suggestions} error={error} saving={saving} onName={name => setEdit(previous => previous ? { ...previous, name } : null)} onCorrect={correct => setEdit(previous => previous ? { ...previous, correct } : null)} onClose={closeEdit} onSave={save} />
      : snapshot.status === 'finished' && !settingsOpen && <PacingResultModal title={isPomodoro ? natural ? snapshot.phase === 'WORK' ? 'Phiên tập trung hoàn thành' : 'Hết giờ nghỉ' : 'Kết thúc phiên sớm' : `Kết quả ${config.name}`} seconds={actualMs / 1000} questions={snapshot.questions} name={snapshot.name} correct={snapshot.correct} suggestions={suggestions} error={error || timer.error} saving={saving} onName={name => timer.patchResult({ name })} onCorrect={correct => timer.patchResult({ correct })} onClose={closeResult} onSave={save} savedPomodoro={savedPomodoro} phase={snapshot.phase} settings={settings} longBreakDue={completed > 0 && completed % settings.longBreakInterval === 0} onNextPhase={phase => { if (timer.reset('POMODORO', phase)) { setTab('timer'); setError(''); } }} />)}
  </div>;
}
