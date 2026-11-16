import type { DataBundle } from '@/shared/data/dataBundle';
import type { PacingRun, StudySession } from '@/shared/types';
import { deriveStreakWithExtras, doneDates } from '@/shared/domain/streakWeek';
import { wrongCountsByPart } from '@/features/journey/lib/journeyData';
import { scoredFullTests } from '@/features/journey/lib/scoreJourney';
import { clampWeeklyGoal, extraStudyDates } from '@/features/today/lib/habits';
import { localDate } from '@/features/today/lib/todayTasks';
import { getDueMistakes } from '@/features/mistakes/lib/spacedRepetition';
import { recordGain } from '@/features/pacing/lib/bakery';
import { isTooShortRun, runSeconds } from '@/features/pacing/lib/pacingStats';

export type BadgeFamily = 'score' | 'streak' | 'effort' | 'part' | 'speed' | 'secret';
/** Bronze = first steps, silver = keeping it up for weeks, gold = a hard milestone. */
export type BadgeTier = 'b' | 's' | 'g';
export type BadgeIconKey = 'trophy' | 'rocket' | 'chart' | 'flag' | 'flame' | 'book' | 'pencil' | 'cards' | 'owl' | 'back' | 'up50' | 'sun'
  | 'star' | 'headphones' | 'eye' | 'calendar' | 'stopwatch' | 'bolt' | 'camera' | 'sparkle' | 'sunrise' | 'hourglass' | 'part';

export interface Badge {
  id: string;
  family: BadgeFamily;
  tier: BadgeTier;
  icon: BadgeIconKey;
  /** Short text on the ribbon ("3 NGÀY"); for Part badges the big text ("P5"). */
  label: string;
  title: string;
  /** How it is earned: shown in the tooltip and on the flip card. */
  how: string;
  /** One short sentence telling what to do next (quest cards). */
  hint: string;
  earned: boolean;
  /** 'YYYY-MM-DD' when known. */
  date?: string;
  /** For locked badges: what is left ("còn 7 ngày"). */
  left?: string;
  /** 0..1, how close a locked badge is; 1 once earned. */
  progress: number;
}

export const FAMILY_ORDER: BadgeFamily[] = ['score', 'streak', 'effort', 'part', 'speed', 'secret'];
export const FAMILY_LABEL: Record<BadgeFamily, string> = { score: 'Điểm số', streak: 'Chuỗi ngày', effort: 'Chăm chỉ', part: 'Gỡ Part', speed: 'Tốc độ', secret: 'Bí mật' };
export const FAMILY_COLOR: Record<BadgeFamily, string> = { score: '#ffc83d', streak: '#ff8a2a', effort: '#46b35a', part: '#1c8fe3', speed: '#14b8c9', secret: '#a78bfa' };
export const TIER_NAME: Record<BadgeTier, string> = { g: 'vàng', s: 'bạc', b: 'đồng' };
export const TIER_STARS: Record<BadgeTier, number> = { b: 1, s: 2, g: 3 };
const TIER_ORDER: Record<BadgeTier, number> = { b: 0, s: 1, g: 2 };

export const badgeStars = (badge: Pick<Badge, 'tier'>) => TIER_STARS[badge.tier];
export const totalStars = (badges: readonly Badge[]) => badges.reduce((sum, b) => b.earned ? sum + TIER_STARS[b.tier] : sum, 0);
export const ddmm = (d?: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

/** "Huy hiệu vàng · how", plus the date or what is left. */
export function badgeTip(b: Badge): string {
  if (b.family === 'secret' && !b.earned) return 'Huy hiệu bí mật · tự khám phá nhé';
  const base = `Huy hiệu ${TIER_NAME[b.tier]} · ${b.how}`;
  if (b.earned) return b.date ? `${base} Đạt ngày ${ddmm(b.date)}.` : base;
  return b.left ? `${base} (${b.left})` : base;
}

/** The locked badges closest to done (secrets stay hidden): by progress, then the easier tier first. */
export function pickQuests(badges: readonly Badge[], n = 3): Badge[] {
  return badges
    .map((b, i) => ({ b, i }))
    .filter(x => !x.b.earned && x.b.family !== 'secret')
    .sort((a, c) => c.b.progress - a.b.progress || TIER_ORDER[a.b.tier] - TIER_ORDER[c.b.tier] || a.i - c.i)
    .slice(0, n)
    .map(x => x.b);
}

const DAY = 86_400_000;
const dayNo = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const sameTest = (a: StudySession, b: StudySession) => a.testName.trim().toLowerCase() === b.testName.trim().toLowerCase();
const localHour = (iso?: string) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.getHours(); };
const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const ratio = (have: number, need: number) => clamp01(need > 0 ? have / need : 0);

