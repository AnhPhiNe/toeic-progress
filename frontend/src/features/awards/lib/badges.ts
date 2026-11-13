import type { DataBundle } from '@/shared/data/dataBundle';
import type { StudySession } from '@/shared/types';
import { deriveStreakWithExtras, doneDates } from '@/shared/domain/streakWeek';
import { wrongCountsByPart } from '@/features/journey/lib/journeyData';
import { scoredFullTests } from '@/features/journey/lib/scoreJourney';
import { extraStudyDates } from '@/features/today/lib/habits';

export type BadgeFamily = 'score' | 'streak' | 'effort' | 'part' | 'secret';
export type BadgeTier = 'b' | 's' | 'g';
export type BadgeShape = 'round' | 'cup' | 'flame' | 'star' | 'hex' | 'gem';

export interface Badge {
  id: string;
  family: BadgeFamily;
  shape: BadgeShape;
  tier: BadgeTier;
  /** Big text inside the badge ("7", "P5", "↑"). */
  mark: string;
  /** Small text under the mark ("ngày", "đề"). */
  unit?: string;
  title: string;
  /** How it is earned, shown on the flip card and for secrets once found. */
  how: string;
  earned: boolean;
  /** 'YYYY-MM-DD' when known. */
  date?: string;
  /** For locked badges: what is left ("còn 7 ngày"). */
  left?: string;
}

export const FAMILY_LABEL: Record<BadgeFamily, string> = { score: 'Điểm số', streak: 'Chuỗi ngày', effort: 'Chăm chỉ', part: 'Gỡ Part', secret: 'Bí mật' };
export const FAMILY_COLOR: Record<BadgeFamily, string> = { score: '#ffc83d', streak: '#ff8a2a', effort: '#46b35a', part: '#1c8fe3', secret: '#a78bfa' };

const DAY = 86_400_000;
const dayNo = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const sameTest = (a: StudySession, b: StudySession) => a.testName.trim().toLowerCase() === b.testName.trim().toLowerCase();
const localHour = (iso?: string) => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.getHours(); };

