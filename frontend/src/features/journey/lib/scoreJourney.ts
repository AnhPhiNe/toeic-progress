/**
 * Pure logic for "Hành trình điểm › Điểm số" (sketches: design/previews/mock-journey-score2.html and
 * mock-journey-cases.html). The x-axis is one slot per Full Test, never calendar time, so every number the UI
 * shows (trend, "Chạm X ở đây", headline) is derived from the same slot-indexed points returned here.
 */
import type { StudySession } from '@/shared/types';
import { testNameKey } from '@/shared/domain/testNames';

export type ScoreMetric = 'total' | 'listening' | 'reading';
export type ExcludeReason = 'drop' | 'spike';

export interface JourneyPoint {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  testName: string;
  /** The plotted value for the chosen metric (total, Nghe or Đọc). */
  score: number;
  total: number;
  listening: number | null;
  reading: number | null;
  /** Same test name seen earlier, or attemptNumber > 1: shown with a "làm lại" tag. */
  retake: boolean;
  /** 0-based index of the date bracket inside the shown window; equal values share one date label. */
  sameDayGroup: number;
  /** Left out of the trend and forecast (the dashed hollow dot in the sketch). */
  excluded: boolean;
  /** Why the test looked abnormal. Kept when the learner forced it back in, so the UI can still explain it. */
  excludeReason: ExcludeReason | null;
  /** The learner pressed "Vẫn tính đề này" for this id. */
  forced: boolean;
  /** score minus what the recent trend expected; null when there was too little history to judge. */
  deviation: number | null;
}

export interface JourneySeries {
  points: JourneyPoint[];
  /** Older tests left off the chart ("+N đề" chip). */
  hiddenCount: number;
}

export interface JourneyOptions {
  limit?: number;
  forceInclude?: string[];
  metric?: ScoreMetric;
}

export const DEFAULT_LIMIT = 8;
/** Empty future slots after the last test in which the "Chạm X ở đây" point may land (sketch GHOST = 3). */
export const GHOST_SLOTS = 3;
const MAX_TOTAL = 990;
const MAX_SECTION = 495;
/** Trend window used to judge whether the next test is abnormal. */
const OUTLIER_WINDOW = 6;
const OUTLIER_MIN_HISTORY = 3;
const OUTLIER_SD_FACTOR = 2.5;
/** Normal test-to-test noise is ±30-50 on the total; below these floors a test is never "abnormal". */
const OUTLIER_FLOOR: Record<ScoreMetric, number> = { total: 60, listening: 40, reading: 40 };

