import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PacingRun, ReadingPartType, StudySession } from '@/shared/types';
import { readDataBundle } from '@/shared/data/dataBundle';
import { getPracticeParts } from '@/shared/domain/etsScoring';
import { pickTodayTasks } from '@/features/today/lib/todayTasks';
import { usePacingTimer } from './usePacingTimer';
import { useWakeLock } from './useWakeLock';
import { PRESETS, elapsedMs, formatClock, isPacingMode, localDate, supportedMode, type PacingMode } from '../lib/pacingModel';
import { pacingRunsNow, readPomodoroSettings, readTimer, savePacingResult, savePomodoroSettings } from '../services/pacingStorage';
import { pacingError } from '../lib/pacingErrors';
import { studySecondsForDay, studyTimeLabel } from '../lib/pacingStats';
import { bestSeconds, currentStepIndex, dayLabel, dishOf, focusRunsOn, formatSpan, gainLabel, isLastStretch, lastSeconds, nextBreak, paceQuestion, paceTag, recipeSteps, recordGain, stepFreeMinutes } from '../lib/bakery';
import type { BakeryChoice, RecentRow } from '../components/BakeryChoose';

export interface BakeryOptions {
  owner: string | null;
  sessions: StudySession[];
  initialPart?: ReadingPartType;
  onOpenSessionLogger: (prefill?: { sessionType?: 'PART_PRACTICE'; partNumber?: number; durationMinutes?: number }) => void;
  onSessionsChanged: () => void;
  /** True while a clock is running, paused or awaiting its result. */
  onFocusChange?: (focused: boolean) => void;
}