/** Every badge with its state, computed from the learner's own data only. */
export function computeBadges(bundle: DataBundle, today: string): Badge[] {
  const out: Badge[] = [];
  const target = bundle.profile.targetScore;
  const tests = scoredFullTests(bundle.sessions);
  const scores = tests.map(t => t.totalScore ?? 0);
  const best = scores.length ? Math.max(...scores) : 0;

  // ---- Điểm số
  const first = tests[0];
  out.push({ id: 'score-first', family: 'score', shape: 'round', tier: 'g', mark: '1', unit: 'đề', title: 'Đề đầu tiên', how: 'Ghi điểm đề full đầu tiên.', earned: !!first, date: first?.date, left: first ? undefined : 'ghi 1 đề' });
  let runMax = -Infinity, recordDate: string | undefined, streak = 0, best3 = 0, triple: string | undefined;
  tests.forEach((t, i) => {
    const s = t.totalScore ?? 0;
    if (i > 0 && s > runMax) { recordDate = recordDate ?? t.date; streak++; if (streak >= 3 && !triple) triple = t.date; } else if (i > 0) streak = 0;
    best3 = Math.max(best3, streak);
    runMax = Math.max(runMax, s);
  });
  out.push({ id: 'score-record', family: 'score', shape: 'round', tier: 'g', mark: '↑', title: 'Kỷ lục mới', how: 'Một đề cao hơn mọi đề trước đó.', earned: !!recordDate, date: recordDate, left: recordDate ? undefined : 'vượt đề cao nhất' });
  out.push({ id: 'score-record3', family: 'score', shape: 'round', tier: 's', mark: '3', unit: 'lần', title: 'Kỷ lục 3 lần liền', how: '3 đề liền, đề sau cao hơn đề trước.', earned: !!triple, date: triple, left: triple ? undefined : `còn ${3 - Math.min(2, best3)} lần` });
  const gain = first ? best - (first.totalScore ?? 0) : 0;
  const gainAt = first ? tests.find(t => (t.totalScore ?? 0) - (first.totalScore ?? 0) >= 100)?.date : undefined;
  out.push({ id: 'score-plus100', family: 'score', shape: 'round', tier: 's', mark: '+100', title: 'Lên 100 điểm', how: 'Cao hơn đề đầu tiên 100 điểm.', earned: !!gainAt, date: gainAt, left: gainAt ? undefined : `còn ${Math.max(0, 100 - gain)} điểm` });
  const goalAt = tests.find(t => (t.totalScore ?? 0) >= target)?.date;
  out.push({ id: 'score-goal', family: 'score', shape: 'cup', tier: 'g', mark: String(target), title: 'Chạm mục tiêu', how: `Một đề đạt ${target} điểm.`, earned: !!goalAt, date: goalAt, left: goalAt ? undefined : `còn ${Math.max(0, target - best)} điểm` });

  // ---- Chuỗi ngày
  const extra = extraStudyDates(bundle.profile, bundle.mistakes);
  const longest = deriveStreakWithExtras(bundle, today, extra).longestStreak;
  const studied = [...doneDates(bundle, today, extra)].sort();
  const reachedOn = (n: number) => { let run = 0, prev = -2; for (const d of studied) { const k = dayNo(d); run = k === prev + 1 ? run + 1 : 1; prev = k; if (run >= n) return d; } return undefined; };
  ([[3, 'b'], [7, 's'], [14, 'g'], [30, 'g']] as const).forEach(([n, tier]) => {
    const ok = longest >= n;
    out.push({ id: `streak-${n}`, family: 'streak', shape: 'flame', tier, mark: String(n), unit: 'ngày', title: `Chuỗi ${n} ngày`, how: `Học ${n} ngày liền.`, earned: ok, date: ok ? reachedOn(n) : undefined, left: ok ? undefined : `còn ${n - longest} ngày` });
  });

  // ---- Chăm chỉ
  const live = bundle.sessions.filter(s => !s.deletedAt);
  const practice = live.filter(s => s.sessionType === 'PART_PRACTICE').sort((a, b) => a.date.localeCompare(b.date));
  const reviews = bundle.mistakes.filter(m => !m.deletedAt).reduce((sum, m) => sum + (m.reviewCount ?? 0), 0);
  const count = (id: string, tier: BadgeTier, n: number, have: number, mark: string, unit: string, title: string, how: string, date?: string) =>
    out.push({ id, family: 'effort', shape: 'star', tier, mark, unit, title, how, earned: have >= n, date: have >= n ? date : undefined, left: have >= n ? undefined : `còn ${n - have}` });
  count('effort-tests5', 'b', 5, tests.length, '5', 'đề', '5 đề full', 'Ghi 5 đề full.', tests[4]?.date);
  count('effort-tests20', 's', 20, tests.length, '20', 'đề', '20 đề full', 'Ghi 20 đề full.', tests[19]?.date);
  count('effort-practice10', 'b', 10, practice.length, '10', 'bài', '10 bài luyện', 'Ghi 10 bài luyện Part.', practice[9]?.date);
  count('effort-review50', 'b', 50, reviews, '50', 'câu', 'Ôn 50 câu', 'Ôn lại 50 lượt câu sai.');
  count('effort-review200', 's', 200, reviews, '200', 'câu', 'Ôn 200 câu', 'Ôn lại 200 lượt câu sai.');

  // ---- Gỡ Part: some full test with few mistakes in that Part
  ([[3, 6], [5, 5], [6, 3], [7, 10]] as const).forEach(([part, max]) => {
    const withParts = tests.map(t => ({ t, w: wrongCountsByPart(t) })).filter(x => x.w);
    const hit = withParts.find(x => x.w![part] <= max);
    const latest = withParts[withParts.length - 1]?.w?.[part];
    out.push({ id: `part-${part}`, family: 'part', shape: 'hex', tier: part === 7 ? 'g' : 's', mark: `P${part}`, title: `Gỡ Part ${part}`, how: `Một đề sai Part ${part} không quá ${max} câu.`,
      earned: !!hit, date: hit?.t.date, left: hit ? undefined : latest !== undefined ? `đang sai ${latest}, cần ≤ ${max}` : `sai ≤ ${max} câu` });
  });

  // ---- Bí mật (hidden until found)
  const owl = live.find(s => { const h = localHour(s.createdAt); return h !== null && (h >= 23 || h < 4); });
  out.push({ id: 'secret-owl', family: 'secret', shape: 'gem', tier: 'g', mark: '🦉', title: 'Cú đêm', how: 'Ghi bài sau 11 giờ đêm.', earned: !!owl, date: owl?.date });
  let comeback: string | undefined;
  for (let i = 1; i < studied.length; i++) if (dayNo(studied[i]) - dayNo(studied[i - 1]) >= 8) { comeback = studied[i]; break; }
  out.push({ id: 'secret-comeback', family: 'secret', shape: 'gem', tier: 'g', mark: '↺', title: 'Trở lại', how: 'Quay lại học sau một tuần nghỉ.', earned: !!comeback, date: comeback });
  const retake = tests.find((t, i) => tests.slice(0, i).some(e => sameTest(e, t) && (t.totalScore ?? 0) - (e.totalScore ?? 0) >= 50));
  out.push({ id: 'secret-retake', family: 'secret', shape: 'gem', tier: 'g', mark: '+50', title: 'Làm lại bứt phá', how: 'Làm lại một đề, hơn lần trước 50 điểm.', earned: !!retake, date: retake?.date });
  const weekend = studied.find(d => new Date(`${d}T00:00:00Z`).getUTCDay() === 6 && studied.includes(new Date((dayNo(d) + 1) * DAY).toISOString().slice(0, 10)));
  out.push({ id: 'secret-weekend', family: 'secret', shape: 'gem', tier: 'g', mark: '☀', title: 'Cuối tuần chăm', how: 'Học cả thứ Bảy lẫn Chủ nhật.', earned: !!weekend, date: weekend });
  return out;
}

export interface WeekRecap { start: string; end: string; delta: number | null; best: number | null; record: boolean; days: number; tests: number }

/** The last `n` finished weeks (Mon–Sun) that had any study, newest first. */
export function weekRecaps(bundle: DataBundle, today: string, n = 3): WeekRecap[] {
  const tests = scoredFullTests(bundle.sessions);
  const studied = doneDates(bundle, today, extraStudyDates(bundle.profile, bundle.mistakes));
  const t = dayNo(today), weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const iso = (k: number) => new Date(k * DAY).toISOString().slice(0, 10);
  const out: WeekRecap[] = [];
  for (let w = 1; w <= 26 && out.length < n; w++) {
    const s = t - weekday - 7 * w, e = s + 6;
    const days = [...studied].filter(d => dayNo(d) >= s && dayNo(d) <= e).length;
    if (!days) continue;
    const inWeek = tests.filter(x => dayNo(x.date) >= s && dayNo(x.date) <= e).map(x => x.totalScore ?? 0);
    const before = tests.filter(x => dayNo(x.date) < s).map(x => x.totalScore ?? 0);
    const best = inWeek.length ? Math.max(...inWeek) : null;
    const prevBest = before.length ? Math.max(...before) : null;
    out.push({ start: iso(s), end: iso(e), best, days, tests: inWeek.length,
      delta: best !== null && prevBest !== null ? best - prevBest : null, record: best !== null && (prevBest === null || best > prevBest) });
  }
  return out;
}
