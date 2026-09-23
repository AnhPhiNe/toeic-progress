import type { ErrorCategory, LRPartScore, MistakeEntry, PacingRun, StudySession } from '../types';
import type { VocabLog } from './dataBundle';
import { PART_MAX_QUESTIONS } from './etsScoring';

const PARTS = ['part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'] as const;

function order(a: StudySession, b: StudySession): number {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
}

export function recentFirstAttempts(sessions: StudySession[], limit = 5): StudySession[] {
  const seen = new Set<string>();
  const first: StudySession[] = [];
  for (const session of [...sessions].filter(item => !item.deletedAt && item.sessionType === 'FULL_TEST').sort(order)) {
    const key = session.testName.trim().toLocaleLowerCase('vi');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if ((session.attemptNumber || 1) > 1 || !session.partScores || !Number.isFinite(session.totalScore) || (session.totalScore || 0) < 10 || (session.totalScore || 0) > 990) continue;
    if (!PARTS.every(part => Number.isInteger(session.partScores?.[part]) && (session.partScores?.[part] || 0) >= 0 && (session.partScores?.[part] || 0) <= PART_MAX_QUESTIONS[part])) continue;
    first.push(session);
  }
  return first.reverse().slice(0, limit);
}

export function rollingPartStats(sessions: StudySession[]) {
  const tests = recentFirstAttempts(sessions);
  const averages = {} as Record<keyof LRPartScore, number>;
  const accuracy = {} as Record<keyof LRPartScore, number>;
  for (const key of PARTS) {
    const average = tests.length ? tests.reduce((sum, item) => sum + (item.partScores?.[key] || 0), 0) / tests.length : 0;
    averages[key] = average;
    accuracy[key] = tests.length ? Math.round((average / PART_MAX_QUESTIONS[key]) * 100) : 0;
  }
  const scores = tests.map(item => item.totalScore || 0);
  const mean = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const stability = scores.length > 1
    ? Math.round(Math.sqrt(scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length))
    : null;
  return { tests, averages, accuracy, stability };
}

export function causePriority(sessions: StudySession[], mistakes: MistakeEntry[]) {
  const rolling = rollingPartStats(sessions);
  const activeMistakes = mistakes.filter(item => !item.deletedAt);
  const eligible = rolling.tests.length >= 3 && activeMistakes.length >= 10;
  const frequency = new Map<ErrorCategory, number>();
  for (const mistake of activeMistakes) frequency.set(mistake.category, (frequency.get(mistake.category) || 0) + 1);
  const rows = new Map<ErrorCategory, { category: ErrorCategory; count: number; estimatedPoints: number }>();
  for (const [category, count] of frequency) rows.set(category, { category, count, estimatedPoints: 0 });
  if (eligible) {
    for (const key of PARTS) {
      const part = Number(key.slice(4));
      const errors = activeMistakes.filter(item => item.part === part);
      if (!errors.length) continue;
      const lost = (PART_MAX_QUESTIONS[key] - rolling.averages[key]) * 5;
      for (const error of errors) {
        const row = rows.get(error.category);
        if (row) row.estimatedPoints += lost / errors.length;
      }
    }
  }
  return {
    eligible,
    testsUsed: rolling.tests.length,
    mistakeCount: activeMistakes.length,
    rows: [...rows.values()].sort((a, b) => eligible
      ? b.estimatedPoints - a.estimatedPoints || b.count - a.count
      : b.count - a.count)
  };
}

export function phaseOverruns(runs: PacingRun[]) {
  const marked = runs.filter(run => !run.deletedAt && run.phases.length > 0);
  const byPreset = new Map<string, PacingRun[]>();
  for (const run of marked) byPreset.set(run.presetId, [...(byPreset.get(run.presetId) || []), run]);
  const mostUsed = [...byPreset.values()].sort((a, b) => b.length - a.length)[0] || [];
  if (mostUsed.length < 3) return { runsUsed: mostUsed.length, phases: [] as Array<{ name: string; averageOverrun: number; count: number }> };
  const phases = new Map<string, { total: number; count: number }>();
  for (const run of mostUsed) for (const phase of run.phases) {
    const current = phases.get(phase.name) || { total: 0, count: 0 };
    phases.set(phase.name, { total: current.total + phase.overrunMinutes, count: current.count + 1 });
  }
  return {
    runsUsed: mostUsed.length,
    phases: [...phases].map(([name, value]) => ({ name, averageOverrun: Math.round((value.total / value.count) * 10) / 10, count: value.count }))
  };
}

export function heatmapDays(sessions: StudySession[], vocabLog: VocabLog[], today: string) {
  const studied = new Set(sessions.filter(item => !item.deletedAt).map(item => item.date));
  const vocabulary = new Set(vocabLog.filter(item => !item.deletedAt && item.count > 0).map(item => item.date));
  const end = new Date(`${today}T12:00:00`);
  return Array.from({ length: 84 }, (_, index) => {
    const day = new Date(end);
    day.setDate(end.getDate() - (83 - index));
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return { date, active: studied.has(date) || vocabulary.has(date), session: studied.has(date), vocabulary: vocabulary.has(date) };
  });
}
