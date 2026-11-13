import type { LRPartScore, ReadingPartType } from '@/shared/types';
import type { DataBundle } from '@/shared/data/dataBundle';
import { getDueMistakes } from '@/features/mistakes/lib/spacedRepetition';
import { rollingPartStats } from '@/shared/domain/learningAnalytics';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';

export type TodayTaskKind = 'REVIEW_MISTAKES' | 'PART_TIMER' | 'WORD_CARDS' | 'FULL_TEST';

/**
 * One item of the Hôm nay card. Tasks only point the learner to a tool that already
 * exists (mistake review, pacing timer, score form); they never stand in for a lesson.
 */
export interface TodayTask {
  /** Stable for one kind on one day, so "Để sau" and done ticks survive re-renders. */
  id: string;
  kind: TodayTaskKind;
  /** "TIẾP THEO · N PHÚT" */
  kicker: string;
  title: string;
  reason: string;
  minutes: number;
  part?: 5 | 6 | 7;
  count?: number;
  done: boolean;
}

export interface TodayTaskOptions {
  /** Word cards are not built yet; the caller passes how many are due. */
  dueWordCards?: number;
}

export const MAX_TODAY_TASKS = 4;
/** One card takes about a minute; a review round is kept between 5 and 15 minutes. */
const MISTAKE_BATCH_CAP = 15;
const MISTAKE_MIN_MINUTES = 5;
const WORD_CARD_MINUTES = 10;
const FULL_TEST_MINUTES = 120;
const FULL_TEST_GAP_DAYS = 7;
const TIMER_MINUTES: Record<5 | 6 | 7, number> = { 5: 15, 6: 15, 7: 20 };

/**
 * The pacing timer only has Reading modes (ReadingPartType: PART_5/6/7, Part 7 single/multi,
 * full Reading). Listening is paced by the audio itself, so Parts 1-4 are never suggested here.
 * A full-Reading run times Parts 5-7 together, so it also counts as practising any of them.
 */
const TIMER_MODES: Record<5 | 6 | 7, readonly ReadingPartType[]> = {
  5: ['PART_5', 'FULL_READING'],
  6: ['PART_6', 'FULL_READING'],
  7: ['PART_7', 'PART_7_SINGLE', 'PART_7_MULTI', 'FULL_READING'],
};
const READING_PARTS = [7, 6, 5] as const; // tie-break toward the larger Part
const ALL_PARTS = ['part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'] as const satisfies readonly (keyof LRPartScore)[];

export const todayKicker = (minutes: number) => `TIẾP THEO · ${minutes} PHÚT`;

function task(kind: TodayTaskKind, today: string, fields: Omit<TodayTask, 'id' | 'kind' | 'kicker'>): TodayTask {
  return { id: `${kind.toLowerCase()}:${today}`, kind, kicker: todayKicker(fields.minutes), ...fields };
}

/** Local calendar date of an ISO timestamp, matching how `today` is produced. */
function localDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function reviewTask(bundle: DataBundle, today: string): TodayTask | null {
  const mistakes = bundle.mistakes.filter(item => !item.deletedAt);
  const due = getDueMistakes(mistakes, today).length;
  const reviewedToday = mistakes.filter(item => item.lastReviewedAt && localDate(item.lastReviewedAt) === today).length;
  // Cards reviewed today are no longer due today, so due + reviewed approximates this
  // morning's queue and keeps the title steady while the learner works through it.
  const batch = Math.min(due + reviewedToday, MISTAKE_BATCH_CAP);
  if (batch === 0) return null;
  return task('REVIEW_MISTAKES', today, {
    title: `Ôn ${batch} câu sai`,
    reason: 'Đến hạn hôm nay',
    minutes: Math.max(MISTAKE_MIN_MINUTES, batch),
    count: batch,
    done: reviewedToday >= batch,
  });
}

function timerTask(bundle: DataBundle, today: string): TodayTask | null {
  const { tests, averages } = rollingPartStats(bundle.sessions);
  if (!tests.length) return null;
  const lostShare = (key: keyof LRPartScore) => 1 - averages[key] / PART_MAX_QUESTIONS[key];
  let part: 5 | 6 | 7 | null = null;
  for (const candidate of READING_PARTS) {
    if (lostShare(`part${candidate}`) <= 0) continue;
    if (part === null || lostShare(`part${candidate}`) > lostShare(`part${part}`)) part = candidate;
  }
  if (part === null) return null;
  const chosen = lostShare(`part${part}`);
  const weakestOverall = ALL_PARTS.every(key => lostShare(key) <= chosen);
  const modes = TIMER_MODES[part];
  const done = bundle.pacingRuns.some(run => !run.deletedAt && run.date === today && run.partType && modes.includes(run.partType));
  return task('PART_TIMER', today, {
    title: `Bấm giờ Part ${part}`,
    // Honest when a Listening Part is actually weaker: this is the weakest one the timer can train.
    reason: weakestOverall ? 'Part bạn sai nhiều nhất' : 'Part đọc bạn sai nhiều nhất',
    minutes: TIMER_MINUTES[part],
    part,
    done,
  });
}

function wordCardTask(today: string, dueWordCards: number): TodayTask | null {
  const count = Math.floor(dueWordCards);
  if (!(count > 0)) return null;
  return task('WORD_CARDS', today, {
    title: `Ôn ${count} thẻ từ`, reason: 'Đến hạn hôm nay', minutes: WORD_CARD_MINUTES, count, done: false,
  });
}

function fullTestTask(bundle: DataBundle, today: string): TodayTask | null {
  const dates = bundle.sessions.filter(item => !item.deletedAt && item.sessionType === 'FULL_TEST' && item.date <= today).map(item => item.date);
  const doneToday = dates.includes(today);
  // Judge the gap as it stood this morning, so logging today's test ticks the task instead of hiding it.
  const before = dates.filter(date => date < today).sort().pop();
  const gap = before ? daysBetween(before, today) : null;
  if (gap !== null && gap <= FULL_TEST_GAP_DAYS) return null;
  return task('FULL_TEST', today, {
    title: 'Làm 1 đề full',
    reason: gap === null ? 'Bạn chưa làm đề full nào' : `Đã ${gap} ngày chưa làm đề`,
    minutes: FULL_TEST_MINUTES,
    done: doneToday,
  });
}

/**
 * Today's short list, in priority order: due mistakes, a timer for the weakest Reading Part,
 * due word cards, then a full test when the last one is over a week old. Done tasks stay in
 * the list (ticked) so the learner sees what they finished; the hero is the first undone one.
 * An empty list means nothing is pending today.
 */
export function pickTodayTasks(bundle: DataBundle, today: string, opts: TodayTaskOptions = {}): TodayTask[] {
  const dueWordCards = opts.dueWordCards ?? 0;
  const hasData = bundle.sessions.some(item => !item.deletedAt)
    || bundle.mistakes.some(item => !item.deletedAt)
    || bundle.pacingRuns.some(item => !item.deletedAt)
    || dueWordCards > 0;
  if (!hasData) {
    return [task('FULL_TEST', today, {
      title: 'Ghi điểm đề đầu tiên',
      reason: 'Để biết mình đang ở đâu',
      minutes: FULL_TEST_MINUTES,
      done: false,
    })];
  }
  return [
    reviewTask(bundle, today),
    timerTask(bundle, today),
    wordCardTask(today, dueWordCards),
    fullTestTask(bundle, today),
  ].filter((item): item is TodayTask => item !== null).slice(0, MAX_TODAY_TASKS);
}
