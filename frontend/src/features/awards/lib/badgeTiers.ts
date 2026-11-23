/**
 * Hồ sơ của Sóc: 20 badges × 3 tiers (Đồng/Bạc/Vàng), from design/previews/rank-v1/index.html.
 *
 * Every value is computed on the device from the learner's own data. Some badges need a history the
 * app does not store (only the latest review of a card is kept), so they use the closest stored signal:
 *  - Ôn đúng liên tiếp: cards in review order, the longest run whose latest review was right.
 *  - Thẻ khó đã thuộc: reviewStage ≥ 3 (three right in a row) and at least two other reviews (missed).
 *  - Ôn đúng hạn: distinct days with a latest review on them.
 * A per-device best (localStorage) keeps a tier once reached, and the old 45 badges map onto the new
 * ones (LEGACY_FLOOR) so earned history is never lost. Nothing here touches rank points.
 */
import type { DataBundle } from '@/shared/data/dataBundle';
import type { PacingRun, StudySession } from '@/shared/types';
import { deriveStreakWithExtras, doneDates } from '@/shared/domain/streakWeek';
import { scoredFullTests } from '@/features/journey/lib/scoreJourney';
import { clampWeeklyGoal, extraStudyDates } from '@/features/today/lib/habits';
import { localDate } from '@/features/today/lib/todayTasks';
import { isTooShortRun, runSeconds } from '@/features/pacing/lib/pacingStats';
import type { Badge } from './badges';

export type BadgeGroup = 'on' | 'tb' | 'bb' | 'de';
export type MedalIcon = 'repeat' | 'broom' | 'cardok' | 'pencil' | 'calok' | 'up' | 'target' | 'ear' | 'eye' | 'trophy'
  | 'flame' | 'door' | 'week' | 'seven' | 'leaf' | 'doc' | 'clock' | 'timer' | 'read' | 'flag';

export interface TierBadgeDef {
  id: string;
  group: BadgeGroup;
  icon: MedalIcon;
  name: string;
  /** What is counted, e.g. "câu đúng liền khi ôn thẻ". */
  what: string;
  /** Unit after a threshold in the detail rows ("câu liền", "điểm"). */
  unit: string;
  /** Đồng, Bạc, Vàng thresholds. */
  th: readonly [number, number, number];
  /** "+" for gains. */
  pre?: string;
  /** "%" for percentages. */
  suf?: string;
}

export interface TierBadge extends TierBadgeDef {
  /** Current value (the best ever on this device, at least). */
  value: number;
  /** 0 none, 1 Đồng, 2 Bạc, 3 Vàng. */
  tier: 0 | 1 | 2 | 3;
}

export const GROUPS: readonly { key: BadgeGroup; name: string; color: string; tint: string; cta: string; tab: 'mistakes' | 'history' | 'dashboard' | 'exam-mode' }[] = [
  { key: 'on', name: 'Ôn câu sai', color: '#d6416a', tint: '#ffe1e9', cta: 'Ôn thẻ câu sai', tab: 'mistakes' },
  { key: 'tb', name: 'Tiến bộ', color: '#2f8a42', tint: '#e2f5e5', cta: 'Xem hành trình điểm', tab: 'history' },
  { key: 'bb', name: 'Bền bỉ', color: '#d9731a', tint: '#fff0df', cta: 'Học hôm nay', tab: 'dashboard' },
  { key: 'de', name: 'Đề & thời gian', color: '#136fb3', tint: '#e3f1fd', cta: 'Luyện bấm giờ', tab: 'exam-mode' }
];

export const TIER_LABEL = ['Chưa có', 'Đồng', 'Bạc', 'Vàng'] as const;
export const TIER_COLORS = ['#d08a4e', '#9aa9c0', '#f0b400'] as const;

