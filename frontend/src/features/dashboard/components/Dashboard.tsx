import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Target,
  PlusCircle,
  TrendingUp,
  Crown,
  TrendingDown,
  Activity
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Customized
} from 'recharts';
import { StudySession, UserProfile, PacingRun, ReadingPartType, MistakeEntry } from '@/shared/types';
import type { VocabLog } from '@/shared/data/dataBundle';
import { live, readDataBundle } from '@/shared/data/dataBundle';
import { actualStudyDates } from '@/shared/domain/streak';
import { getTodayDateString, computeSessionAttemptMap } from '@/shared/data/storage';
import { useChartMotion } from '@/shared/hooks/useChartMotion';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { OverviewChartLabels } from './OverviewChartLabels';
import { PhoneSummary } from './PhoneOverview';
import { ScoreReportCard } from './ScoreReportCard';
import { SkillDetailModal } from './SkillDetailModal';
import { StreakCard } from './StreakCard';
import './dashboard-motion.css';

interface DashboardProps {
  profile: UserProfile;
  sessions: StudySession[];
  vocabLog: VocabLog[];
  pacingRuns: PacingRun[];
  theme: 'light' | 'dark';
  onOpenSessionLogger: (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB'; partNumber?: number; initialFiles?: File[] }) => void;
  onNavigateToAnalytics: () => void;
  dueMistakesCount?: number;
  onStartReview?: () => void;
  onNavigateToPacing?: (part: ReadingPartType) => void;
  mistakes?: MistakeEntry[];
  /** Where the streak card's "Học ngay" button leads. */
  onNavigateToPlan?: () => void;
}

/** Neo surfaces on Tổng quan: every card has the black border; only the key numbers and the latest score are raised. */
const NEO_FLAT = 'rounded-2xl border-2 border-slate-900 bg-white dark:border-slate-200 dark:bg-[#111A2C]';
const NEO_RAISED = `${NEO_FLAT} shadow-[3px_3px_0_0_#0f172a] dark:shadow-[3px_3px_0_0_#cbd5e1]`;
const KPI_CARD = `${NEO_RAISED} p-3 sm:p-3.5 xl:p-4 2xl:p-5 flex flex-col justify-center gap-2.5 sm:gap-3 group`;

// Bề mặt thẻ dùng chung với các màn hình khác (xem surfaces.ts)

// Trên điện thoại chỉ thẻ điểm giữ viền đậm; biểu đồ dùng viền mảnh để không tranh chú ý.


const PHONE_CHART_POINTS = 4;

const formatShortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export const Dashboard: React.FC<DashboardProps> = ({
  profile,
  sessions,
  vocabLog,
  pacingRuns,
  theme,
  onOpenSessionLogger,
  onNavigateToAnalytics,
  dueMistakesCount = 0,
  onStartReview,
  onNavigateToPacing,
  onNavigateToPlan
}) => {
  const today = getTodayDateString();
  // Shield days change only when the profile's streak is recomputed, so its streak fields are the cache key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shieldDates = useMemo(() => new Set(live(readDataBundle().shieldDays).filter(day => day.date <= today).map(day => day.date)), [profile.currentStreak, profile.streakFreezes, today]);
  const isDark = theme === 'dark';
  const chartMotion = useChartMotion(700);
  // Phones render PhoneSummary instead of the KPI and latest-test cards (streak lives in the top-bar chip); only one version is ever in the DOM.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [chartFilter, setChartFilter] = useState<'ALL' | 'FIRST'>('ALL');
  const [desktopSkillModal, setDesktopSkillModal] = useState<'listening' | 'reading' | null>(null);


  const studiedDates = useMemo(() => actualStudyDates({ sessions, vocabLog, pacingRuns }, today), [sessions, vocabLog, pacingRuns, today]);

  const fullTests = useMemo(
    () => sessions.filter(s => !s.deletedAt && s.skillType === 'LR' && s.sessionType === 'FULL_TEST' && Number.isFinite(s.totalScore) && (s.totalScore || 0) > 0 && (s.totalScore || 0) <= 990),
    [sessions]
  );

  const highestScore = useMemo(() => {
    if (fullTests.length === 0) return 0;
    return Math.max(...fullTests.map(s => s.totalScore || 0));
  }, [fullTests]);

  const bestTest = useMemo(() => {
    if (fullTests.length === 0) return null;
    return [...fullTests].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))[0];
  }, [fullTests]);

  /**
   * Mục tiêu điểm lấy từ hồ sơ, KHÔNG neo cứng vào 990 (SPEC mục 2.1).
   * Trước đây Dashboard tính theo 990 trong khi Phân Tích tính theo
   * targetScore, nên người đặt mục tiêu 700 và đạt 700 thấy Dashboard
   * báo "Thiếu 290đ - 71%" còn Phân Tích báo đã đạt 100%.
   */
  const targetScore = Math.max(10, Math.min(990, profile.targetScore || 990));
  const pointsRemaining = Math.max(0, targetScore - highestScore);

  const attemptMap = useMemo(() => computeSessionAttemptMap(sessions), [sessions]);

  // Dữ liệu biểu đồ, sắp theo ngày tăng dần để đường đi lên từ trái sang phải
  const allChartData = useMemo(() => {
    const seenOnDay = new Map<string, number>();
    return [...fullTests]
      .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))
      .map(session => {
        const attemptNumber = attemptMap[session.id]?.attemptNumber || session.attemptNumber || 1;
        // Nhiều đề cùng một ngày: đề thứ hai trở đi ghi "(2)", "(3)" để nhãn trục không lặp.
        const nth = (seenOnDay.get(session.date) || 0) + 1;
        seenOnDay.set(session.date, nth);
        return {
          id: session.id,
          date: nth > 1 ? `${formatShortDate(session.date)} (${nth})` : formatShortDate(session.date),
          name: session.testName,
          total: session.totalScore || 0,
          listening: session.scaledListening,
          reading: session.scaledReading,
          attemptNumber,
          isRetest: attemptNumber > 1
        };
      });
  }, [fullTests, attemptMap]);

  // "Lần đầu" loại các lượt làm lại - điểm làm lại đề cũ bị thổi phồng vì nhớ đáp án
  const chartData = useMemo(
    () => {
      // Điện thoại không có nút lọc; lần làm lại được đánh dấu thẳng trên biểu đồ.
      const filtered = chartFilter === 'FIRST' && !isPhone ? allChartData.filter(d => !d.isRetest) : allChartData;
      // Điện thoại chỉ đủ chỗ cho 4 điểm có nhãn; xem toàn bộ ở trang Phân tích.
      return isPhone ? filtered.slice(-PHONE_CHART_POINTS) : filtered;
    },
    [allChartData, chartFilter, isPhone]
  );

  const stats = useMemo(() => {
    if (allChartData.length === 0) return null;
    const first = allChartData[0];
    const latest = allChartData[allChartData.length - 1];
    const totalScoreSum = allChartData.reduce((acc, curr) => acc + curr.total, 0);
    const avgScore = Math.round(totalScoreSum / allChartData.length);
    const minScore = Math.min(...allChartData.map(d => d.total));
    const maxScore = Math.max(...allChartData.map(d => d.total));
    return {
      first,
      latest,
      diff: latest.total - first.total,
      totalTests: allChartData.length,
      avgScore,
      minScore,
      maxScore
    };
  }, [allChartData]);

  // Trục Y bám theo dải điểm thực tế, trần là mục tiêu của người dùng
  const yAxisConfig = useMemo(() => {
    if (chartData.length === 0) {
      const floor = Math.max(0, Math.min(400, targetScore - 400));
      const ticks: number[] = [];
      for (let t = floor; t < targetScore; t += 100) ticks.push(t);
      ticks.push(targetScore);
      return { domain: [floor, targetScore] as [number, number], ticks };
    }
    const minScore = Math.min(...chartData.map(d => d.total));
    const maxScore = Math.max(...chartData.map(d => d.total));

    const ceiling = Math.min(990, Math.max(targetScore, Math.ceil((maxScore + 25) / 50) * 50));
    const range = ceiling - minScore;

    // Dải điểm rộng (>= 180đ): Bước nhảy 100đ tròn trịa (700, 800, 900, 990)
    // Dải điểm hẹp (< 180đ): Bước nhảy 50đ mượt mà
    let floor: number;
    let step: number;

    if (range >= 180) {
      floor = Math.max(0, Math.floor((minScore - 30) / 100) * 100);
      step = 100;
    } else {
      floor = Math.max(0, Math.floor((minScore - 25) / 50) * 50);
      step = 50;
    }

    const ticks: number[] = [];
    for (let s = floor; s < ceiling; s += step) {
      // Tránh tick quá gần trần (ví dụ 950 ngay sát 990 chỉ cách 40đ)
      if (ceiling - s < (step === 100 ? 50 : 35)) continue;
      ticks.push(s);
    }
    // Chỉ đặt mốc ở trần khi nó rơi đúng bước, để các vạch cách đều; mục tiêu đã có đường xanh lá riêng.
    if (!ticks.includes(ceiling) && (ceiling - floor) % step === 0) ticks.push(ceiling);

    return { domain: [floor, ceiling] as [number, number], ticks };
  }, [chartData, targetScore]);

  // Kỹ năng HIỆN TẠI lấy từ bài Full Test gần nhất, không phải bài cao nhất
  const latestTest = stats ? fullTests.find(s => s.id === stats.latest.id) || bestTest : bestTest;
  const listeningScore = latestTest?.scaledListening;
  const readingScore = latestTest?.scaledReading;


  const diff = stats?.diff ?? 0;

  /**
   * 3 THẺ CHỈ SỐ THÀNH TÍCH:
   * - Thẻ 1: Cấp bậc năng lực ETS & Kỷ Lục
   * - Thẻ 2: Điểm trung bình & dải phong độ
   * - Thẻ 3: Xung lực phong độ so với bài đầu
   */
  const toeicTier = useMemo(() => {
    const score = highestScore || 0;
    if (score >= 905) return { tier: 'Gold Tier', rank: 'Cột mốc 905+', badgeBg: 'bg-amber-300 text-slate-950 border-slate-900', iconBg: 'bg-amber-400 text-slate-950' };
    if (score >= 785) return { tier: 'Silver Tier', rank: 'Cột mốc 785+', badgeBg: 'bg-sky-200 text-slate-950 border-slate-900', iconBg: 'bg-sky-300 text-slate-950' };
    if (score >= 605) return { tier: 'Bronze Tier', rank: 'Cột mốc 605+', badgeBg: 'bg-orange-200 text-slate-950 border-slate-900', iconBg: 'bg-orange-300 text-slate-950' };
    if (score >= 405) return { tier: 'Starter', rank: 'Cột mốc 405+', badgeBg: 'bg-emerald-200 text-slate-950 border-slate-900', iconBg: 'bg-emerald-300 text-slate-950' };
    return { tier: 'Explorer', rank: 'Đang khởi đầu', badgeBg: 'bg-slate-200 text-slate-800 border-slate-900', iconBg: 'bg-slate-200 text-slate-800' };
  }, [highestScore]);

  const hasDiff = Boolean(stats && stats.totalTests > 1);
  const latestTotal = latestTest ? (latestTest.totalScore || (listeningScore ?? 0) + (readingScore ?? 0)) : 0;
  const previousTotal = allChartData.length > 1 ? allChartData[allChartData.length - 2].total : undefined;

  const weakestPart = useMemo(() => {
    if (!latestTest?.partScores) return 7;
    const parts: Array<{ part: 5 | 6 | 7; max: number; key: 'part5' | 'part6' | 'part7' }> = [
      { part: 5, max: 30, key: 'part5' },
      { part: 6, max: 16, key: 'part6' },
      { part: 7, max: 54, key: 'part7' },
    ];
    let minAcc = 2;
    let weakest: 5 | 6 | 7 = 7;
    for (const p of parts) {
      const val = latestTest.partScores[p.key];
      if (val !== undefined) {
        const acc = val / p.max;
        if (acc < minAcc) {
          minAcc = acc;
          weakest = p.part;
        }
      }
    }
    return weakest;
  }, [latestTest]);

  // Desktop next step: the Reading Part that lost the most questions in the latest test (by count, so the sentence
  // "Mất nhiều điểm nhất" is literally true). undefined when no Reading Part score was recorded. Phones keep weakestPart.
  const mostLost = useMemo(() => {
    let best: { part: 5 | 6 | 7; wrong: number } | undefined;
    for (const [part, max] of [[5, 30], [6, 16], [7, 54]] as const) {
      const correct = latestTest?.partScores?.[`part${part}`];
      if (correct === undefined) continue;
      const wrong = Math.max(0, max - correct);
      if (!best || wrong > best.wrong) best = { part, wrong };
    }
    return best;
  }, [latestTest]);

  // What the latest-result card suggests next, from the learner's own data only (no AI call):
  // 1) mistakes due for review, 2) the weakest Part with a recorded score, 3) a prompt to record Part scores.
  const nextStep = dueMistakesCount > 0 && onStartReview
    ? { kind: 'review' as const, count: dueMistakesCount }
    : mostLost && mostLost.wrong > 0 && onNavigateToPacing
      ? { kind: 'part' as const, part: mostLost.part, wrong: mostLost.wrong }
      : !mostLost
        ? { kind: 'record' as const }
        : null;

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length > 0) {
        event.preventDefault();
        onOpenSessionLogger({ sessionType: 'FULL_TEST', initialFiles: files });
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onOpenSessionLogger]);

  return (
    <div
      className="overview-dashboard w-full space-y-3 sm:space-y-4 animate-fade-in"
      onDragOver={event => {
        if (event.dataTransfer?.types?.includes('Files')) {
          event.preventDefault();
        }
      }}
      onDrop={event => {
        const files = [...(event.dataTransfer?.files ?? [])].filter(file => file.type.startsWith('image/'));
        if (files.length > 0) {
          event.preventDefault();
          onOpenSessionLogger({ sessionType: 'FULL_TEST', initialFiles: files });
        }
      }}
    >
      <div data-overview-grid className="grid grid-cols-1 xl:grid-cols-12 xl:grid-rows-[auto_auto] gap-4 sm:gap-5 xl:gap-6 items-stretch">

        {/* ================= CỘT TRÁI (3 KPI & Biểu đồ tiến độ) ================= */}
        <div className="flex flex-col gap-4 sm:gap-5 min-w-0 xl:contents">

          {isPhone && (
            <PhoneSummary
              latestTest={latestTest}
              latestTotal={latestTotal}
              previousTotal={previousTotal}
              listeningScore={listeningScore}
              readingScore={readingScore}
              targetScore={targetScore}
              highestScore={highestScore}
              avgScore={stats?.avgScore}
              totalTests={stats?.totalTests ?? 0}
              diff={diff}
              hasDiff={hasDiff}
              firstTotal={stats?.first.total}
              bestTestDate={bestTest?.date}
              latestIsBest={Boolean(bestTest) && bestTest?.id === latestTest?.id}
              dueMistakesCount={dueMistakesCount}
              weakestPart={weakestPart}
              motto={profile.motto}
              onOpenSessionLogger={() => onOpenSessionLogger()}
              onStartReview={onStartReview}
              onNavigateToPacing={onNavigateToPacing}
              onViewDetails={onNavigateToAnalytics}
            />
          )}

          {/* 1. DẢI 3 THẺ CHỈ SỐ — từ tablet trở lên; điện thoại dùng PhoneSummary ở trên */}
          {!isPhone && <div className="grid grid-cols-3 gap-3 sm:gap-3.5 xl:gap-4 xl:col-span-8 xl:row-start-1">
            
            {/* THẺ 1: HUY HIỆU CẤP BẬC & KỶ LỤC CÁ NHÂN */}
            <div className={KPI_CARD}>
              {/* Top Bar: Nhãn Kỷ Lục Gọn bên trái, % Đích bên phải */}
              <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
                <span
                  className="flex items-center gap-1.5 whitespace-nowrap text-[10.5px] sm:text-[11px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 cursor-default"
                  title={`${toeicTier.tier} (${toeicTier.rank})`}
                >
                  KỶ LỤC
                </span>
              </div>

              {/* Middle: Điểm to rõ bên trái, Khối Icon dập nổi bên phải */}
              <div className="flex items-center justify-between gap-2 py-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl xl:text-4xl font-black tabular-nums leading-none tracking-tight text-amber-600 dark:text-amber-400">
                    {highestScore || 0}
                  </span>
                  {targetScore > 0 && (
                    <span className="whitespace-nowrap text-[11px] sm:text-xs font-bold text-slate-400 dark:text-slate-500">
                      / {targetScore}đ
                    </span>
                  )}
                </div>

                <div className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl border-2 border-slate-900 flex items-center justify-center shrink-0 bg-amber-400 text-slate-950 shadow-2xs transition-transform duration-200 ">
                  <Crown className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.5] transition-transform duration-200 " />
                </div>
              </div>

              {/* Footer: Tên đề kỷ lục trọn vẹn, thoáng đãng */}
              <div className="text-[11px]">
                <span className="truncate block text-slate-900 dark:text-slate-100 font-bold" title={bestTest?.testName || 'Chưa có bài thi'}>
                  {bestTest?.testName || 'Chưa có bài thi'}
                  {bestTest && (highestScore || 0) > 0 && (
                    <span className="font-semibold text-slate-500 dark:text-slate-400">
                      {pointsRemaining > 0 ? ` · thiếu ${pointsRemaining}đ` : pointsRemaining === 0 ? ' · đạt mục tiêu' : ''}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* THẺ 2: ĐIỂM TRUNG BÌNH (TRÁNH LẶP LẠI VỚI BÀI GẦN NHẤT) */}
            <div className={KPI_CARD}>
              {/* Top Bar: Trung bình Badge bên trái, Tổng số đề bên phải */}
              <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[10.5px] sm:text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  TRUNG BÌNH
                </span>
              </div>

              {/* Middle: Điểm trung bình bên trái, Khối Icon dập nổi bên phải */}
              <div className="flex items-center justify-between gap-2 py-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl xl:text-4xl font-black tabular-nums leading-none tracking-tight text-blue-600 dark:text-blue-400">
                    {stats?.avgScore || 0}
                  </span>
                  {targetScore > 0 && (
                    <span className="whitespace-nowrap text-[11px] sm:text-xs font-bold text-slate-400 dark:text-slate-500">
                      / {targetScore}đ
                    </span>
                  )}
                </div>

                <div className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl bg-sky-200 text-blue-950 border-2 border-slate-900 flex items-center justify-center shrink-0 shadow-2xs transition-transform duration-200 ">
                  <Target className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.5] transition-transform duration-200 " />
                </div>
              </div>

              {/* Footer: Dải phong độ Min -> Max */}
              <div className="text-[11px]">
                <span className="truncate block text-slate-700 dark:text-slate-300 font-bold" title={stats ? `${stats.totalTests} đề · dải phong độ ${stats.minScore}đ → ${stats.maxScore}đ` : 'Chưa có bài thi'}>
                  {stats ? `${stats.totalTests} đề · ${stats.minScore}đ → ${stats.maxScore}đ` : 'Chưa có bài thi'}
                </span>
              </div>
            </div>

            {/* THẺ 3: XUNG LỰC PHONG ĐỘ & SO VỚI BÀI ĐẦU (CHUYỂN MÀU ĐỘNG THEO DIFF) */}
            <div className={KPI_CARD}>
              {/* Top Bar: Nhãn đổi màu theo số dương (xanh lá) / số âm (hồng) bên trái, Trạng thái bên phải */}
              <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
                <span className={`flex items-center gap-1.5 whitespace-nowrap text-[10.5px] sm:text-[11px] font-black uppercase tracking-wider ${
                  !hasDiff
                    ? 'text-slate-500 dark:text-slate-400'
                    : diff > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : diff < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-sky-600 dark:text-sky-400'
                }`}>
                  SO VỚI BÀI ĐẦU
                </span>
              </div>

              {/* Middle: Con số thay đổi bên trái, Khối Icon dập nổi bên phải */}
              <div className="flex items-center justify-between gap-2 py-0.5">
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl sm:text-3xl xl:text-4xl font-black tabular-nums leading-none tracking-tight ${
                    !hasDiff
                      ? 'text-slate-400 dark:text-slate-500'
                      : diff >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {hasDiff ? `${diff > 0 ? '+' : ''}${diff}` : '—'}
                  </span>
                  {hasDiff && (
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      điểm
                    </span>
                  )}
                </div>

                <div className={`w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl border-2 border-slate-900 flex items-center justify-center shrink-0 shadow-2xs transition-transform duration-200  ${
                  !hasDiff
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    : diff > 0
                    ? 'bg-emerald-300 text-slate-950'
                    : diff < 0
                    ? 'bg-rose-200 text-rose-800'
                    : 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300'
                }`}>
                  {!hasDiff ? (
                    <Activity className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.5] transition-transform duration-200 group-hover:scale-110" />
                  ) : diff > 0 ? (
                    <TrendingUp className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.5] transition-transform duration-200 group-hover:translate-x-0.5 group-" />
                  ) : diff < 0 ? (
                    <TrendingDown className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.5] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
                  ) : (
                    <Activity className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.5] transition-transform duration-200 group-hover:scale-110" />
                  )}
                </div>
              </div>

              {/* Footer: Điểm đầu ➔ cuối trọn vẹn */}
              <div className="text-[11px]">
                <span className="truncate block text-slate-900 dark:text-slate-100 font-bold">
                  {hasDiff && stats
                    ? `Từ bài đầu: ${stats.first.total}đ ➔ ${stats.latest.total}đ`
                    : stats?.totalTests === 1
                    ? 'Mới thi 1 đề'
                    : 'Cần từ 2 đề'}
                </span>
              </div>
            </div>

          </div>}

          {/* 3. BIỂU ĐỒ TIẾN BỘ */}
          {/* Điện thoại: khi chưa có đề, thẻ PhoneSummary đã mời ghi điểm nên ẩn biểu đồ trống */}
          {!isPhone && (
          <div className={`${NEO_FLAT} flex-1 flex flex-col gap-2.5 sm:gap-3 p-3 sm:p-3.5 min-w-0 xl:col-span-8 xl:row-start-2`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-[15px] md:text-sm font-black text-slate-900 dark:text-white">
                Tiến bộ qua từng bài thi
              </h2>
              <div className="flex items-center gap-1.5">
                {!isPhone && <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" role="tablist">
                  {([['ALL', 'Tất cả'], ['FIRST', 'Lần đầu']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={chartFilter === key}
                      onClick={() => setChartFilter(key)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-black transition-all cursor-pointer ${
                        chartFilter === key
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>}
              </div>
            </div>

            {/* Điện thoại: biểu đồ lấp phần màn hình còn lại thay vì để trống phía dưới */}
            <div className="relative w-full h-[max(220px,calc(100dvh-520px))] md:h-[180px] xl:h-auto xl:flex-1 xl:min-h-[clamp(240px,calc(100dvh-400px),460px)]">
              <div className="absolute inset-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 28, right: 104, left: -4, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDark ? '#334155' : '#E2E8F0'}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: isDark ? '#CBD5E1' : '#475569', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                      tickMargin={8}
                      axisLine={{ stroke: isDark ? '#475569' : '#CBD5E1' }}
                      tickLine={false}
                      padding={{ left: 24, right: 24 }}
                    />
                    <YAxis
                      domain={yAxisConfig.domain}
                      ticks={yAxisConfig.ticks}
                      interval={0}
                      width={44}
                      tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="p-3 rounded-xl bg-white dark:bg-[#111A2C] border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] text-sm space-y-1.5 z-30">
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-black flex items-center justify-between gap-3">
                              <span>Ngày {label}</span>
                              {d.isRetest ? (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300/80 text-[10px] font-black">
                                  Lần {d.attemptNumber}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-300/80 text-[10px] font-black">
                                  Lần đầu
                                </span>
                              )}
                            </div>
                            <div className="font-black text-slate-900 dark:text-white text-xs truncate max-w-[200px]">
                              {d.name || 'Đề thi ETS'}
                            </div>
                            <div className="pt-1 border-t border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-4">
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Tổng điểm:</span>
                              <span className="font-black text-blue-600 dark:text-blue-400 text-base tabular-nums">
                                {d.total}đ
                              </span>
                            </div>
                            {(d.listening !== undefined || d.reading !== undefined) && (
                              <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
                                <span className="text-indigo-600 dark:text-indigo-400">L: {d.listening === undefined ? 'Chưa ghi' : `${d.listening}đ`}</span>
                                <span className="text-teal-600 dark:text-teal-400">R: {d.reading === undefined ? 'Chưa ghi' : `${d.reading}đ`}</span>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      y={targetScore}
                      stroke={isDark ? '#34D399' : '#059669'}
                      strokeWidth={2}
                      strokeDasharray="7 5"
                      label={{
                        value: `Mục tiêu ${targetScore}`,
                        position: 'right',
                        fontSize: 13,
                        fontWeight: 800,
                        fill: isDark ? '#6EE7B7' : '#047857',
                        fontFamily: 'Plus Jakarta Sans, sans-serif'
                      }}
                    />
                    {/* Ink outline under the blue line, the same trick the Neo cards use for their borders */}
                    <Area
                      type="linear"
                      dataKey="total"
                      stroke={isDark ? '#E2E8F0' : '#0F172A'}
                      strokeWidth={8}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      fill="none"
                      isAnimationActive={chartMotion.enabled}
                      animationBegin={0}
                      animationDuration={chartMotion.duration}
                      animationEasing="ease-out"
                      dot={false}
                      activeDot={false}
                    />
                    <Area
                      className="overview-score-area"
                      type="linear"
                      dataKey="total"
                      stroke="#60A5FA"
                      strokeWidth={4}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      fill="none"
                      isAnimationActive={chartMotion.enabled}
                      animationBegin={0}
                      animationDuration={chartMotion.duration}
                      animationEasing="ease-out"
                      onAnimationEnd={chartMotion.finish}
                      dot={false}
                      activeDot={{ r: 9, fill: '#F59E0B', stroke: isDark ? '#E2E8F0' : '#0F172A', strokeWidth: 3 }}
                    />
                    <Customized component={<OverviewChartLabels isDark={isDark} ceiling={yAxisConfig.domain[1]} markRetests={false} />} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-4">
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {allChartData.length > 0 ? 'Chưa có đề nào làm lần đầu' : 'Chưa có kết quả Full Test nào'}
                  </p>
                  {allChartData.length === 0 && (
                    <button
                      onClick={() => onOpenSessionLogger()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl btn-linear-primary text-sm cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Nhập điểm đề đầu tiên
                    </button>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
          )}

        </div>

        {/* ================= CỘT PHẢI (Khoảng cách cân đối, kích thước vừa vặn không bị tràn màn hình) ================= */}
        <div className="flex flex-col gap-4 sm:gap-5 min-w-0 xl:contents">


          {/* 5. CHUỖI NGÀY HỌC — mỗi ngày một vòng tròn; lời nhắc chỉ khi chưa có chuỗi hoặc sắp mất chuỗi */}
          {!isPhone && <StreakCard streak={profile.currentStreak} longestStreak={profile.longestStreak || 0}
            studiedDates={studiedDates} shieldDates={shieldDates} today={today} onStart={onNavigateToPlan}
            className="xl:col-span-4 xl:row-start-1" />}

          {/* 6. PHIẾU KẾT QUẢ GẦN NHẤT — cùng thẻ với điện thoại; kỷ lục, trung bình và tiến bộ đã nằm ở 3 thẻ trên */}
          {!isPhone && latestTest && <ScoreReportCard roomy className="xl:col-span-4 xl:row-start-2" latestTest={latestTest} latestTotal={latestTotal} previousTotal={previousTotal}
            listeningScore={listeningScore} readingScore={readingScore} targetScore={targetScore}
            newRecord={Boolean(bestTest) && bestTest?.id === latestTest.id && (stats?.totalTests ?? 0) > 1}
            onOpenListening={() => setDesktopSkillModal('listening')}
            onOpenReading={() => setDesktopSkillModal('reading')}>
            <div className="mx-5 mt-1 border-t border-slate-200/80 pb-4 pt-3.5 dark:border-slate-800">
              {nextStep?.kind === 'review' && (
                <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300">
                  Sổ tay có <b className="font-black text-slate-950 dark:text-white">{nextStep.count} câu</b> đến hạn ôn
                </p>
              )}
              {nextStep?.kind === 'part' && (
                <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300">
                  Mất nhiều điểm nhất: <b className="font-black text-slate-950 dark:text-white">Part {nextStep.part}</b> (sai {nextStep.wrong} câu)
                </p>
              )}
              {nextStep?.kind === 'record' && (
                <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300">
                  Ghi điểm từng Part để biết nên luyện gì tiếp.
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-3">
                {nextStep?.kind === 'review' && (
                  <button type="button" onClick={onStartReview}
                    className="flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-blue-600 py-2.5 text-sm font-black text-white shadow-[2px_2px_0_0_#0f172a] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-300 dark:shadow-[2px_2px_0_0_#cbd5e1]">
                    Ôn {nextStep.count} câu ngay
                  </button>
                )}
                {nextStep?.kind === 'part' && onNavigateToPacing && (
                  <button type="button" onClick={() => onNavigateToPacing(`PART_${nextStep.part}` as ReadingPartType)}
                    className="flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-blue-600 py-2.5 text-sm font-black text-white shadow-[2px_2px_0_0_#0f172a] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-300 dark:shadow-[2px_2px_0_0_#cbd5e1]">
                    Luyện Part {nextStep.part}
                  </button>
                )}
                <button type="button" onClick={onNavigateToAnalytics}
                  className={`group flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-slate-900 bg-white px-3.5 py-2 text-[13px] font-black text-indigo-700 transition active:translate-x-px active:translate-y-px dark:border-slate-300 dark:bg-slate-900 dark:text-indigo-300 ${nextStep?.kind === 'review' || nextStep?.kind === 'part' ? 'shrink-0' : 'flex-1'}`}>
                  <span>Xem 7 Part</span>
                  <ArrowRight className="h-3.5 w-3.5 stroke-[2.5] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </button>
              </div>
            </div>
          </ScoreReportCard>}

          {!isPhone && desktopSkillModal && latestTest && (
            <SkillDetailModal
              session={latestTest}
              initialSkill={desktopSkillModal}
              onClose={() => setDesktopSkillModal(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
};