/** Mẻ tự do is the old Pomodoro: the POMODORO mode with its focus and break phases, saved exactly as before. */
export const FREE: PacingMode = 'POMODORO';
const CHOICES: Array<{ mode: PacingMode; label: string }> = [
  { mode: 'PART_5', label: 'Part 5' }, { mode: 'PART_6', label: 'Part 6' }, { mode: 'PART_7', label: 'Part 7' }, { mode: 'FULL_READING', label: 'Cả phần Đọc' }, { mode: FREE, label: 'Mẻ tự do' }
];
export const bakeryLabel = (mode: PacingMode) => CHOICES.find(c => c.mode === mode)?.label ?? PRESETS[mode].name;
export const bakeryClock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${formatClock(s % 3600)}` : formatClock(s);
};
/** Times written in words and tags: 7:40, not 07:40. The oven display keeps two digits. */
const short = (seconds: number) => bakeryClock(seconds).replace(/^0(?=\d:)/, '');
/** The per-account sound switch of the old clock ("Âm báo"); still honoured, on by default. */
const soundOn = (owner: string | null) => { try { return localStorage.getItem(`toeic_pacing_sound_${owner ?? 'guest'}`) !== 'off'; } catch { return true; } };

/**
 * Everything the bakery (Luyện tập) needs, shared by the computer page and the phone page:
 * the timer, sounds, recipe steps, saving, the Part choices and the recent bakes. The views only draw it.
 */
export function useBakery({ owner, sessions, initialPart, onOpenSessionLogger, onSessionsChanged, onFocusChange }: BakeryOptions) {
  const [settings, setSettings] = useState(() => readPomodoroSettings(owner));
  const [hadDraft] = useState(() => readTimer(owner) !== null);
  const timer = usePacingTimer(owner, supportedMode(initialPart ?? 'PART_5'), settings);
  const { snapshot, now } = timer;
  const [runs, setRuns] = useState<PacingRun[]>(pacingRunsNow);
  // Runs edited elsewhere (the result editor) come back through the sessions prop: re-read them then.
  useEffect(() => { setRuns(pacingRunsNow()); }, [sessions]);
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState(0);
  const saving = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const played = useRef<string | null>(null);
  const step = useRef<{ id: string; index: number } | null>(null);

  const mode: PacingMode = snapshot.mode;
  const free = mode === FREE;
  const resting = free && snapshot.phase !== 'WORK';
  // A break is only ever started from the ra-lò card; one that is not running (another tab, an old draft) goes back to baking.
  useEffect(() => { if (resting && snapshot.status === 'ready') timer.reset(FREE, 'WORK'); }, [resting, snapshot.status, timer]);
  // Links that ask for Pomodoro (old /phong-thi, Phân tích, Kế hoạch) land on Mẻ tự do when nothing is in the oven.
  const askedFree = useRef(initialPart === 'POMODORO');
  useEffect(() => {
    if (!askedFree.current) return;
    askedFree.current = false;
    if (snapshot.status === 'ready' && snapshot.mode !== FREE) timer.reset(FREE, 'WORK');
  }, [snapshot.status, snapshot.mode, timer]);
  const planned = snapshot.plannedSeconds, questions = snapshot.questions;
  const spent = elapsedMs(snapshot, now) / 1000, left = Math.max(0, planned - spent);

  const suggestion = useMemo(() => pickTodayTasks(readDataBundle(), localDate(Date.now())).find(t => t.kind === 'PART_TIMER'), [sessions]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggested = suggestion?.part ? `PART_${suggestion.part}` as PacingMode : null;
  // First visit with no saved draft and the default Part: start on the Part Today suggests.
  const pickedSuggestion = useRef(false);
  useEffect(() => {
    if (pickedSuggestion.current) return;
    pickedSuggestion.current = true;
    if (!hadDraft && (!initialPart || initialPart === 'PART_5') && suggested && snapshot.status === 'ready' && snapshot.mode !== suggested) timer.reset(suggested);
  }, [hadDraft, initialPart, suggested, snapshot.status, snapshot.mode, timer]);
  useEffect(() => { setWrong(0); }, [snapshot.id]);
  const focused = snapshot.status !== 'ready';
  useEffect(() => { onFocusChange?.(focused); }, [focused, onFocusChange]);
  useEffect(() => () => onFocusChange?.(false), [onFocusChange]);
  useWakeLock(free && snapshot.status === 'running');

  const tone = useCallback((from: number, to: number, volume: number, length: number) => {
    if (!soundOn(owner)) return;
    try {
      const ctx = audio.current; if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.setValueAtTime(from, ctx.currentTime); osc.frequency.setValueAtTime(to, ctx.currentTime + length / 4);
      gain.gain.setValueAtTime(volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + length);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + length);
    } catch { /* Sound is optional. */ }
  }, [owner]);

  useEffect(() => {
    if (snapshot.status !== 'finished' || played.current === snapshot.id) return;
    played.current = snapshot.id;
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* optional */ }
    tone(587.33, 880, .15, .7);
  }, [snapshot.status, snapshot.id, tone]);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);

  const start = useCallback(() => {
    try { if (!audio.current && window.AudioContext) audio.current = new AudioContext(); void audio.current?.resume().catch(() => {}); } catch { /* optional */ }
    timer.start();
  }, [timer]);
  const pick = (next: PacingMode) => { if (snapshot.status === 'ready' && next !== snapshot.mode) timer.reset(next); };
  const stop = () => { if (window.confirm('Dừng phiên này? Thời gian đang bấm sẽ không được lưu.')) timer.reset(mode); };

  // Recipe: a step ticks when the pace time passes its last question; the pace says nothing about the learner's real position.
  const at = paceQuestion(spent, planned, questions);
  const steps = useMemo(() => free ? [] : recipeSteps(questions, at), [free, questions, at]);
  const stepIndex = currentStepIndex(steps);
  useEffect(() => {
    const before = step.current;
    step.current = { id: snapshot.id, index: stepIndex };
    if (snapshot.status === 'running' && before && before.id === snapshot.id && stepIndex > before.index) tone(1318.5, 1760, .06, .35);
  }, [stepIndex, snapshot.id, snapshot.status, tone]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || resting || document.querySelector('[role="dialog"]')) return;
      if (event.target instanceof Element && event.target.closest('input,textarea,select,button')) return;
      if (snapshot.status === 'running') { event.preventDefault(); timer.pause(); }
      else if (snapshot.status === 'ready' || snapshot.status === 'paused') { event.preventDefault(); start(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [snapshot.status, resting, timer, start]);

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

  // Mẻ tự do saves itself when it leaves the oven (focus and breaks alike, as Pomodoro did); a finished break returns to the case.
  const freeSaved = free && runs.some(run => run.id === snapshot.id);
  const attempted = useRef('');
  const saveFree = useCallback(() => {
    if (freeSaved) return true;
    try { setRuns(savePacingResult(timer.snapshot)); onSessionsChanged(); setError(''); return true; }
    catch (reason) { setError(pacingError(reason, 'Chưa lưu được mẻ này. Dữ liệu vẫn được giữ.')); return false; }
  }, [freeSaved, timer.snapshot, onSessionsChanged]);
  useEffect(() => {
    if (!free || snapshot.status !== 'finished' || attempted.current === snapshot.id) return;
    attempted.current = snapshot.id;
    if (saveFree() && resting) timer.reset(FREE, 'WORK');
  }, [free, resting, snapshot.status, snapshot.id, saveFree, timer]);

  const today = localDate(now);
  const focusToday = focusRunsOn(runs, today);
  const rest = nextBreak(focusToday, settings);
  const takeBreak = () => { if (saveFree() && timer.reset(FREE, rest.phase)) start(); };
  const bakeAgain = () => { if (saveFree()) timer.reset(FREE, 'WORK'); };
  const skipBreak = () => {
    if (timer.snapshot.status === 'finished') { if (saveFree()) timer.reset(FREE, 'WORK'); return; }
    if (elapsedMs(timer.snapshot) <= 0) { timer.reset(FREE, 'WORK'); return; }
    played.current = timer.snapshot.id; // skipping is the learner's own choice: no end beep
    timer.finish();
  };
  const setMinutes = (delta: number) => {
    if (!free) { timer.configure(Math.min(180, Math.max(1, planned / 60 + delta)), questions); return; }
    const next = stepFreeMinutes(planned / 60, delta);
    if (!timer.configure(next, 0)) return;
    const value = { ...settings, workMinutes: next };
    setSettings(value);
    try { savePomodoroSettings(owner, value); } catch { /* the choice still applies to this bake */ }
  };

  // Recent Part practice: sessions saved by the timer or the logger; the paired run gives the pace.
  const recent = useMemo(() => sessions.filter(s => !s.deletedAt && s.sessionType === 'PART_PRACTICE')
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')), [sessions]);
  const weekStart = useMemo(() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return localDate(d.getTime()); }, []);
  const weekCount = recent.filter(s => s.date >= weekStart).length;
  const runOf = (id: string) => runs.find(r => r.id === id && !r.deletedAt);

  const choices: BakeryChoice[] = CHOICES.map(c => {
    if (c.mode === FREE) return { mode: c.mode, label: c.label, questions: 0, minutes: free ? Math.round(planned / 60) : settings.workMinutes, record: null };
    const best = bestSeconds(runs, c.mode);
    return { mode: c.mode, label: c.label, questions: PRESETS[c.mode].questions, minutes: PRESETS[c.mode].minutes, record: best === null ? null : short(best) };
  });
  const rows: RecentRow[] = recent.slice(0, 60).map(s => {
    const parts = getPracticeParts(s), run = runOf(s.id);
    const secs = run?.actualSeconds;
    if (run?.partType === FREE) {
      return { id: s.id, session: s, dish: dishOf(FREE), title: `Mẻ tự do · ${Math.max(1, Math.round((secs ?? s.durationMinutes * 60) / 60))} phút`,
        sub: dayLabel(s.date, today), tag: { kind: 'even', text: 'học tự do' } };
    }
    const wrongTotal = parts.reduce((a, p) => a + (p.total - p.correct), 0), total = parts.reduce((a, p) => a + p.total, 0);
    const graded = run ? run.correctAnswers !== undefined : parts.length > 0;
    const kind = run?.partType, runMode = kind && isPacingMode(kind) && CHOICES.some(c => c.mode === kind) ? kind : null;
    const name = parts.length ? parts.map(p => `Part ${p.part}`).join(' + ') : runMode ? bakeryLabel(runMode) : run?.presetName ?? 'Part';
    const gradedWrong = run && run.correctAnswers !== undefined && run.totalQuestions ? run.totalQuestions - run.correctAnswers : wrongTotal;
    return {
      id: s.id, session: s,
      dish: parts.length ? dishOf(`PART_${parts[0].part}` as PacingMode) : runMode ? dishOf(runMode) : 'layer',
      title: `${name} · ${graded && (total || run) ? `${gradedWrong} sai` : 'chưa chấm'}`,
      sub: `${dayLabel(s.date, today)} · ${secs !== undefined ? short(secs) : 'không bấm giờ'}`,
      tag: run && secs !== undefined ? paceTag(run.plannedMinutes, secs) : null
    };
  });
  const last = lastSeconds(runs, mode);
  const gain = snapshot.status === 'finished' && !free ? recordGain(bestSeconds(runs, mode), spent, spent >= planned) : null;

  return {
    timer, status: snapshot.status, mode, label: bakeryLabel(mode), planned, questions, spent, left,
    plannedMinutes: Math.round(planned / 60), progress: planned ? Math.min(1, spent / planned) : 0,
    clock: bakeryClock(left), plannedClock: bakeryClock(planned), spentShort: short(spent),
    paused: snapshot.status === 'paused', hot: isLastStretch(left, planned), timeUp: spent >= planned,
    steps, at, wrong, setWrong, error: error || timer.error,
    recordGain: gain === null ? null : formatSpan(gain),
    suggestion, suggested, choices, rows, weekCount, lastTime: last === null || free ? null : short(last), canMinus: planned > 60,
    start, pick, stop, save, setMinutes,
    logResult: () => onOpenSessionLogger({ sessionType: 'PART_PRACTICE', partNumber: PRESETS[mode].part ?? undefined }),
    /** Mẻ tự do: whether it is on, resting, today's count and the break that comes next. */
    free: {
      on: free, resting, breakMinutes: Math.round(planned / 60), longBreak: snapshot.phase === 'LONG_BREAK',
      gained: gainLabel(spent), todayLabel: studyTimeLabel(studySecondsForDay(runs, today)), focusToday,
      next: rest, interval: settings.longBreakInterval,
      takeBreak, bakeAgain, skipBreak
    }
  };
}