export const TIER_BADGES: readonly TierBadgeDef[] = [
  { id: 'on-streak', group: 'on', icon: 'repeat', name: 'Ôn đúng liên tiếp', what: 'câu đúng liền khi ôn thẻ', unit: 'câu liền', th: [10, 20, 50] },
  { id: 'on-clean', group: 'on', icon: 'broom', name: 'Gỡ sạch đề', what: 'đề đã gỡ hết câu sai', unit: 'đề', th: [1, 3, 10] },
  { id: 'on-hard', group: 'on', icon: 'cardok', name: 'Thẻ khó đã thuộc', what: 'thẻ sai ≥2 lần, giờ đúng 3 lần liền', unit: 'thẻ', th: [10, 50, 200] },
  { id: 'on-reason', group: 'on', icon: 'pencil', name: 'Ghi rõ vì sao sai', what: 'thẻ câu sai có ghi lý do', unit: 'thẻ', th: [20, 80, 250] },
  { id: 'on-due', group: 'on', icon: 'calok', name: 'Ôn đúng hạn', what: 'ngày có ôn thẻ đến hạn', unit: 'ngày', th: [7, 30, 90] },
  { id: 'tb-total', group: 'tb', icon: 'up', name: 'Tiến bộ tổng', what: 'điểm tăng so với đề đầu', unit: 'điểm', th: [50, 100, 200], pre: '+' },
  { id: 'tb-weak', group: 'tb', icon: 'target', name: 'Part yếu tiến bộ', what: '% đúng tăng ở Part yếu nhất', unit: '', th: [5, 10, 20], pre: '+', suf: '%' },
  { id: 'tb-listen', group: 'tb', icon: 'ear', name: 'Tai thính', what: 'điểm Nghe tăng so với đề đầu', unit: 'điểm', th: [30, 60, 120], pre: '+' },
  { id: 'tb-read', group: 'tb', icon: 'eye', name: 'Mắt sáng', what: 'điểm Đọc tăng so với đề đầu', unit: 'điểm', th: [30, 60, 120], pre: '+' },
  { id: 'tb-record', group: 'tb', icon: 'trophy', name: 'Phá kỷ lục', what: 'lần ghi đề cao nhất từ trước', unit: 'lần', th: [1, 3, 6] },
  { id: 'bb-streak', group: 'bb', icon: 'flame', name: 'Chuỗi ngày', what: 'ngày học liền nhau', unit: 'ngày', th: [7, 30, 100] },
  { id: 'bb-back', group: 'bb', icon: 'door', name: 'Quay lại', what: 'lần học lại sau ≥3 ngày nghỉ', unit: 'lần', th: [1, 3, 5] },
  { id: 'bb-week', group: 'bb', icon: 'week', name: 'Tuần trọn vẹn', what: 'tuần đủ mục tiêu học', unit: 'tuần', th: [2, 6, 16] },
  { id: 'bb-parts', group: 'bb', icon: 'seven', name: 'Đủ 7 Part', what: 'tuần luyện đủ cả 7 Part', unit: 'tuần', th: [1, 4, 10] },
  { id: 'bb-vocab', group: 'bb', icon: 'leaf', name: 'Từ vựng mỗi ngày', what: 'ngày có ghi từ vựng', unit: 'ngày', th: [10, 40, 120] },
  { id: 'de-full', group: 'de', icon: 'doc', name: 'Đề full', what: 'đề full đã ghi điểm', unit: 'đề', th: [1, 5, 15] },
  { id: 'de-hours', group: 'de', icon: 'clock', name: 'Giờ học', what: 'giờ học ghi trong app', unit: 'giờ', th: [5, 20, 60] },
  { id: 'de-timer', group: 'de', icon: 'timer', name: 'Bấm giờ Part', what: 'buổi luyện Part có bấm giờ', unit: 'buổi', th: [10, 40, 120] },
  { id: 'de-p7', group: 'de', icon: 'read', name: 'Kịp giờ Part 7', what: 'lần xong Part 7 trong 55 phút', unit: 'lần', th: [1, 5, 15] },
  { id: 'de-mark', group: 'de', icon: 'flag', name: 'Cán mốc', what: 'điểm đề cao nhất đạt mốc', unit: 'điểm', th: [600, 750, 900] }
];

