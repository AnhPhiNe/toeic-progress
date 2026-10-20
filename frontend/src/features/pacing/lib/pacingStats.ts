import type { PacingRun } from '@/shared/types';
import { localDate, PRESETS, type PacingMode } from './pacingModel';
import { studyPacingSeconds } from '@/shared/domain/streak';

export function runSeconds(run: PacingRun): number | null {
  const seconds = run.actualSeconds ?? (run.actualMinutes === undefined ? undefined : run.actualMinutes * 60);
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
export function runAccuracy(run: PacingRun): number | null {
  if (!Number.isInteger(run.totalQuestions) || run.totalQuestions! <= 0 || !Number.isInteger(run.correctAnswers)
    || run.correctAnswers! < 0 || run.correctAnswers! > run.totalQuestions!) return null;
  return run.correctAnswers! / run.totalQuestions! * 100;
}
export function runSpeed(run: PacingRun): number | null {
  const seconds = runSeconds(run);
  return seconds !== null && Number.isInteger(run.totalQuestions) && run.totalQuestions! > 0 ? seconds / run.totalQuestions! : null;
}
export function studySecondsForDay(runs: PacingRun[], date: string): number {
  return runs.reduce((sum, run) => run.date === date ? sum + (studyPacingSeconds(run) ?? 0) : sum, 0);
}
export function studyTimeLabel(seconds: number): string {
  if (seconds > 0 && seconds < 60) return 'Dưới 1 phút';
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ''}`;
}
export function pacingSpeedAxis(runs: PacingRun[]) {
  const maximum = runs.reduce((max, run) => Math.max(max, runSpeed(run) ?? 0), 0);
  const padded = Math.max(1, maximum <= Number.MAX_VALUE / 1.1 ? maximum * 1.1 : maximum);
  const magnitude = 10 ** Math.floor(Math.log10(padded / 5));
  const step = [1, 2, 5, 10].find(value => value * magnitude >= padded / 5)! * magnitude;
  const rounded = Math.ceil(padded / step) * step;
  const ceiling = Number.isFinite(rounded) ? Number(rounded.toPrecision(12)) : maximum;
  const ticks = Array.from({ length: Math.floor(ceiling / step) + 1 }, (_, index) => Number((index * step).toPrecision(12)));
  if (ticks[ticks.length - 1] < ceiling) ticks.push(ceiling);
  return { ceiling, ticks };
}
const chronological = (a: PacingRun, b: PacingRun) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
export type PacingChartScope = 'TODAY' | 'YESTERDAY' | 'LAST_3_DAYS' | 'LAST_7_DAYS' | 'ALL';
const dayTime = (date: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : null;
};
export function pacingChartRuns(runs: PacingRun[], mode: PacingMode, scope: PacingChartScope, today = localDate(Date.now())) {
  const selected = runs.filter(run => !run.deletedAt && run.partType === mode && mode !== 'POMODORO' && runSpeed(run) !== null).sort(chronological);
  if (scope === 'ALL') return selected;
  const end = dayTime(today);
  if (end === null) return [];
  const lastDay = end - (scope === 'YESTERDAY' ? 86400000 : 0);
  const days = scope === 'LAST_7_DAYS' ? 7 : scope === 'LAST_3_DAYS' ? 3 : 1;
  const from = new Date(lastDay - (days - 1) * 86400000).toISOString().slice(0, 10);
  const to = new Date(lastDay).toISOString().slice(0, 10);
  return selected.filter(run => dayTime(run.date) !== null && run.date >= from && run.date <= to);
}
export function runLabel(run: PacingRun): string {
  if (run.partType && run.partType in PRESETS && run.partType !== 'POMODORO') {
    return PRESETS[run.partType as PacingMode].name;
  }
  return run.presetName || (run.partType && run.partType in PRESETS ? PRESETS[run.partType as PacingMode].name : 'Lượt luyện');
}