type Spec = Omit<Badge, 'earned' | 'date' | 'left' | 'progress'> & { earned: boolean; date?: string; left?: string; progress?: number };
const finish = (s: Spec): Badge => ({ ...s, date: s.earned ? s.date : undefined, left: s.earned ? undefined : s.left, progress: s.earned ? 1 : Math.min(0.95, clamp01(s.progress ?? 0)) });

const CLEAN_KEY = 'rd_clean_notebook_v1';
/** "Sổ tay sạch" can only be seen on the day itself (only the latest review per card is stored), so the day is remembered on this device. */
function cleanNotebookDay(bundle: DataBundle, today: string): string | undefined {
  const live = bundle.mistakes.filter(m => !m.deletedAt);
  const anchor = bundle.mistakes[0]?.id ?? '';
  let saved: { date: string; anchor: string } | null;
  try { saved = typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(CLEAN_KEY) ?? 'null'); } catch { saved = null; }
  if (saved && saved.anchor === anchor && typeof saved.date === 'string') return saved.date;
  const reviewedToday = live.filter(m => m.lastReviewedAt && localDate(m.lastReviewedAt) === today).length;
  if (reviewedToday < 3 || getDueMistakes(live, today).length > 0) return undefined;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(CLEAN_KEY, JSON.stringify({ date: today, anchor })); } catch { /* Seen again today only. */ }
  return today;
}

const READING_MODES = new Set(['PART_5', 'PART_6', 'PART_7', 'PART_7_SINGLE', 'PART_7_MULTI', 'FULL_READING']);
const byTime = (a: PacingRun, b: PacingRun) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id);
/** A timed Reading run the learner stopped themselves before the planned time was up. */
const onTime = (run: PacingRun) => !run.finishedNaturally && (runSeconds(run) ?? Infinity) <= run.plannedMinutes * 60;

const SCORE_MARKS: Array<[number, BadgeTier]> = [[600, 'b'], [700, 's'], [800, 'g'], [900, 'g']];
const STREAKS: Array<[number, BadgeTier]> = [[3, 'b'], [7, 's'], [14, 's'], [30, 'g'], [60, 'g'], [100, 'g']];
/** Part -> most wrong answers allowed in one Full Test, tier. */
const PART_RULES: Array<[1 | 2 | 3 | 4 | 5 | 6 | 7, number, BadgeTier]> = [[1, 1, 'b'], [2, 3, 'b'], [3, 6, 's'], [4, 5, 's'], [5, 5, 's'], [6, 3, 's'], [7, 10, 'g']];
const READING_MAX = { 5: 5, 6: 3, 7: 10 } as const;