function metricMax(metric: ScoreMetric): number {
  return metric === 'total' ? MAX_TOTAL : MAX_SECTION;
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metricValue(session: StudySession, metric: ScoreMetric): number | null {
  if (metric === 'listening') return finiteOrNull(session.scaledListening);
  if (metric === 'reading') return finiteOrNull(session.scaledReading);
  return finiteOrNull(session.totalScore);
}

/** Active L&R Full Tests with a total score, oldest first. */
export function scoredFullTests(sessions: StudySession[]): StudySession[] {
  return sessions
    .filter(s => !s.deletedAt && s.skillType === 'LR' && s.sessionType === 'FULL_TEST' && finiteOrNull(s.totalScore) !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export interface LineFit {
  /** value at x = 0 */
  intercept: number;
  /** points per test slot */
  slope: number;
  /** residual standard deviation (n - 2 degrees of freedom, at least 1) */
  sd: number;
}

/** Ordinary least squares, as in both sketches. A single point gives a flat line through it. */
export function fitLine(xs: number[], ys: number[]): LineFit | null {
  const n = xs.length;
  if (!n || n !== ys.length) return null;
  const mx = xs.reduce((a, x) => a + x, 0) / n;
  const my = ys.reduce((a, y) => a + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const ss = xs.reduce((q, x, i) => q + (ys[i] - (intercept + slope * x)) ** 2, 0);
  return { intercept, slope, sd: Math.sqrt(ss / Math.max(1, n - 2)) };
}

/**
 * Builds the chart series. Abnormal tests are judged over the learner's whole history (so the first shown test is
 * judged too), then the last `limit` tests are returned.
 *
 * Abnormal rule: fit a line through the previous (up to 6) trend tests, needing at least 3; a test whose score is
 * further from that line than max(floor, 2.5 × residual sd) is excluded. If the next test lands off the line in the
 * same direction too, the learner's level has really moved, so both are counted again (one bad day is noise, two in a
 * row is a trend we must not hide). "Vẫn tính đề này" ids in `forceInclude` are always counted.
 */
export function journeySeries(sessions: StudySession[], opts: JourneyOptions = {}): JourneySeries {
  const metric = opts.metric ?? 'total';
  const limit = Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT));
  const forced = new Set(opts.forceInclude ?? []);
  const seen = new Set<string>();
  const all: JourneyPoint[] = [];

  for (const session of scoredFullTests(sessions)) {
    const key = testNameKey(session.testName);
    const retake = (session.attemptNumber ?? 1) > 1 || (!!key && seen.has(key));
    if (key) seen.add(key);
    const score = metricValue(session, metric);
    if (score === null) continue;
    all.push({
      id: session.id,
      date: session.date,
      testName: session.testName,
      score,
      total: session.totalScore as number,
      listening: finiteOrNull(session.scaledListening),
      reading: finiteOrNull(session.scaledReading),
      retake,
      sameDayGroup: 0,
      excluded: false,
      excludeReason: null,
      forced: forced.has(session.id),
      deviation: null
    });
  }

  const floor = OUTLIER_FLOOR[metric];
  all.forEach((point, i) => {
    const prior: number[] = [];
    for (let j = i - 1; j >= 0 && prior.length < OUTLIER_WINDOW; j--) if (!all[j].excluded) prior.unshift(j);
    if (prior.length < OUTLIER_MIN_HISTORY) return;
    const fit = fitLine(prior, prior.map(j => all[j].score));
    if (!fit) return;
    const deviation = point.score - (fit.intercept + fit.slope * i);
    point.deviation = Math.round(deviation);
    if (Math.abs(deviation) <= Math.max(floor, OUTLIER_SD_FACTOR * fit.sd)) return;
    const reason: ExcludeReason = deviation < 0 ? 'drop' : 'spike';
    const previous = all[i - 1];
    if (previous.excludeReason === reason && previous.excluded) {
      // Sustained move: the earlier "outlier" was the start of a new level.
      previous.excluded = false;
      previous.excludeReason = null;
      return;
    }
    point.excludeReason = reason;
    point.excluded = !point.forced;
  });

  const points = all.slice(-limit);
  let group = -1;
  points.forEach((point, i) => {
    if (i === 0 || point.date !== points[i - 1].date) group++;
    point.sameDayGroup = group;
  });
  return { points, hiddenCount: all.length - points.length };
}

export function journeyPoints(sessions: StudySession[], opts?: JourneyOptions): JourneyPoint[] {
  return journeySeries(sessions, opts).points;
}

/** Trend through the counted points, x = slot index in the shown window (excluded tests keep their slot). */
export function trendFit(points: JourneyPoint[]): LineFit | null {
  const used = points.map((p, i) => [i, p.score] as const).filter((_, i) => !points[i].excluded);
  return fitLine(used.map(u => u[0]), used.map(u => u[1]));
}

const round10 = (value: number) => Math.round(value / 10) * 10;
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/**
 * Splits an overall target into Nghe / Đọc targets.
 *
 * The split keeps the learner's current balance: Nghe's share of the target equals Nghe's share of their recent
 * L+R (average of the last 3 first-attempt Full Tests with both sections; retakes only when nothing else exists,
 * because a remembered test inflates one section). A learner at 390 Nghe / 375 Đọc aiming for 800 gets 410 / 390,
 * as in the sketch. With no section scores the split is even.
 *
 * Nghe is rounded to 10 and Đọc takes the rest, so the two always sum to the target (both are multiples of 10
 * whenever the target is). Each side is capped at 495, which pushes the remainder to the other side.
 */
export function splitTarget(target: number, sessions: StudySession[]): { listening: number; reading: number } {
  const goal = clamp(Math.round(Number.isFinite(target) ? target : 0), 0, MAX_TOTAL);
  const withSections = scoredFullTests(sessions)
    .filter(s => finiteOrNull(s.scaledListening) !== null && finiteOrNull(s.scaledReading) !== null);
  const firstTries = withSections.filter((s, i) => (s.attemptNumber ?? 1) <= 1
    && !withSections.slice(0, i).some(prev => testNameKey(prev.testName) === testNameKey(s.testName)));
  const recent = (firstTries.length ? firstTries : withSections).slice(-3);
  const l = recent.reduce((a, s) => a + (s.scaledListening as number), 0);
  const r = recent.reduce((a, s) => a + (s.scaledReading as number), 0);
  const share = l + r > 0 ? l / (l + r) : 0.5;
  const listening = clamp(round10(goal * share), Math.max(0, goal - MAX_SECTION), Math.min(MAX_SECTION, goal));
  return { listening, reading: goal - listening };
}

export interface YScale {
  min: number;
  max: number;
  step: number;
  /** Faint guide values; any guide within 20 of a drawn target line is dropped so labels never collide. */
  ticks: number[];
  /**
   * The target is more than 150 above the best test: it is pinned as a badge at the top edge ("↑ Mục tiêu 800,
   * còn N điểm") instead of being drawn, so the score line is not squashed to the bottom of the chart.
   */
  targetPinned: boolean;
}

/**
 * Adaptive y-range and faint guides, following the sketch: range = lowest test − 20 up to the target (+15) or the
 * best of test/forecast (+40 when the target is pinned); step is the smallest of 25 / 50 / 100 giving at most 6
 * guides. Pass `forecastScore` so the "Chạm X ở đây" dot stays inside the range.
 */
export function yGuides(points: JourneyPoint[], target: number, opts: { forecastScore?: number | null; metric?: ScoreMetric } = {}): YScale {
  const cap = metricMax(opts.metric ?? 'total');
  const scores = points.map(p => p.score);
  const extra = typeof opts.forecastScore === 'number' && Number.isFinite(opts.forecastScore) ? [opts.forecastScore] : [];
  if (!scores.length) scores.push(Number.isFinite(target) ? target : cap / 2);
  const best = Math.max(...scores);
  const targetPinned = Number.isFinite(target) && target - best > 150;
  const min = Math.max(0, Math.min(...scores, ...extra) - 20);
  let max = targetPinned || !Number.isFinite(target)
    ? Math.max(best, ...extra) + 40
    : Math.max(target, ...extra) + 15;
  max = Math.min(cap, Math.max(max, min + 40));
  const span = max - min;
  const step = [25, 50, 100].find(s => span / s <= 6) ?? 100;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v < max; v += step) {
    if (!targetPinned && Number.isFinite(target) && Math.abs(v - target) < 20) continue;
    ticks.push(v);
  }
  return { min, max, step, ticks, targetPinned };
}

export type Forecast =
  | {
    kind: 'reached';
    /** Days until the exam (0 = exam day), null when there is no future exam date. */
    daysLeft: number | null;
  }
  | {
    kind: 'rising';
    /** Points gained per test on the trend line. */
    slopePerTest: number;
    /** Trend reaches the target after this many more tests ("khoảng N đề nữa"), ≥ 1. */
    testsAhead: number;
    /** Slot index (in the shown window, may be past the last point) for the pink "Chạm X ở đây" dot. */
    slot: number;
    /** Trend value drawn at that slot, rounded to 5. */
    score: number;
    /** False when the hit falls past the GHOST_SLOTS empty slots: the UI then uses the "ngày thi khoảng X" headline. */
    inView: boolean;
    /** Estimated date of that test from the learner's own test pace; null when the pace is unknown. */
    estDate: string | null;
    /** estDate is on or before the exam; null when either is unknown. */
    beforeExam: boolean | null;
    daysLeft: number | null;
    /** Trend value expected on exam day, rounded to 5 and capped; null without an exam date or a known pace. */
    atExam: number | null;
  };

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
const isoFromDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const round5 = (value: number) => Math.round(value / 5) * 5;

/** Whole days from today to the exam; null when no valid exam date or the exam has passed. */
export function daysUntil(examDate: string | null | undefined, today: string): number | null {
  if (!examDate || Number.isNaN(Date.parse(examDate)) || Number.isNaN(Date.parse(today))) return null;
  const days = dayNumber(examDate) - dayNumber(today);
  return days >= 0 ? days : null;
}

/** Below this the line counts as flat: no forecast dot, no promise. */
const MIN_SLOPE = 0.5;

/**
 * Where the trend meets the target, in tests ("khoảng 2 đề nữa"), the method of mock-journey-score2: an OLS line
 * over the counted shown points with x = test slot; the hit slot is the first whole slot after the last test where
 * the line is at or above the target. To place it in time, the learner's pace is the average days between tests in
 * the window (first to last date ÷ gaps); exam-day value = trend at last slot + daysLeft ÷ daysPerTest.
 *
 * Returns { kind: 'reached' } when the latest counted test is already at the target, and null when there is
 * nothing to promise: fewer than 2 counted tests, or a flat/falling trend. The UI then shows an encouraging message
 * rather than a forecast; it never projects a decline.
 */
export function forecast(points: JourneyPoint[], target: number, examDate: string | null | undefined, today: string, opts: { metric?: ScoreMetric } = {}): Forecast | null {
  const counted = points.filter(p => !p.excluded);
  if (!counted.length || !Number.isFinite(target)) return null;
  const daysLeft = daysUntil(examDate, today);
  if (counted[counted.length - 1].score >= target) return { kind: 'reached', daysLeft };
  if (counted.length < 2) return null;
  const fit = trendFit(points);
  if (!fit || fit.slope < MIN_SLOPE) return null;

  const cap = metricMax(opts.metric ?? 'total');
  const last = points.length - 1;
  const at = (slot: number) => fit.intercept + fit.slope * slot;
  const crossing = (target - fit.intercept) / fit.slope;
  const testsAhead = Math.max(1, Math.ceil(crossing - last - 1e-9));
  const slot = last + testsAhead;

  const span = dayNumber(points[last].date) - dayNumber(points[0].date);
  const daysPerTest = last > 0 && span > 0 ? span / last : null;
  const estDay = daysPerTest === null ? null : dayNumber(points[last].date) + Math.round(testsAhead * daysPerTest);
  const examDay = daysLeft === null ? null : dayNumber(today) + daysLeft;
  const atExam = daysPerTest === null || daysLeft === null
    ? null
    : Math.min(cap, round5(at(last + Math.max(0, examDay! - dayNumber(points[last].date)) / daysPerTest)));

  return {
    kind: 'rising',
    slopePerTest: fit.slope,
    testsAhead,
    slot,
    score: Math.min(cap, round5(at(slot))),
    inView: testsAhead <= GHOST_SLOTS,
    estDate: estDay === null ? null : isoFromDay(estDay),
    beforeExam: estDay === null || examDay === null ? null : estDay <= examDay,
    daysLeft,
    atExam
  };
}