/** Old badge id → [new badge id, the tier it proves]. Applied as a floor so nobody loses what they had. */
export const LEGACY_FLOOR: Readonly<Record<string, [string, 1 | 2 | 3]>> = {
  'score-first': ['de-full', 1], 'effort-tests5': ['de-full', 2], 'effort-tests20': ['de-full', 3], 'effort-tests50': ['de-full', 3],
  'score-record': ['tb-record', 1], 'score-record3': ['tb-record', 2],
  'score-plus100': ['tb-total', 2],
  'score-600': ['de-mark', 1], 'score-800': ['de-mark', 2], 'score-900': ['de-mark', 3],
  'streak-7': ['bb-streak', 1], 'streak-14': ['bb-streak', 1], 'streak-30': ['bb-streak', 2], 'streak-60': ['bb-streak', 2], 'streak-100': ['bb-streak', 3],
  'secret-comeback': ['bb-back', 1],
  'effort-practice10': ['de-timer', 1]
};

const PARTS_MAX: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number> = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 };
const DAY = 86_400_000;
const dayNo = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const mondayOf = (d: string) => dayNo(d) - (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function tierFor(value: number, th: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  return (th.filter(t => value >= t).length) as 0 | 1 | 2 | 3;
}

function gainOver(tests: StudySession[], pick: (t: StudySession) => number | undefined): number {
  const scored = tests.filter(t => num(pick(t)) !== null);
  if (scored.length < 2) return 0;
  const first = pick(scored[0])!;
  return Math.max(0, Math.max(...scored.map(t => pick(t)!)) - first);
}

function weakPartGain(tests: StudySession[]): number {
  const withParts = tests.filter(t => t.partScores);
  if (withParts.length < 2) return 0;
  const pct = (t: StudySession, p: 1 | 2 | 3 | 4 | 5 | 6 | 7) => 100 * (t.partScores![`part${p}` as const] ?? 0) / PARTS_MAX[p];
  const parts = [1, 2, 3, 4, 5, 6, 7] as const;
  const weakest = parts.reduce((w, p) => (pct(withParts[0], p) < pct(withParts[0], w) ? p : w), 1 as 1 | 2 | 3 | 4 | 5 | 6 | 7);
  const best = Math.max(...withParts.slice(1).map(t => pct(t, weakest)));
  return Math.max(0, Math.round(best - pct(withParts[0], weakest)));
}

const P7_LIMIT = 55 * 60;
const isP7InTime = (r: PacingRun) => r.partType === 'PART_7' && !r.finishedNaturally && (runSeconds(r) ?? Infinity) <= P7_LIMIT && !isTooShortRun(r);

/** Raw values for every badge from the learner's data (no stored bests, no legacy floor). */
export function badgeValues(bundle: DataBundle, today: string): Record<string, number> {
  const tests = scoredFullTests(bundle.sessions);
  const sessions = bundle.sessions.filter(s => !s.deletedAt);
  const cards = bundle.mistakes.filter(m => !m.deletedAt);
  const runs = bundle.pacingRuns.filter(r => !r.deletedAt);
  const right = (m: (typeof cards)[number]) => m.status === 'MASTERED' || (m.reviewStage ?? 0) > 0;

  // Ôn câu sai
  const reviewed = cards.filter(m => m.lastReviewedAt && (m.reviewCount ?? 0) > 0).sort((a, b) => a.lastReviewedAt!.localeCompare(b.lastReviewedAt!));
  let run = 0, bestRun = 0;
  for (const m of reviewed) { run = right(m) ? run + 1 : 0; bestRun = Math.max(bestRun, run); }
  const bySession = new Map<string, typeof cards>();
  for (const m of cards) if (m.sessionId) bySession.set(m.sessionId, [...(bySession.get(m.sessionId) ?? []), m]);
  const cleanTests = [...bySession.values()].filter(list => list.length > 0 && list.every(m => m.status === 'MASTERED')).length;
  const hard = cards.filter(m => (m.reviewStage ?? 0) >= 3 && (m.reviewCount ?? 0) - (m.reviewStage ?? 0) >= 2).length;
  const reasons = cards.filter(m => Boolean(m.userReason?.trim())).length;
  const reviewDays = new Set(reviewed.map(m => localDate(m.lastReviewedAt!)).filter(Boolean)).size;

  // Tiến bộ
  const totalGain = gainOver(tests, t => t.totalScore);
  let records = 0, top = -Infinity;
  tests.forEach((t, i) => { const s = t.totalScore ?? 0; if (i > 0 && s > top) records++; top = Math.max(top, s); });

  // Bền bỉ
  const extra = extraStudyDates(bundle.profile, bundle.mistakes);
  const longest = deriveStreakWithExtras(bundle, today, extra).longestStreak;
  const studied = [...doneDates(bundle, today, extra)].sort();
  let comebacks = 0;
  for (let i = 1; i < studied.length; i++) if (dayNo(studied[i]) - dayNo(studied[i - 1]) >= 4) comebacks++;
  const goal = clampWeeklyGoal(bundle.profile.weeklyGoalDays);
  const perWeek = new Map<number, number>();
  for (const d of studied) perWeek.set(mondayOf(d), (perWeek.get(mondayOf(d)) ?? 0) + 1);
  const fullWeeks = [...perWeek.values()].filter(n => n >= goal).length;
  const partsByWeek = new Map<number, Set<number>>();
  const addParts = (d: string, parts: readonly number[]) => { const w = mondayOf(d); const set = partsByWeek.get(w) ?? new Set<number>(); parts.forEach(p => set.add(p)); partsByWeek.set(w, set); };
  for (const s of sessions) {
    if (s.sessionType === 'FULL_TEST') addParts(s.date, [1, 2, 3, 4, 5, 6, 7]);
    else addParts(s.date, (s.practiceParts ?? []).map(p => p.part));
  }
  const PART_OF: Record<string, number> = { PART_5: 5, PART_6: 6, PART_7: 7, PART_7_SINGLE: 7, PART_7_MULTI: 7 };
  for (const r of runs) if (r.partType && PART_OF[r.partType]) addParts(r.date, [PART_OF[r.partType]]);
  const sevenWeeks = [...partsByWeek.values()].filter(set => set.size >= 7).length;
  const vocabDays = new Set(bundle.vocabLog.filter(v => !v.deletedAt).map(v => v.date)).size;

  // Đề & thời gian
  const minutes = sessions.reduce((sum, s) => sum + Math.max(0, num(s.durationMinutes) ?? 0), 0)
    + runs.reduce((sum, r) => sum + Math.max(0, (runSeconds(r) ?? 0) / 60), 0);
  const timed = runs.filter(r => r.partType && r.partType !== 'POMODORO' && runSeconds(r) !== null && !isTooShortRun(r)).length;

  return {
    'on-streak': bestRun, 'on-clean': cleanTests, 'on-hard': hard, 'on-reason': reasons, 'on-due': reviewDays,
    'tb-total': totalGain, 'tb-weak': weakPartGain(tests), 'tb-listen': gainOver(tests, t => t.scaledListening),
    'tb-read': gainOver(tests, t => t.scaledReading), 'tb-record': records,
    'bb-streak': longest, 'bb-back': comebacks, 'bb-week': fullWeeks, 'bb-parts': sevenWeeks, 'bb-vocab': vocabDays,
    'de-full': tests.length, 'de-hours': Math.floor(minutes / 60), 'de-timer': timed, 'de-p7': runs.filter(isP7InTime).length,
    'de-mark': tests.reduce((m, t) => Math.max(m, t.totalScore ?? 0), 0)
  };
}

/**
 * The 20 badges with value and tier. `best` (per-device bests) and `legacy` (old badges earned)
 * only ever raise a badge: a tier once reached stays.
 */
export function computeTierBadges(values: Record<string, number>, best: Record<string, number> = {}, legacy: readonly Pick<Badge, 'id' | 'earned'>[] = []): TierBadge[] {
  const floor: Record<string, number> = {};
  for (const b of legacy) {
    const map = b.earned ? LEGACY_FLOOR[b.id] : undefined;
    if (map) floor[map[0]] = Math.max(floor[map[0]] ?? 0, map[1]);
  }
  return TIER_BADGES.map(def => {
    let value = Math.max(values[def.id] ?? 0, best[def.id] ?? 0);
    const need = floor[def.id];
    if (need && tierFor(value, def.th) < need) value = Math.max(value, def.th[need - 1]);
    return { ...def, value, tier: tierFor(value, def.th) };
  });
}

/** Earned tiers out of 60. */
export const earnedTiers = (badges: readonly TierBadge[]) => badges.reduce((sum, b) => sum + b.tier, 0);
/** Level stars: Đồng 1, Bạc 2, Vàng 3 each (a Vàng badge gives 6). */
export const tierStars = (badges: readonly TierBadge[]) => badges.reduce((sum, b) => sum + (b.tier * (b.tier + 1)) / 2, 0);

export const fmtValue = (b: Pick<TierBadgeDef, 'pre' | 'suf'>, v: number) => `${b.pre && v ? b.pre : ''}${v}${b.suf ?? ''}`;

/** "Bạc · 34/50 tới Vàng", "Vàng · đủ 3 bậc", "3/10 tới Đồng" (none yet): the spoken label of a tile. */
export function badgeLabel(b: TierBadge): string {
  if (b.tier === 3) return 'Vàng · đủ 3 bậc';
  const progress = `${fmtValue(b, b.value)}/${fmtValue(b, b.th[b.tier])} tới ${TIER_LABEL[b.tier + 1]}`;
  return b.tier === 0 ? progress : `${TIER_LABEL[b.tier]} · ${progress}`;
}

/** Two short lines under a badge tile: the tier word, then "100/120 → Vàng", "đủ 3 bậc" or "0/10 → Đồng". */
export function badgeLines(b: TierBadge): [string, string] {
  if (b.tier === 3) return ['Vàng', 'đủ 3 bậc'];
  // No "+" on gains here: tiles are narrow (the spoken label keeps it).
  const n = (v: number) => `${v}${b.suf ?? ''}`;
  return [TIER_LABEL[b.tier], `${n(b.value)}/${n(b.th[b.tier])} → ${TIER_LABEL[b.tier + 1]}`];
}

/** Fill of each of the 3 bar segments, 0..1. */
export function segmentFill(b: TierBadge): [number, number, number] {
  return [0, 1, 2].map(k => {
    if (b.tier > k) return 1;
    if (b.tier < k) return 0;
    const lo = k ? b.th[k - 1] : 0, hi = b.th[k];
    return Math.max(0, Math.min(1, (b.value - lo) / (hi - lo)));
  }) as [number, number, number];
}

/* ---- per-device bests and "new tier" dots ---- */
const bestKey = (owner: string | null) => `rd_badge_best_v2:${owner ?? 'guest'}`;
const seenKey = (owner: string | null) => `rd_badge_tiers_seen_v2:${owner ?? 'guest'}`;

export function loadBest(owner: string | null): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(bestKey(owner)) ?? '{}');
    return raw && typeof raw === 'object' ? Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number> : {};
  } catch { return {}; }
}
export function saveBest(owner: string | null, badges: readonly TierBadge[]): void {
  try {
    const prev = loadBest(owner);
    const next = Object.fromEntries(badges.map(b => [b.id, Math.max(prev[b.id] ?? 0, b.value)]));
    if (JSON.stringify(next) !== JSON.stringify(prev)) localStorage.setItem(bestKey(owner), JSON.stringify(next));
  } catch { /* Bests are a convenience; values recompute from data. */ }
}

/** Tier-ups not shown yet; the first call only records the current tiers. */
export function unseenTiers(badges: readonly TierBadge[], owner: string | null): number {
  try {
    const raw = localStorage.getItem(seenKey(owner));
    if (raw === null) return 0;
    const seen = JSON.parse(raw) as Record<string, number>;
    return badges.filter(b => b.tier > (seen[b.id] ?? 0)).length;
  } catch { return 0; }
}
export function markTiersSeen(badges: readonly TierBadge[], owner: string | null): void {
  try { localStorage.setItem(seenKey(owner), JSON.stringify(Object.fromEntries(badges.map(b => [b.id, b.tier])))); } catch { /* shown again */ }
}