/** Every badge with its state, computed from the learner's own data only. */
export function computeBadges(bundle: DataBundle, today: string): Badge[] {
  const specs: Spec[] = [];
  const target = bundle.profile.targetScore;
  const tests = scoredFullTests(bundle.sessions);
  const best = tests.reduce((m, t) => Math.max(m, t.totalScore ?? 0), 0);
  const section = (pick: (t: StudySession) => number | undefined) => tests.reduce((m, t) => Math.max(m, pick(t) ?? 0), 0);

  // ---- Điểm số
  const first = tests[0];
  specs.push({ id: 'score-first', family: 'score', tier: 'b', icon: 'rocket', label: 'ĐỀ ĐẦU', title: 'Đề đầu tiên', how: 'Ghi điểm đề full đầu tiên.', hint: 'Ghi điểm đề full đầu tiên.', earned: !!first, date: first?.date, left: 'ghi 1 đề' });
  let runMax = -Infinity, recordDate: string | undefined, streak = 0, best3 = 0, triple: string | undefined;
  tests.forEach((t, i) => {
    const s = t.totalScore ?? 0;
    if (i > 0 && s > runMax) { recordDate = recordDate ?? t.date; streak++; if (streak >= 3 && !triple) triple = t.date; } else if (i > 0) streak = 0;
    best3 = Math.max(best3, streak);
    runMax = Math.max(runMax, s);
  });
  specs.push({ id: 'score-record', family: 'score', tier: 'b', icon: 'chart', label: 'KỶ LỤC', title: 'Kỷ lục mới', how: 'Một đề cao hơn mọi đề trước đó.', hint: 'Làm đề full cao hơn đề tốt nhất.', earned: !!recordDate, date: recordDate, left: 'vượt đề cao nhất', progress: tests.length ? ratio(tests[tests.length - 1].totalScore ?? 0, best) : 0 });
  specs.push({ id: 'score-record3', family: 'score', tier: 's', icon: 'chart', label: '3 LẦN', title: 'Kỷ lục 3 lần liền', how: '3 đề liền, đề sau cao hơn đề trước.', hint: '3 đề liền, mỗi đề hơn đề trước.', earned: !!triple, date: triple, left: `còn ${3 - Math.min(2, best3)} lần`, progress: best3 / 3 });
  const gain = first ? best - (first.totalScore ?? 0) : 0;
  const gainAt = first ? tests.find(t => (t.totalScore ?? 0) - (first.totalScore ?? 0) >= 100)?.date : undefined;
  specs.push({ id: 'score-plus100', family: 'score', tier: 's', icon: 'up50', label: '+100', title: 'Lên 100 điểm', how: 'Cao hơn đề đầu tiên 100 điểm.', hint: `Còn ${Math.max(0, 100 - gain)} điểm so với đề đầu.`, earned: !!gainAt, date: gainAt, left: `còn ${Math.max(0, 100 - gain)} điểm`, progress: ratio(gain, 100) });
  const goalAt = tests.find(t => (t.totalScore ?? 0) >= target)?.date;
  specs.push({ id: 'score-goal', family: 'score', tier: 'g', icon: 'trophy', label: String(target), title: 'Chạm mục tiêu', how: `Một đề đạt ${target} điểm.`, hint: `Còn ${Math.max(0, target - best)} điểm tới mục tiêu.`, earned: !!goalAt, date: goalAt, left: `còn ${Math.max(0, target - best)} điểm`, progress: ratio(best, target) });
  for (const [mark, tier] of SCORE_MARKS) {
    const at = tests.find(t => (t.totalScore ?? 0) >= mark)?.date;
    specs.push({ id: `score-${mark}`, family: 'score', tier, icon: 'star', label: String(mark), title: `Đạt ${mark} điểm`, how: `Một đề full đạt ${mark} điểm.`, hint: `Còn ${Math.max(0, mark - best)} điểm, làm thêm đề full.`, earned: !!at, date: at, left: best ? `còn ${Math.max(0, mark - best)} điểm` : 'ghi 1 đề', progress: ratio(best, mark) });
  }
  const bestL = section(t => t.scaledListening), bestR = section(t => t.scaledReading);
  const listenAt = tests.find(t => (t.scaledListening ?? 0) >= 400)?.date, readAt = tests.find(t => (t.scaledReading ?? 0) >= 400)?.date;
  specs.push({ id: 'score-listen400', family: 'score', tier: 'g', icon: 'headphones', label: 'NGHE 400', title: 'Nghe 400+', how: 'Điểm Nghe một đề từ 400 trở lên.', hint: `Nghe còn ${Math.max(0, 400 - bestL)} điểm. Luyện Part 1-4.`, earned: !!listenAt, date: listenAt, left: bestL ? `còn ${Math.max(0, 400 - bestL)} điểm` : 'ghi điểm Nghe', progress: ratio(bestL, 400) });
  specs.push({ id: 'score-read400', family: 'score', tier: 'g', icon: 'eye', label: 'ĐỌC 400', title: 'Đọc 400+', how: 'Điểm Đọc một đề từ 400 trở lên.', hint: `Đọc còn ${Math.max(0, 400 - bestR)} điểm. Luyện Part 5-7.`, earned: !!readAt, date: readAt, left: bestR ? `còn ${Math.max(0, 400 - bestR)} điểm` : 'ghi điểm Đọc', progress: ratio(bestR, 400) });

  // ---- Chuỗi ngày
  const extra = extraStudyDates(bundle.profile, bundle.mistakes);
  const longest = deriveStreakWithExtras(bundle, today, extra).longestStreak;
  const studied = [...doneDates(bundle, today, extra)].sort();
  const reachedOn = (n: number) => { let run = 0, prev = -2; for (const d of studied) { const k = dayNo(d); run = k === prev + 1 ? run + 1 : 1; prev = k; if (run >= n) return d; } return undefined; };
  for (const [n, tier] of STREAKS) {
    const ok = longest >= n;
    specs.push({ id: `streak-${n}`, family: 'streak', tier, icon: 'flame', label: `${n} NGÀY`, title: `Chuỗi ${n} ngày`, how: `Học ${n} ngày liền.`, hint: `Học thêm ${n - longest} ngày liền là có.`, earned: ok, date: ok ? reachedOn(n) : undefined, left: `còn ${n - longest} ngày`, progress: ratio(longest, n) });
  }
  const goalDays = clampWeeklyGoal(bundle.profile.weeklyGoalDays);
  const perWeek = new Map<number, string[]>();
  for (const d of studied) {
    const monday = dayNo(d) - (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
    perWeek.set(monday, [...(perWeek.get(monday) ?? []), d]);
  }
  let fullWeek: string | undefined, bestWeek = 0;
  for (const days of perWeek.values()) {
    bestWeek = Math.max(bestWeek, days.length);
    if (days.length >= goalDays) { const at = days[goalDays - 1]; if (!fullWeek || at < fullWeek) fullWeek = at; }
  }
  specs.push({ id: 'streak-week', family: 'streak', tier: 'b', icon: 'calendar', label: 'TUẦN ĐỦ', title: 'Tuần trọn vẹn', how: `Học đủ ${goalDays} ngày trong một tuần (mục tiêu tuần của bạn).`, hint: `Học đủ ${goalDays} ngày trong một tuần.`, earned: !!fullWeek, date: fullWeek, left: `tuần tốt nhất ${bestWeek}/${goalDays} ngày`, progress: ratio(bestWeek, goalDays) });

  // ---- Chăm chỉ
  const live = bundle.sessions.filter(s => !s.deletedAt);
  const practice = live.filter(s => s.sessionType === 'PART_PRACTICE').sort((a, b) => a.date.localeCompare(b.date));
  const liveCards = bundle.mistakes.filter(m => !m.deletedAt);
  const reviews = liveCards.reduce((sum, m) => sum + (m.reviewCount ?? 0), 0);
  const captures = liveCards.filter(m => (m.sourceImageIds?.length ?? 0) > 0).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const count = (id: string, tier: BadgeTier, n: number, have: number, icon: BadgeIconKey, label: string, title: string, how: string, hint: string, date?: string) =>
    specs.push({ id, family: 'effort', tier, icon, label, title, how, hint: hint.replace('{n}', String(Math.max(0, n - have))), earned: have >= n, date, left: `còn ${n - have}`, progress: ratio(have, n) });
  count('effort-tests5', 'b', 5, tests.length, 'book', '5 ĐỀ', '5 đề full', 'Ghi 5 đề full.', 'Ghi thêm {n} đề full.', tests[4]?.date);
  count('effort-tests20', 's', 20, tests.length, 'book', '20 ĐỀ', '20 đề full', 'Ghi 20 đề full.', 'Ghi thêm {n} đề full.', tests[19]?.date);
  count('effort-tests50', 'g', 50, tests.length, 'book', '50 ĐỀ', '50 đề full', 'Ghi 50 đề full.', 'Ghi thêm {n} đề full.', tests[49]?.date);
  count('effort-practice10', 'b', 10, practice.length, 'pencil', '10 BÀI', '10 bài luyện', 'Ghi 10 bài luyện Part.', 'Ghi thêm {n} bài luyện Part.', practice[9]?.date);
  count('effort-practice50', 's', 50, practice.length, 'pencil', '50 BÀI', '50 bài luyện', 'Ghi 50 bài luyện Part.', 'Ghi thêm {n} bài luyện Part.', practice[49]?.date);
  count('effort-review50', 'b', 50, reviews, 'cards', '50 CÂU', 'Ôn 50 câu', 'Ôn lại 50 lượt câu sai.', 'Ôn thêm {n} câu trong Sổ tay.');
  count('effort-review200', 's', 200, reviews, 'cards', '200 CÂU', 'Ôn 200 câu', 'Ôn lại 200 lượt câu sai.', 'Ôn thêm {n} câu trong Sổ tay.');
  count('effort-review500', 'g', 500, reviews, 'cards', '500 CÂU', 'Ôn 500 câu', 'Ôn lại 500 lượt câu sai.', 'Ôn thêm {n} câu trong Sổ tay.');
  count('effort-capture10', 'b', 10, captures.length, 'camera', '10 ẢNH', 'Chụp 10 câu', 'Tạo 10 thẻ Sổ tay từ ảnh chụp màn hình.', 'Chụp thêm {n} câu vào Sổ tay.', localDate(captures[9]?.createdAt ?? '') ?? undefined);

  // ---- Gỡ Part: some full test with few mistakes in that Part
  const withParts = tests.map(t => ({ t, w: wrongCountsByPart(t) })).filter(x => x.w);
  const latestW = withParts[withParts.length - 1]?.w;
  for (const [part, max, tier] of PART_RULES) {
    const hit = withParts.find(x => x.w![part] <= max);
    const latest = latestW?.[part];
    specs.push({ id: `part-${part}`, family: 'part', tier, icon: 'part', label: `P${part}`, title: `Gỡ Part ${part}`, how: `Một đề sai Part ${part} không quá ${max} câu.`, hint: `Ôn câu Part ${part} trong Sổ tay, sai ≤ ${max}.`,
      earned: !!hit, date: hit?.t.date, left: latest !== undefined ? `đang sai ${latest}, cần ≤ ${max}` : `sai ≤ ${max} câu`, progress: latest === undefined ? 0 : latest <= 0 ? 1 : max / latest });
  }
  const readHit = withParts.find(x => ([5, 6, 7] as const).every(p => x.w![p] <= READING_MAX[p]));
  const readRatio = latestW ? ([5, 6, 7] as const).reduce((sum, p) => sum + (latestW[p] <= 0 ? 1 : Math.min(1, READING_MAX[p] / latestW[p])), 0) / 3 : 0;
  specs.push({ id: 'part-read', family: 'part', tier: 'g', icon: 'part', label: 'P5-7', title: 'Gỡ trọn phần Đọc', how: 'Một đề sai Part 5 ≤ 5, Part 6 ≤ 3 và Part 7 ≤ 10 câu.', hint: 'Một đề: Part 5 ≤ 5, Part 6 ≤ 3, Part 7 ≤ 10.',
    earned: !!readHit, date: readHit?.t.date, left: latestW ? `đề gần nhất đạt ${Math.round(readRatio * 100)}%` : 'cần đề ghi theo câu sai', progress: readRatio });

  // ---- Tốc độ (Luyện tập: bấm giờ từng Part)
  const runs = bundle.pacingRuns.filter(r => !r.deletedAt && r.partType && READING_MODES.has(r.partType) && runSeconds(r) !== null && !isTooShortRun(r)).sort(byTime);
  const onTimeRuns = runs.filter(onTime);
  let inRow = 0, bestRow = 0, rowAt: string | undefined;
  for (const r of runs) { inRow = onTime(r) ? inRow + 1 : 0; bestRow = Math.max(bestRow, inRow); if (inRow >= 5 && !rowAt) rowAt = r.date; }
  const p7 = runs.filter(r => r.partType === 'PART_7' && !r.finishedNaturally);
  let p7Best: number | null = null, p7Record: string | undefined;
  for (const r of p7) { const s = runSeconds(r)!; if (!p7Record && recordGain(p7Best, s, false) !== null) p7Record = r.date; p7Best = p7Best === null ? s : Math.min(p7Best, s); }
  const readAll = runs.filter(r => r.partType === 'FULL_READING' && !r.finishedNaturally);
  const fastRead = readAll.find(r => (runSeconds(r) ?? Infinity) < 75 * 60);
  const fastestRead = readAll.reduce((m, r) => Math.min(m, runSeconds(r) ?? Infinity), Infinity);
  const overPlan = runs.reduce((m, r) => Math.max(m, clamp01((r.plannedMinutes * 60) / (runSeconds(r) ?? Infinity))), 0);
  specs.push({ id: 'speed-ontime', family: 'speed', tier: 'b', icon: 'stopwatch', label: 'ĐÚNG GIỜ', title: 'Ra lò đúng giờ', how: 'Bấm giờ một Part Đọc và xong trước giờ dự kiến.', hint: 'Bấm giờ một Part và nộp trước giờ.', earned: onTimeRuns.length > 0, date: onTimeRuns[0]?.date, left: runs.length ? 'xong trước giờ dự kiến' : 'bấm giờ một Part', progress: overPlan });
  specs.push({ id: 'speed-ontime5', family: 'speed', tier: 's', icon: 'bolt', label: '5 LIỀN', title: '5 lần đúng giờ liền', how: '5 lượt bấm giờ liên tiếp, lượt nào cũng xong trước giờ.', hint: 'Chạy 5 lượt liền, lượt nào cũng đúng giờ.', earned: !!rowAt, date: rowAt, left: `còn ${5 - Math.min(4, bestRow)} lượt`, progress: bestRow / 5 });
  specs.push({ id: 'speed-p7record', family: 'speed', tier: 's', icon: 'flag', label: 'KỶ LỤC', title: 'Kỷ lục Part 7', how: 'Bấm giờ Part 7 nhanh hơn kỷ lục trước đó của bạn.', hint: 'Bấm giờ Part 7 nhanh hơn lần tốt nhất.', earned: !!p7Record, date: p7Record, left: p7.length ? 'nhanh hơn lần tốt nhất' : 'bấm giờ Part 7 hai lần', progress: Math.min(0.6, p7.length * 0.3) });
  specs.push({ id: 'speed-read75', family: 'speed', tier: 'g', icon: 'hourglass', label: '< 75′', title: 'Cả phần Đọc dưới 75 phút', how: 'Bấm giờ cả phần Đọc (Part 5-7) và xong trong dưới 75 phút.', hint: 'Bấm giờ cả phần Đọc, xong dưới 75 phút.', earned: !!fastRead, date: fastRead?.date, left: Number.isFinite(fastestRead) ? `tốt nhất ${Math.round(fastestRead / 60)} phút` : 'bấm giờ cả phần Đọc', progress: Number.isFinite(fastestRead) ? (75 * 60) / fastestRead : 0 });

  // ---- Bí mật (hidden until found)
  const owl = live.find(s => { const h = localHour(s.createdAt); return h !== null && (h >= 23 || h < 4); });
  specs.push({ id: 'secret-owl', family: 'secret', tier: 's', icon: 'owl', label: 'CÚ ĐÊM', title: 'Cú đêm', how: 'Ghi bài sau 11 giờ đêm.', hint: '', earned: !!owl, date: owl?.date });
  const earlyAt = [
    ...live.filter(s => { const h = localHour(s.createdAt); return h !== null && h >= 4 && h < 6; }).map(s => s.date),
    ...bundle.pacingRuns.filter(r => { const h = !r.deletedAt ? localHour(r.createdAt) : null; return h !== null && h >= 4 && h < 6; }).map(r => r.date),
    ...liveCards.filter(m => { const h = localHour(m.lastReviewedAt); return h !== null && h >= 4 && h < 6; }).map(m => localDate(m.lastReviewedAt!) ?? '')
  ].filter(Boolean).sort()[0];
  specs.push({ id: 'secret-early', family: 'secret', tier: 's', icon: 'sunrise', label: 'DẬY SỚM', title: 'Dậy sớm', how: 'Ghi hoặc ôn bài trước 6 giờ sáng.', hint: '', earned: !!earlyAt, date: earlyAt });
  let comeback: string | undefined;
  for (let i = 1; i < studied.length; i++) if (dayNo(studied[i]) - dayNo(studied[i - 1]) >= 8) { comeback = studied[i]; break; }
  specs.push({ id: 'secret-comeback', family: 'secret', tier: 'b', icon: 'back', label: 'TRỞ LẠI', title: 'Trở lại', how: 'Quay lại học sau một tuần nghỉ.', hint: '', earned: !!comeback, date: comeback });
  const retake = tests.find((t, i) => tests.slice(0, i).some(e => sameTest(e, t) && (t.totalScore ?? 0) - (e.totalScore ?? 0) >= 50));
  specs.push({ id: 'secret-retake', family: 'secret', tier: 'g', icon: 'up50', label: '+50', title: 'Làm lại bứt phá', how: 'Làm lại một đề, hơn lần trước 50 điểm.', hint: '', earned: !!retake, date: retake?.date });
  const weekend = studied.find(d => new Date(`${d}T00:00:00Z`).getUTCDay() === 6 && studied.includes(new Date((dayNo(d) + 1) * DAY).toISOString().slice(0, 10)));
  specs.push({ id: 'secret-weekend', family: 'secret', tier: 'b', icon: 'sun', label: 'CUỐI TUẦN', title: 'Cuối tuần chăm', how: 'Học cả thứ Bảy lẫn Chủ nhật.', hint: '', earned: !!weekend, date: weekend });
  const clean = cleanNotebookDay(bundle, today);
  specs.push({ id: 'secret-clean', family: 'secret', tier: 's', icon: 'sparkle', label: 'SẠCH', title: 'Sổ tay sạch', how: 'Ôn hết mọi thẻ đến hạn trong một ngày (ít nhất 3 thẻ).', hint: '', earned: !!clean, date: clean });
  return specs.map(finish);
}

