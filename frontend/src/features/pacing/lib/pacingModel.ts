import type { ReadingPartType } from '@/shared/types';

export const PRESETS = {
  PART_5: { name: 'Part 5', minutes: 12, questions: 30, part: 5, tip: 'Với câu hỏi từ loại, kiểm tra cấu trúc quanh chỗ trống trước. Với câu hỏi từ vựng, đọc đủ ngữ cảnh để chọn nghĩa phù hợp.' },
  PART_6: { name: 'Part 6', minutes: 8, questions: 16, part: 6, tip: 'Đọc đủ ngữ cảnh để xác định thì, từ nối và quan hệ giữa các câu.' },
  PART_7: { name: 'Part 7 · Toàn bộ', minutes: 55, questions: 54, part: 7, tip: 'Phân bổ thời gian cho cả đoạn đơn và đoạn đôi/ba; chuyển câu khi chưa tìm được bằng chứng.' },
  PART_7_SINGLE: { name: 'Part 7 · Đoạn đơn', minutes: 25, questions: 29, part: 7, tip: 'Đọc câu hỏi để định vị thông tin; đối chiếu từ khóa với cách diễn đạt trong đoạn văn.' },
  PART_7_MULTI: { name: 'Part 7 · Đôi/ba', minutes: 30, questions: 25, part: 7, tip: 'Với câu hỏi chéo, kiểm tra thông tin từ các văn bản liên quan trước khi chọn.' },
  FULL_READING: { name: 'Reading', minutes: 75, questions: 100, part: null, tip: 'Phân bổ thời gian theo tiến độ; đánh dấu câu khó để quay lại nếu còn thời gian.' },
  POMODORO: { name: 'Pomodoro', minutes: 25, questions: 0, part: null, tip: 'Tập trung vào một việc trong phiên này; nghỉ ngắn khi hoàn thành.' }
} as const;
export type PacingMode = keyof typeof PRESETS;
export type PomodoroPhase = 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK';
export interface PomodoroSettings { workMinutes: number; shortBreakMinutes: number; longBreakMinutes: number; longBreakInterval: number }
export const DEFAULT_POMODORO: PomodoroSettings = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 };
export function isPacingMode(value: unknown): value is PacingMode { return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, value); }
export function supportedMode(value: ReadingPartType): PacingMode { return isPacingMode(value) ? value : 'PART_5'; }
export const formatClock = (seconds: number) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
export const formatNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
export function localDate(timestamp: number): string { const date = new Date(timestamp); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

export interface TimerSnapshot {
  version: 1;
  id: string;
  owner: string | null;
  mode: PacingMode;
  phase: PomodoroPhase;
  status: 'ready' | 'running' | 'paused' | 'finished';
  plannedSeconds: number;
  questions: number;
  elapsedMs: number;
  runningSince: number | null;
  startedAt: number | null;
  endedAt: number | null;
  name: string;
  correct: string;
}
export function freshTimer(owner: string | null, mode: PacingMode, settings = DEFAULT_POMODORO, phase: PomodoroPhase = 'WORK'): TimerSnapshot {
  const minutes = mode !== 'POMODORO' ? PRESETS[mode].minutes : phase === 'WORK' ? settings.workMinutes : phase === 'SHORT_BREAK' ? settings.shortBreakMinutes : settings.longBreakMinutes;
  return { version: 1, id: `pacing-v2-${crypto.randomUUID()}`, owner, mode, phase, status: 'ready', plannedSeconds: minutes * 60,
    questions: PRESETS[mode].questions, elapsedMs: 0, runningSince: null, startedAt: null, endedAt: null, name: '', correct: '' };
}
export const hasFlexibleQuestions = (mode: PacingMode) => mode === 'PART_7_SINGLE' || mode === 'PART_7_MULTI';
export function configureTimer(timer: TimerSnapshot, plannedMinutes: number, requestedQuestions: number): TimerSnapshot | null {
  if (timer.status !== 'ready' || !Number.isInteger(plannedMinutes) || plannedMinutes < 1 || plannedMinutes > 180) return null;
  const questions = hasFlexibleQuestions(timer.mode) ? requestedQuestions : PRESETS[timer.mode].questions;
  if (!Number.isInteger(questions) || questions < (timer.mode === 'POMODORO' ? 0 : 1) || questions > PRESETS[timer.mode].questions) return null;
  return { ...timer, plannedSeconds: plannedMinutes * 60, questions };
}
export function elapsedMs(timer: TimerSnapshot, now = Date.now()): number {
  return Math.min(timer.plannedSeconds * 1000, Math.max(0, timer.elapsedMs + (timer.status === 'running' && timer.runningSince !== null ? Math.max(0, now - timer.runningSince) : 0)));
}
export function startTimer(timer: TimerSnapshot, now = Date.now()): TimerSnapshot {
  if (timer.status === 'running' || timer.status === 'finished') return timer;
  return { ...timer, status: 'running', runningSince: now, startedAt: timer.startedAt ?? now, endedAt: null };
}
export function pauseTimer(timer: TimerSnapshot, now = Date.now()): TimerSnapshot {
  if (elapsedMs(timer, now) >= timer.plannedSeconds * 1000) return finishTimer(timer, now);
  return { ...timer, status: 'paused', elapsedMs: elapsedMs(timer, now), runningSince: null };
}
export function finishTimer(timer: TimerSnapshot, now = Date.now()): TimerSnapshot {
  if (timer.status === 'finished') return timer;
  const elapsed = elapsedMs(timer, now);
  const natural = elapsed >= timer.plannedSeconds * 1000;
  // If a sleeping tab wakes later, the timer ended at its deadline, not when the tab woke.
  const endedAt = timer.endedAt ?? (natural && timer.runningSince !== null ? timer.runningSince + timer.plannedSeconds * 1000 - timer.elapsedMs : now);
  return { ...timer, status: 'finished', elapsedMs: elapsed, runningSince: null, endedAt };
}
export function parseTimer(value: unknown, owner: string | null): TimerSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const timer = value as TimerSnapshot;
  if (timer.version !== 1 || timer.owner !== owner || !isPacingMode(timer.mode) || !/^pacing-v2-[a-z0-9-]+$/i.test(timer.id)
    || !['WORK', 'SHORT_BREAK', 'LONG_BREAK'].includes(timer.phase) || !['ready', 'running', 'paused', 'finished'].includes(timer.status)
    || !Number.isInteger(timer.plannedSeconds) || timer.plannedSeconds < 60 || timer.plannedSeconds > 10800
    || !Number.isInteger(timer.questions) || (timer.mode === 'POMODORO' ? timer.questions !== 0 : timer.questions < 1 || timer.questions > 100)
    || !Number.isFinite(timer.elapsedMs) || timer.elapsedMs < 0 || timer.elapsedMs > timer.plannedSeconds * 1000
    || typeof timer.name !== 'string' || timer.name.length > 300 || typeof timer.correct !== 'string' || timer.correct.length > 10
    || [timer.runningSince, timer.startedAt, timer.endedAt].some(time => time !== null && (!Number.isFinite(time) || time < 0))
    || (timer.status === 'running' && (timer.runningSince === null || timer.startedAt === null))
    || (timer.status !== 'running' && timer.runningSince !== null)
    || (timer.status === 'finished' && (timer.endedAt === null || timer.startedAt === null))
    || (timer.mode !== 'POMODORO' && timer.phase !== 'WORK')) return null;
  return timer;
}
