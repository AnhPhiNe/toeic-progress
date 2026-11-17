import type { StudySession } from '@/shared/types';
import { convertRawToListeningScore, convertRawToReadingScore } from '@/shared/domain/etsScoring';
import { testNameKey } from '@/shared/domain/testNames';
import { buildMilestones } from '@/shared/domain/milestones';

/** YYYY-MM-DD minus one day, calendar-safe. */
export function previousDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(y, m - 1, d - 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

/** "Hôm nay", "Hôm qua" or "dd/mm". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hôm nay';
  if (date === previousDay(today)) return 'Hôm qua';
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** Test-name chips: the current name first, then the other suggestions, at most `limit`. Newest-looking names come first. */
export function chipNames(current: string, suggestions: string[], recent: string[], limit = 3): string[] {
  const out: string[] = [];
  const add = (name: string) => {
    const clean = name.trim();
    if (clean && !out.some(existing => testNameKey(existing) === testNameKey(clean))) out.push(clean);
  };
  add(current);
  recent.forEach(add);
  suggestions.forEach(add);
  return out.slice(0, limit);
}

/** Names of the latest Full Tests, newest first. */
export function recentTestNames(sessions: StudySession[]): string[] {
  return sessions.filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.testName.trim())
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .map(s => s.testName);
}

/** The latest scored Full Test (not the one being edited): the wheel's starting point and the "so với đề trước" base. */
export function previousScored(sessions: StudySession[], excludeId?: string): StudySession | undefined {
  return sessions.filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.skillType === 'LR' && s.id !== excludeId && (s.totalScore ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Section raw count (0-100) to the scaled score the app already uses for estimates. */
export const scaledFromCount = (skill: 'listening' | 'reading', count: number) =>
  skill === 'listening' ? convertRawToListeningScore(count) : convertRawToReadingScore(count);

/** Smallest raw count whose scaled score reaches `score` (used when switching from points to counts). */
export function countFromScaled(skill: 'listening' | 'reading', score: number): number {
  for (let count = 0; count <= 100; count++) if (scaledFromCount(skill, count) >= score) return count;
  return 100;
}

export function percent(correct: number, total: number): number {
  return total > 0 ? Math.round((clamp(correct, 0, total) / total) * 100) : 0;
}

/** Last 7 days (oldest first, today last) of vocabulary counts. */
export function vocabWeek(log: { date: string; count: number }[], today: string): { date: string; count: number }[] {
  const days: string[] = [today];
  while (days.length < 7) days.unshift(previousDay(days[0]));
  return days.map(date => ({ date, count: log.filter(item => item.date === date).reduce((sum, item) => sum + item.count, 0) }));
}

/** Words logged on one day (all of its live entries added up). */
export function vocabDayTotal(log: { date: string; count: number }[], date: string): number {
  return log.filter(item => item.date === date).reduce((sum, item) => sum + item.count, 0);
}

/** New vocabulary entries start at 20 words, with the same quick picks, on phone and desktop. */
export const VOCAB_DEFAULT = 20;
export const VOCAB_CHIPS = [10, 20, 30, 50] as const;

/** "2026-11-09" -> "09/11". */
export function dayMonth(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** What the vocabulary form needs to pick, fix, or clear a past day. */
export interface VocabEditApi {
  /** True while a day other than a fresh "today" is selected. */
  edit: boolean;
  /** Words already logged on the selected day (0 = nothing to delete). */
  existing: number;
  onPick: (date: string) => void;
  onBack: () => void;
  onDelete: () => void;
}

/** Facts for the phone result screen, from recorded data only. */
export function resultFacts(session: StudySession, sessions: StudySession[], target?: number) {
  const score = session.totalScore ?? 0;
  const others = sessions.filter(s => s.id !== session.id);
  const earlier = others.filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && (s.totalScore ?? 0) > 0
    && `${s.date}|${s.createdAt ?? ''}` < `${session.date}|${session.createdAt ?? ''}`);
  const bestBefore = earlier.length ? Math.max(...earlier.map(s => s.totalScore ?? 0)) : null;
  const previous = [...earlier].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')).pop();
  const delta = previous ? score - (previous.totalScore ?? 0) : null;
  const record = bestBefore !== null && score > bestBefore;
  const plan = target && target > 0 ? buildMilestones([...others, session], target) : null;
  const stair = plan && plan.status !== 'empty' ? { index: plan.currentIndex + 1, total: plan.steps.length } : null;
  return { score, delta, record, first: previous === undefined, stair, remaining: target && target > 0 ? Math.max(0, target - score) : null };
}
