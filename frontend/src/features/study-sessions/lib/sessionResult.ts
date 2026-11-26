import type { ErrorCategory, LRPartScore, MistakeEntry, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { PART_NUMBERS, normalizeQuestionList, partOfQuestion, type PartNumber } from '@/shared/domain/questionNumbers';
import { canReview } from '@/features/mistakes/lib/spacedRepetition';
import { draftQuestions } from '@/features/mistakes/lib/mistakeDrafts';

export type MamStage = 'sprout' | 'leaves' | 'lush' | 'bloom';

/**
 * The one next step after a test, chosen by what the learner has recorded:
 * mark the wrong questions, fill in the Reading cards, review cards that are ready, or nothing left to do.
 */
export type ResultStep = 'mark' | 'detail' | 'review' | 'done';

export interface PartLoss { part: PartNumber; wrong: number; total: number }
export interface CategoryLoss { category: ErrorCategory; label: string; count: number }

export interface SessionResultSummary {
  score: number;
  listening?: number;
  reading?: number;
  /** Change from the previous Full Test; null for the first one. */
  delta: number | null;
  mood: 'happy' | 'calm';
  headline: string;
  subline: string;
  goal?: { target: number; remaining: number; fillPercent: number; gainFromPercent?: number };
  stage: MamStage;
  step: ResultStep;
  partLosses: PartLoss[];
  categoryLosses: CategoryLoss[];
  /** Reading questions that became notebook cards and still need their content. */
  detailCount: number;
  reviewIds: string[];
}

const scored = (session: StudySession) => !session.deletedAt && session.sessionType === 'FULL_TEST' && session.skillType === 'LR'
  && typeof session.totalScore === 'number' && session.totalScore > 0;
const orderKey = (session: StudySession) => `${session.date}|${session.createdAt ?? ''}|${session.id}`;
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

function partLossesOf(session: StudySession): PartLoss[] {
  const totals = (part: PartNumber) => PART_MAX_QUESTIONS[`part${part}` as keyof LRPartScore];
  let wrongByPart: Partial<Record<PartNumber, number>> = {};
  if (session.wrongQuestions) {
    for (const question of normalizeQuestionList(session.wrongQuestions)) {
      const part = partOfQuestion(question);
      if (part) wrongByPart[part] = (wrongByPart[part] ?? 0) + 1;
    }
  } else if (session.partScores) {
    wrongByPart = Object.fromEntries(PART_NUMBERS.map(part => [part, Math.max(0, totals(part) - (session.partScores![`part${part}` as keyof LRPartScore] ?? 0))]));
  }
  return PART_NUMBERS.map(part => ({ part, wrong: wrongByPart[part] ?? 0, total: totals(part) }))
    .filter(loss => loss.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.wrong / b.total - a.wrong / a.total || a.part - b.part)
    .slice(0, 3);
}

function stageOf(peak: number, first: number, target?: number): MamStage {
  if (!target) return 'leaves';
  if (peak >= target) return 'bloom';
  if (target - peak < 100) return 'lush';
  const span = target - first;
  return span > 0 && (peak - first) / span >= 1 / 3 ? 'leaves' : 'sprout';
}

/** Everything the result screen shows right after a Full Test is saved, computed from recorded data only. */
export function summarizeSessionResult(session: StudySession, sessions: StudySession[], mistakes: MistakeEntry[], target?: number): SessionResultSummary {
  const score = session.totalScore ?? 0;
  const key = orderKey(session);
  const earlier = sessions.filter(other => other.id !== session.id && scored(other) && orderKey(other) < key)
    .sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
  const previous = earlier[earlier.length - 1];
  const delta = previous ? score - previous.totalScore! : null;
  const bestBefore = earlier.length ? Math.max(...earlier.map(other => other.totalScore!)) : null;

  let headline: string, subline: string;
  if (delta === null) {
    headline = 'Đã lưu bài đầu tiên!';
    subline = 'Từ giờ mỗi bài sẽ được so với bài này.';
  } else if (delta > 0) {
    headline = `Tăng ${delta} điểm!`;
    subline = bestBefore !== null && score > bestBefore ? 'Điểm cao nhất của bạn từ trước tới giờ.' : 'Cao hơn lần trước rồi.';
  } else if (delta === 0) {
    headline = 'Giữ vững phong độ';
    subline = 'Bằng đúng điểm lần trước.';
  } else {
    headline = `Giảm ${-delta} điểm lần này`;
    const recent = [...earlier.slice(-2).map(other => other.totalScore!), score];
    const before = earlier.slice(-5, -2).map(other => other.totalScore!);
    const trend = before.length ? Math.round(average(recent) - average(before)) : 0;
    subline = trend > 0 ? `Không sao. Trung bình 3 bài gần nhất của bạn vẫn tăng ${trend} điểm.` : 'Không sao, một bài chưa nói lên tất cả.';
  }

  const goal = target && target > 0 ? {
    target,
    remaining: Math.max(0, target - score),
    fillPercent: clampPercent(score / target * 100),
    ...(delta !== null && delta > 0 ? { gainFromPercent: clampPercent(previous!.totalScore! / target * 100) } : {})
  } : undefined;
  const peak = Math.max(score, bestBefore ?? 0);
  const first = earlier[0]?.totalScore ?? score;

  const linked = mistakes.filter(mistake => !mistake.deletedAt && mistake.sessionId === session.id);
  const ready = linked.filter(canReview);
  const counts = new Map<ErrorCategory, number>();
  for (const card of ready) {
    const category = Object.prototype.hasOwnProperty.call(ERROR_CATEGORY_LABELS, card.category) ? card.category : 'OTHER';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const categoryLosses = [...counts].map(([category, count]) => ({ category, label: ERROR_CATEGORY_LABELS[category].label, count }))
    .sort((a, b) => b.count - a.count).slice(0, 3);
  const readyNumbers = new Set(ready.map(card => card.questionNumber));
  const detailCount = draftQuestions(session).filter(question => !readyNumbers.has(question)).length;

  const step: ResultStep = !session.wrongQuestions ? 'mark' : ready.length ? 'review' : detailCount ? 'detail' : 'done';
  return {
    score, listening: session.scaledListening, reading: session.scaledReading, delta,
    mood: delta !== null && delta < 0 ? 'calm' : 'happy', headline, subline, goal,
    stage: stageOf(peak, first, target), step, partLosses: partLossesOf(session), categoryLosses,
    detailCount, reviewIds: ready.map(card => card.id)
  };
}
