import type { StudySession } from '@/shared/types';
import { STAIR_COUNT, buildMilestones, estimateMilestones } from '@/shared/domain/milestones';
import { splitTarget } from '@/features/journey/lib/scoreJourney';
import { MAX_TARGET, MIN_TARGET } from './goalSetup';

/**
 * Changing the goal from Hôm nay (trophy ✎ or the exam chip): one editor on phone and desktop.
 * Sketch: design/previews/mock-goal-edit.html
 */

export const GOAL_STEP = 25;
export const GOAL_PRESETS = [650, 700, 800, 850, 900] as const;

/** −/+ moves to the next multiple of 25 (a typed 735 goes to 750 or 725), kept within 10–990. */
export function stepGoal(value: number, dir: 1 | -1): number {
  const next = dir > 0
    ? Math.floor(value / GOAL_STEP) * GOAL_STEP + GOAL_STEP
    : Math.ceil(value / GOAL_STEP) * GOAL_STEP - GOAL_STEP;
  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, next));
}

/** Highest full L&R score, or null before the first test. */
export function bestScore(sessions: StudySession[]): number | null {
  const scores = sessions
    .filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST' && s.skillType === 'LR' && typeof s.totalScore === 'number' && Number.isFinite(s.totalScore))
    .map(s => s.totalScore as number);
  return scores.length ? Math.max(...scores) : null;
}

/** A goal at or below the best score is already reached: allowed, but said plainly and never celebrated. */
export function isReachedGoal(target: number, best: number | null): boolean {
  return best !== null && target <= best;
}

/** Mini stairs strip: passed (gold), current (green), still to climb (pale). */
export type MiniBar = 'passed' | 'now' | 'next';

export interface GoalPreview {
  /** Stair Sóc stands on with this goal (0-based; -1 before the first test). */
  cur: number;
  /** Sóc's stair with the saved goal: a raise can move her stair index down as the stairs spread out. */
  curBefore: number;
  /** About how many points one stair is worth with this goal. */
  step: number;
  /** True before the first test: the stairs are an estimate. */
  estimate: boolean;
  reached: boolean;
  /** Always STAIR_COUNT bars. */
  bars: MiniBar[];
  split: { listening: number; reading: number };
}

function stairsFor(sessions: StudySession[], target: number): { cur: number; step: number; estimate: boolean } {
  const plan = buildMilestones(sessions, target);
  if (plan.status === 'empty') return { cur: -1, step: estimateMilestones(target).step, estimate: true };
  return { cur: Math.min(plan.currentIndex, STAIR_COUNT - 1), step: plan.step, estimate: false };
}

/** What the stairs look like with `draft` instead of the saved goal `current`: always eight stairs, only their spacing changes. */
export function goalPreview(sessions: StudySession[], current: number, draft: number): GoalPreview {
  const before = stairsFor(sessions, current);
  const next = stairsFor(sessions, draft);
  const reached = isReachedGoal(draft, bestScore(sessions));
  const bars: MiniBar[] = Array.from({ length: STAIR_COUNT }, (_, i) => {
    if (next.estimate) return 'next';
    if (reached || i < next.cur) return 'passed';
    return i === next.cur ? 'now' : 'next';
  });
  return { cur: next.cur, curBefore: before.cur, step: next.step, estimate: next.estimate, reached, bars, split: splitTarget(draft, sessions) };
}

/** Headline of the pale-gold preview box, e.g. "Mỗi bậc ≈ 50 điểm · bạn ở bậc 4/8". */
export function previewHeadline(p: GoalPreview, draft: number): { lead: string; rest: string } {
  const lead = `Mỗi bậc ≈ ${p.step} điểm`;
  if (p.estimate) return { lead, rest: `${STAIR_COUNT} bậc ước lượng tới cúp ${draft}` };
  return { lead, rest: `bạn ở bậc ${p.cur + 1}/${STAIR_COUNT}` };
}

/** One short line Sóc says after saving; `dropped` = the raise moved Sóc's stair index down. */
export function savedLine(input: { reached: boolean; target: number; step: number; dropped: boolean }): string {
  if (input.reached) return `Cúp ${input.target} đã nằm trong tay bạn rồi!`;
  if (input.dropped) return `Mục tiêu ${input.target} rồi, mỗi bậc giờ ~${input.step} điểm!`;
  return `Cúp mới ${input.target}, mình leo tiếp nhé!`;
}

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export type ExamState = { kind: 'none' } | { kind: 'past'; daysAgo: number } | { kind: 'soon'; days: number };

/** No exam date, a date still ahead (days ≥ 0), or one that has passed. */
export function examState(examDate: string | null | undefined, today: string): ExamState {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate) || Number.isNaN(Date.parse(examDate)) || Number.isNaN(Date.parse(today))) return { kind: 'none' };
  const days = dayNumber(examDate) - dayNumber(today);
  return days >= 0 ? { kind: 'soon', days } : { kind: 'past', daysAgo: -days };
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** "Thứ Tư, 23/12". */
export function examDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

// The one-time "Thi xong chưa?" bubble, per owner and per exam date (a new date that passes asks again).
const pastSeenKey = (owner: string | null) => `rd_exam_past_seen_v1:${owner ?? 'guest'}`;
export function hasSeenPastExam(owner: string | null, examDate: string): boolean {
  try { return localStorage.getItem(pastSeenKey(owner)) === examDate; } catch { return true; }
}
export function markPastExamSeen(owner: string | null, examDate: string): void {
  try { localStorage.setItem(pastSeenKey(owner), examDate); } catch { /* The bubble may repeat; harmless. */ }
}

/** Shared with TodayPage: the full-page "Bạn đã chạm cúp" shows once per goal value. */
export const CELEBRATED_KEY = 'rd_goal_celebrated_v1';
/**
 * A goal edited down to (or below) the best score is reached at once: mark it celebrated before saving,
 * so the one-time celebration never fires for an edit.
 */
export function skipCelebrationFor(target: number): void {
  try { localStorage.setItem(CELEBRATED_KEY, String(target)); } catch { /* Without storage the celebration may show; harmless. */ }
}
