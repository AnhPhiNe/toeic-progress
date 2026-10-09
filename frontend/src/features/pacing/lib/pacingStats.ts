import type { PacingRun } from '@/shared/types';
import { testNameKey } from '@/shared/domain/testNames';
import { PRESETS, type PacingMode } from './pacingModel';

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
const chronological = (a: PacingRun, b: PacingRun) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
export function pacingChartRuns(runs: PacingRun[], mode: PacingMode, scope: 'RECENT_5' | 'ALL' | 'FIRST_ONLY' | 'BEST_ONLY') {
  const selected = runs.filter(run => !run.deletedAt && run.partType === mode && mode !== 'POMODORO' && runSpeed(run) !== null).sort(chronological);
  if (scope === 'RECENT_5') return selected.slice(-5);
  if (scope === 'ALL') return selected;
  const groups = new Map<string, PacingRun[]>();
  for (const run of selected) {
    const name = testNameKey(run.testName ?? '');
    // Unnamed exercises are separate sources, not repeats of one invented test.
    const key = name ? `${name}:${run.totalQuestions}` : `unnamed:${run.id}`;
    const group = groups.get(key) ?? []; group.push(run); groups.set(key, group);
  }
  return [...groups.values()].map(group => scope === 'FIRST_ONLY' ? group[0] : group.reduce((best, candidate) => {
    const a = runAccuracy(best), b = runAccuracy(candidate);
    if (b !== null && (a === null || b > a)) return candidate;
    if (a !== null && b === null || a !== b) return best;
    return runSpeed(candidate)! < runSpeed(best)! ? candidate : best;
  })).sort(chronological);
}
export function runLabel(run: PacingRun): string { return run.presetName || (run.partType && run.partType in PRESETS ? PRESETS[run.partType as PacingMode].name : 'Lượt luyện'); }
