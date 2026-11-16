import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PacingRun, ReadingPartType, StudySession } from '@/shared/types';
import { readDataBundle } from '@/shared/data/dataBundle';
import { getPracticeParts } from '@/shared/domain/etsScoring';
import { pickTodayTasks } from '@/features/today/lib/todayTasks';
import { usePacingTimer } from './usePacingTimer';
import { PRESETS, elapsedMs, formatClock, isPacingMode, localDate, supportedMode, type PacingMode } from '../lib/pacingModel';
import { pacingRunsNow, readPomodoroSettings, readTimer, savePacingResult } from '../services/pacingStorage';
import { pacingError } from '../lib/pacingErrors';
import { bestSeconds, currentStepIndex, dayLabel, dishOf, formatSpan, isLastStretch, lastSeconds, paceQuestion, paceTag, recipeSteps, recordGain } from '../lib/bakery';
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

const CHOICES: Array<{ mode: PacingMode; label: string }> = [
  { mode: 'PART_5', label: 'Part 5' }, { mode: 'PART_6', label: 'Part 6' }, { mode: 'PART_7', label: 'Part 7' }, { mode: 'FULL_READING', label: 'Cả phần Đọc' }
];
export const bakeryLabel = (mode: PacingMode) => CHOICES.find(c => c.mode === mode)?.label ?? PRESETS[mode].name;
export const bakeryClock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${formatClock(s % 3600)}` : formatClock(s);
};
/** Times written in words and tags: 7:40, not 07:40. The oven display keeps two digits. */
const short = (seconds: number) => bakeryClock(seconds).replace(/^0(?=\d:)/, '');

/**
 * Everything the bakery (Luyện tập) needs, shared by the computer page and the phone page:
 * the timer, sounds, recipe steps, saving, the Part choices and the recent bakes. The views only draw it.
 */
export function useBakery({ owner, sessions, initialPart, onOpenSessionLogger, onSessionsChanged, onFocusChange }: BakeryOptions) {
  const [settings] = useState(() => readPomodoroSettings(owner));
  const [hadDraft] = useState(() => readTimer(owner) !== null);
  const timer = usePacingTimer(owner, supportedMode(initialPart ?? 'PART_5'), settings);
  const { snapshot, now } = timer;
  const [runs, setRuns] = useState<PacingRun[]>(pacingRunsNow);
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState(0);
  const saving = useRef(false);
  const audio = useRef<AudioContext | null>(null);
  const played = useRef<string | null>(null);
  const step = useRef<{ id: string; index: number } | null>(null);

  // Pomodoro lives in the older view; land on a Reading preset here.
  useEffect(() => { if (snapshot.mode === 'POMODORO' && snapshot.status === 'ready') timer.reset('PART_5'); }, [snapshot.mode, snapshot.status, timer]);
  const mode: PacingMode = snapshot.mode === 'POMODORO' ? 'PART_5' : snapshot.mode;
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

  const tone = useCallback((from: number, to: number, volume: number, length: number) => {
    try {
      const ctx = audio.current; if (!ctx) return;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.setValueAtTime(from, ctx.currentTime); osc.frequency.setValueAtTime(to, ctx.currentTime + length / 4);
      gain.gain.setValueAtTime(volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + length);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + length);
    } catch { /* Sound is optional. */ }
  }, []);

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
  const steps = useMemo(() => recipeSteps(questions, at), [questions, at]);
  const stepIndex = currentStepIndex(steps);
  useEffect(() => {
    const before = step.current;
    step.current = { id: snapshot.id, index: stepIndex };
    if (snapshot.status === 'running' && before && before.id === snapshot.id && stepIndex > before.index) tone(1318.5, 1760, .06, .35);
  }, [stepIndex, snapshot.id, snapshot.status, tone]);

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
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')), [sessions]);
  const weekStart = useMemo(() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return localDate(d.getTime()); }, []);
  const weekCount = recent.filter(s => s.date >= weekStart).length;
  const runOf = (id: string) => runs.find(r => r.id === id && !r.deletedAt);

  const choices: BakeryChoice[] = CHOICES.map(c => {
    const best = bestSeconds(runs, c.mode);
    return { mode: c.mode, label: c.label, questions: PRESETS[c.mode].questions, minutes: PRESETS[c.mode].minutes, record: best === null ? null : short(best) };
  });
  const today = localDate(Date.now());
  const rows: RecentRow[] = recent.slice(0, 60).map(s => {
    const parts = getPracticeParts(s), run = runOf(s.id);
    const wrongTotal = parts.reduce((a, p) => a + (p.total - p.correct), 0), total = parts.reduce((a, p) => a + p.total, 0);
    const graded = run ? run.correctAnswers !== undefined : parts.length > 0;
    const kind = run?.partType, runMode = kind && isPacingMode(kind) && CHOICES.some(c => c.mode === kind) ? kind : null;
    const name = parts.length ? parts.map(p => `Part ${p.part}`).join(' + ') : runMode ? bakeryLabel(runMode) : run?.presetName ?? 'Part';
    const secs = run?.actualSeconds;
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
  const gain = snapshot.status === 'finished' ? recordGain(bestSeconds(runs, mode), spent, spent >= planned) : null;

  return {
    timer, status: snapshot.status, mode, label: bakeryLabel(mode), planned, questions, spent, left,
    plannedMinutes: Math.round(planned / 60), progress: planned ? Math.min(1, spent / planned) : 0,
    clock: bakeryClock(left), plannedClock: bakeryClock(planned), spentShort: short(spent),
    paused: snapshot.status === 'paused', hot: isLastStretch(left, planned), timeUp: spent >= planned,
    steps, at, wrong, setWrong, error: error || timer.error,
    recordGain: gain === null ? null : formatSpan(gain),
    suggestion, suggested, choices, rows, weekCount, lastTime: last === null ? null : short(last), canMinus: planned > 60,
    start, pick, stop, save,
    setMinutes: (delta: number) => timer.configure(Math.min(180, Math.max(1, planned / 60 + delta)), questions),
    logResult: () => onOpenSessionLogger({ sessionType: 'PART_PRACTICE', partNumber: PRESETS[mode].part ?? undefined })
  };
}
