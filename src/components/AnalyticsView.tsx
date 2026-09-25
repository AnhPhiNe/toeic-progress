import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  Award,
  Zap,
  BarChart3,
  Headphones,
  BookOpen,
  Filter,
  AlertTriangle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  BarChart,
  Bar
} from 'recharts';
import { StudySession, MistakeEntry, LRPartScore, UserProfile, ErrorCategory, ERROR_CATEGORY_LABELS, ChartAttemptFilter } from '../types';
import { PART_MAX_QUESTIONS } from '../utils/etsScoring';
import { loadUserProfile, computeSessionAttemptMap, getRetestStats, loadPacingRuns, getTodayDateString } from '../utils/storage';
import { causePriority, heatmapDays, phaseOverruns, rollingPartStats } from '../utils/learningAnalytics';
import type { VocabLog } from '../utils/dataBundle';
import { CARD, SKILL_COLORS } from './surfaces';

// Tên tiếng Việt ngắn gọn, dễ đọc, không rườm rà
const PART_SHORT_NAMES: Record<keyof LRPartScore, string> = {
  part1: 'Part 1: Mô tả tranh',
  part2: 'Part 2: Hỏi & Đáp',
  part3: 'Part 3: Hội thoại',
  part4: 'Part 4: Bài nói ngắn',
  part5: 'Part 5: Điền câu',
  part6: 'Part 6: Điền đoạn văn',
  part7: 'Part 7: Đọc hiểu văn bản'
};

interface AnalyticsViewProps {
  profile?: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  vocabLog: VocabLog[];
  theme: 'light' | 'dark';
  onDeleteSession?: (sessionId: string) => void;
  onEditSession?: (session: StudySession) => void;
  onOpenSessionLogger?: (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB' }) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  profile,
  sessions,
  mistakes,
  vocabLog,
  theme,
  onOpenSessionLogger: _onOpenSessionLogger
}) => {
  const [chartViewMode, setChartViewMode] = useState<'TOTAL' | 'LR'>('TOTAL');
  const [chartAttemptFilter, setChartAttemptFilter] = useState<ChartAttemptFilter>('ALL');

  // Bản đồ metadata lần làm bài
  const attemptMap = useMemo(() => computeSessionAttemptMap(sessions), [sessions]);
  const retestStats = useMemo(() => getRetestStats(sessions), [sessions]);

  // Các bài Full Test có điểm
  const fullTests = useMemo(() => {
    return sessions.filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0);
  }, [sessions]);
  const rolling = useMemo(() => rollingPartStats(sessions), [sessions]);
  const priority = useMemo(() => causePriority(sessions, mistakes), [sessions, mistakes]);
  const heatmap = useMemo(() => heatmapDays(sessions, vocabLog, getTodayDateString()), [sessions, vocabLog]);
  const vocabTotal12Weeks = vocabLog.filter(item => !item.deletedAt && item.date >= heatmap[0].date && item.date <= heatmap[83].date).reduce((sum, item) => sum + item.count, 0);
  const pacing = useMemo(() => phaseOverruns(loadPacingRuns()), []);

  // SẮP XẾP THỜI GIAN CHUẨN XÁC TĂNG DẦN (Cũ nhất -> Mới nhất, Trái qua Phải) cho Biểu đồ
  const chronologicalFullTests = useMemo(() => {
    return [...fullTests].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [fullTests]);

  // Bản đồ tính độ lệch điểm số (diff) so với bài thi ngay trước đó cho tooltip biểu đồ
  const sessionDiffMap = useMemo(() => {
    const diffs: Record<string, number | null> = {};
    for (let i = 0; i < chronologicalFullTests.length; i++) {
      const current = chronologicalFullTests[i];
      if (i === 0) {
        diffs[current.id] = null; // Mốc ban đầu (Baseline)
      } else {
        const prev = chronologicalFullTests[i - 1];
        diffs[current.id] = (current.totalScore || 0) - (prev.totalScore || 0);
      }
    }
    return diffs;
  }, [chronologicalFullTests]);

  // Thống kê tổng quan & KPI
  const stats = useMemo(() => {
    const totalTimeHours = Math.round(sessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0) / 60);
    const highest = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.totalScore || 0)) : 0;
    const avg = fullTests.length > 0 ? Math.round(fullTests.reduce((acc, s) => acc + (s.totalScore || 0), 0) / fullTests.length) : 0;
    const highestListening = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.scaledListening || 0)) : 0;
    const highestReading = fullTests.length > 0 ? Math.max(...fullTests.map(s => s.scaledReading || 0)) : 0;

    // Tính điểm bứt phá (Từ bài đầu đến bài gần nhất)
    const firstScore = chronologicalFullTests.length > 0 ? (chronologicalFullTests[0].totalScore || 0) : 0;
    const latestScore = chronologicalFullTests.length > 0 ? (chronologicalFullTests[chronologicalFullTests.length - 1].totalScore || 0) : 0;
    const breakthrough = latestScore - firstScore;

    // Tính điểm dự báo ETS dựa trên trung bình trọng số 3 bài gần nhất (ETS Projected Score)
    let projectedScore = latestScore;
    if (chronologicalFullTests.length >= 3) {
      const last3 = chronologicalFullTests.slice(-3);
      // Trọng số: 50% đề mới nhất, 30% đề giữa, 20% đề cũ
      const weighted = (last3[2].totalScore || 0) * 0.5 + (last3[1].totalScore || 0) * 0.3 + (last3[0].totalScore || 0) * 0.2;
      projectedScore = Math.round(weighted / 5) * 5; // Quy đổi bội số 5 của ETS
    } else if (chronologicalFullTests.length === 2) {
      const weighted = (chronologicalFullTests[1].totalScore || 0) * 0.6 + (chronologicalFullTests[0].totalScore || 0) * 0.4;
      projectedScore = Math.round(weighted / 5) * 5;
    }

    return {
      totalTests: fullTests.length,
      totalHours: totalTimeHours,
      highest,
      avg,
      highestListening,
      highestReading,
      firstScore,
      latestScore,
      breakthrough,
      projectedScore,
      stability: rolling.stability || 0
    };
  }, [sessions, fullTests, chronologicalFullTests, rolling.stability]);

  // Danh sách hiển thị trên biểu đồ dựa theo chế độ lọc lần thi (Tất cả / Chỉ lần 1 / Điểm cao nhất)
  const displayedFullTests = useMemo(() => {
    if (chartAttemptFilter === 'FIRST_ONLY') {
      return chronologicalFullTests.filter(s => (attemptMap[s.id]?.attemptNumber || 1) === 1);
    }
    if (chartAttemptFilter === 'BEST_ONLY') {
      const bestByTest: Record<string, StudySession> = {};
      chronologicalFullTests.forEach(s => {
        const key = s.testName.trim().toLowerCase();
        if (!bestByTest[key] || (s.totalScore || 0) > (bestByTest[key].totalScore || 0)) {
          bestByTest[key] = s;
        }
      });
      return Object.values(bestByTest).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return chronologicalFullTests;
  }, [chronologicalFullTests, chartAttemptFilter, attemptMap]);

  // Format Dữ liệu cho Biểu đồ đường diện tích (AreaChart) - Thứ tự chuẩn thời gian
  const chartData = useMemo(() => {
    return displayedFullTests.map((session, idx) => {
      const dateParts = session.date.split('-');
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : session.date;
      const meta = attemptMap[session.id];
      const attemptNumber = meta?.attemptNumber || session.attemptNumber || 1;
      const isRetest = attemptNumber > 1;

      return {
        id: session.id,
        rawDate: session.date,
        date: formattedDate,
        name: session.testName,
        listening: session.scaledListening || 0,
        reading: session.scaledReading || 0,
        total: session.totalScore || 0,
        testIndex: `Test ${idx + 1}`,
        attemptNumber,
        isRetest,
        scoreDiffFromFirst: meta?.scoreDiffFromFirst,
        scoreDiffFromPrevious: meta?.scoreDiffFromPrevious
      };
    });
  }, [displayedFullTests, attemptMap]);

  // Phân tích trung bình từng Part 1-7
  const partStats = useMemo(() => rolling.tests.length
    ? { averages: rolling.averages, accuracy: rolling.accuracy, validTestsCount: rolling.tests.length }
    : null, [rolling]);

  // Xác định Part yếu nhất (Điểm nghẽn)
  const { weakestPart } = useMemo(() => {
    if (!partStats) return { weakestPart: null };
    let minAcc = 101;
    let worstKey = 'part7' as keyof LRPartScore;

    (Object.keys(partStats.accuracy) as Array<keyof LRPartScore>).forEach(key => {
      const acc = partStats.accuracy[key];
      if (acc < minAcc) {
        minAcc = acc;
        worstKey = key;
      }
    });

    return {
      weakestPart: {
        key: worstKey,
        name: PART_SHORT_NAMES[worstKey],
        accuracy: minAcc,
        avgCorrect: Math.round(partStats.averages[worstKey]),
        max: PART_MAX_QUESTIONS[worstKey]
      }
    };
  }, [partStats]);


  // Mục tiêu điểm của người học - dùng chung cho KPI, trục biểu đồ và đường mốc
  const goalScore = useMemo(
    () => Math.max(10, Math.min(990, (profile || loadUserProfile()).targetScore || 990)),
    [profile]
  );

  /**
   * Chẩn đoán theo NGUYÊN NHÂN sai, không theo Part (SPEC mục 1.4 điểm 1).
   * Các web luyện đề chỉ nói được "Part 3: 35/39". Chỉ sản phẩm này biết
   * VÌ SAO mất điểm, vì chính người học đã phân loại từng lỗi trong Sổ tay.
   */
  const errorDiagnosis = useMemo(() => {
    if (mistakes.length === 0) return null;

    const grouped = new Map<ErrorCategory, { count: number; parts: Set<number> }>();
    for (const m of mistakes) {
      const category = m.category || 'OTHER';
      let entry = grouped.get(category);
      if (!entry) {
        entry = { count: 0, parts: new Set<number>() };
        grouped.set(category, entry);
      }
      entry.count += 1;
      entry.parts.add(m.part);
    }

    const total = mistakes.length;
    const rows = Array.from(grouped.entries())
      .map(([category, value]) => ({
        category,
        label: (ERROR_CATEGORY_LABELS[category] || ERROR_CATEGORY_LABELS.OTHER).label,
        count: value.count,
        percent: Math.round((value.count / total) * 100),
        parts: Array.from(value.parts).sort((a, b) => a - b)
      }))
      // Nhiều lỗi nhất lên đầu; đồng hạng thì xếp theo tên cho ổn định giữa các lần render
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));

    const pendingCount = mistakes.filter(m => m.status === 'NEEDS_REVIEW').length;

    return {
      total,
      rows,
      top: rows[0],
      maxCount: rows[0].count,
      pendingCount
    };
  }, [mistakes]);

  // Phân tích khoảng cách mục tiêu & dư địa điểm số ETS (Target Gap Analysis)
  const targetGap = useMemo(() => {
    const userProfile = profile || loadUserProfile();
    const targetScore = userProfile.targetScore || 900;

    let currentLC = chronologicalFullTests.length > 0 ? (chronologicalFullTests[chronologicalFullTests.length - 1].scaledListening || 0) : 0;
    let currentRC = chronologicalFullTests.length > 0 ? (chronologicalFullTests[chronologicalFullTests.length - 1].scaledReading || 0) : 0;

    if (chronologicalFullTests.length >= 3) {
      const last3 = chronologicalFullTests.slice(-3);
      const weightedLC = (last3[2].scaledListening || 0) * 0.5 + (last3[1].scaledListening || 0) * 0.3 + (last3[0].scaledListening || 0) * 0.2;
      const weightedRC = (last3[2].scaledReading || 0) * 0.5 + (last3[1].scaledReading || 0) * 0.3 + (last3[0].scaledReading || 0) * 0.2;
      currentLC = Math.round(weightedLC / 5) * 5;
      currentRC = Math.round(weightedRC / 5) * 5;
    } else if (chronologicalFullTests.length === 2) {
      const weightedLC = (chronologicalFullTests[1].scaledListening || 0) * 0.6 + (chronologicalFullTests[0].scaledListening || 0) * 0.4;
      const weightedRC = (chronologicalFullTests[1].scaledReading || 0) * 0.6 + (chronologicalFullTests[0].scaledReading || 0) * 0.4;
      currentLC = Math.round(weightedLC / 5) * 5;
      currentRC = Math.round(weightedRC / 5) * 5;
    }

    const currentScore = stats.projectedScore > 0 ? stats.projectedScore : (currentLC + currentRC);
    
    // Tỷ lệ phân bổ mục tiêu chuẩn ETS (LC thường nhỉnh hơn RC khoảng 20-30đ)
    let targetLC = Math.min(495, Math.round((targetScore * 0.52) / 5) * 5);
    let targetRC = targetScore - targetLC;
    if (targetRC > 495) {
      targetRC = 495;
      targetLC = targetScore - 495;
    }

    const totalGap = Math.max(0, targetScore - currentScore);
    const lcGap = Math.max(0, targetLC - currentLC);
    const rcGap = Math.max(0, targetRC - currentRC);
    const progressPercent = targetScore > 0 ? Math.min(100, Math.round((currentScore / targetScore) * 100)) : 0;

    const lcQuestionsNeeded = Math.ceil(lcGap / 5);
    const rcQuestionsNeeded = Math.ceil(rcGap / 5);

    return {
      targetScore,
      currentScore,
      targetLC,
      targetRC,
      currentLC,
      currentRC,
      totalGap,
      lcGap,
      rcGap,
      progressPercent,
      lcQuestionsNeeded,
      rcQuestionsNeeded
    };
  }, [profile, chronologicalFullTests, stats.projectedScore]);





  // Cấu hình trục Y Bán Linh Động Thông Minh (Smart Hybrid):
  // - Đỉnh là MỤC TIÊU của người học, không phải 990 cố định (SPEC mục 2.1).
  //   Kéo trục tới 990 cho người nhắm 700 sẽ ép đường tiến bộ phẳng lì.
  // - Đáy linh động lùi 50-100đ theo điểm thấp nhất, chia vạch chuẩn mốc TOEIC
  const chartYAxisConfig = useMemo(() => {
    const goal = goalScore;

    if (chartData.length === 0) {
      const emptyFloor = Math.max(100, goal - 500);
      const emptyTicks: number[] = [];
      for (let t = emptyFloor; t < goal; t += 200) emptyTicks.push(t);
      emptyTicks.push(goal);
      return {
        totalDomain: [emptyFloor, goal] as [number, number],
        totalTicks: emptyTicks,
        subDomain: [200, 495] as [number, number],
        subTicks: [200, 300, 400, 495]
      };
    }

    // 1. Cấu hình trục Total - trần là mục tiêu, nới ra nếu đã vượt mục tiêu
    const minTotal = Math.min(...chartData.map(d => d.total));
    const maxTotal = Math.max(...chartData.map(d => d.total));
    const ceilingTotal = Math.min(990, Math.max(goal, Math.ceil((maxTotal + 20) / 50) * 50));
    const rangeTotal = ceilingTotal - minTotal;
    
    let floorTotal: number;
    const totalTicks: number[] = [];

    if (rangeTotal <= 250) {
      // Dải điểm hẹp (người học ở band cao, ví dụ 750 - 950): Bước nhảy 50đ đều đặn
      floorTotal = Math.max(200, Math.floor((minTotal - 40) / 50) * 50);
      for (let s = floorTotal; s < ceilingTotal; s += 50) {
        if (ceilingTotal - s < 40) continue;
        totalTicks.push(s);
      }
      totalTicks.push(ceilingTotal);
    } else {
      // Dải điểm rộng: Bước nhảy 100đ tròn trịa theo các mốc chuẩn TOEIC (500, 600, 700, 800, 900, 990)
      floorTotal = Math.max(100, Math.floor((minTotal - 40) / 100) * 100);
      for (let s = floorTotal; s < ceilingTotal; s += 100) {
        if (ceilingTotal - s < 45) continue;
        totalTicks.push(s);
      }
      totalTicks.push(ceilingTotal);
    }

    // 2. Cấu hình trục Subscore (Listening & Reading 5-495)
    const minSub = Math.min(...chartData.map(d => Math.min(d.listening, d.reading)));
    const rangeSub = 495 - minSub;

    let floorSub: number;
    const subTicks: number[] = [];

    if (rangeSub <= 150) {
      // Dải điểm thành phần hẹp: Bước nhảy 25đ mượt mà
      floorSub = Math.max(50, Math.floor((minSub - 25) / 25) * 25);
      for (let s = floorSub; s <= 475; s += 25) {
        subTicks.push(s);
      }
      subTicks.push(495);
    } else {
      // Dải điểm thành phần rộng: Bước nhảy 50đ (200, 250, 300, 350, 400, 450, 495)
      floorSub = Math.max(50, Math.floor((minSub - 30) / 50) * 50);
      for (let s = floorSub; s <= 450; s += 50) {
        subTicks.push(s);
      }
      subTicks.push(495);
    }

    return {
      totalDomain: [floorTotal, ceilingTotal] as [number, number],
      totalTicks,
      subDomain: [floorSub, 495] as [number, number],
      subTicks
    };
  }, [chartData, goalScore]);

  const isDark = theme === 'dark';

  /**
   * Dải bốn chỉ số KPI cao cấp - tách thành 4 thẻ độc lập chuẩn SaaS Analytics:
   * xanh dương, xanh lá (hoặc đỏ khi giảm), hổ phách, hồng.
   */
  const isUp = stats.breakthrough >= 0;
  const hasTests = stats.totalTests > 0;
  const stabilityLabel = rolling.tests.length <= 1
    ? 'Cần từ 2 đề'
    : stats.stability <= 25 ? 'Rất ổn định' : stats.stability <= 45 ? 'Phong độ tốt' : 'Dao động mạnh';

  const avgNum = typeof stats.avg === 'number' ? stats.avg : 0;
  const goalNum = goalScore || 990;
  const avgPercent = goalNum > 0 ? Math.min(100, Math.round((avgNum / goalNum) * 100)) : 0;

  const kpis: {
    label: string;
    value: string | number;
    suffix?: string;
    accentBar: string;
    badge: string;
    number: string;
    icon: React.ElementType;
    cornerBadge: string;
    cornerBadgeStyle: string;
    pill: string;
    note: string;
    subText: string;
    hint?: string;
  }[] = [
    {
      label: 'Điểm trung bình',
      value: hasTests ? stats.avg : '—',
      suffix: `/ ${goalScore}`,
      accentBar: 'bg-blue-500',
      badge: 'bg-[#BAE6FD] text-slate-950',
      number: 'text-blue-600 dark:text-blue-400',
      icon: BarChart3,
      cornerBadge: hasTests ? `${avgPercent}% Mục tiêu` : 'Chưa có đề',
      cornerBadgeStyle: 'bg-[#BAE6FD] text-slate-950',
      pill: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
      note: retestStats.retestCount > 0 ? `Đề mới: ${retestStats.firstAttemptAvg}` : `${stats.totalTests} đề Full Test`,
      subText: retestStats.retestCount > 0 ? `${stats.totalTests} đề tổng cộng` : 'Điểm quy đổi TB',
      hint: retestStats.retestCount > 0
        ? `Số lớn tính mọi lượt, kể cả ${retestStats.retestCount} lượt làm lại. "Đề mới" chỉ tính lần làm đầu mỗi đề - con số sát thực lực hơn, vì làm lại thì nhớ đáp án (trung bình +${retestStats.avgRetestGain}đ).`
        : undefined
    },
    {
      label: 'Bứt phá',
      value: stats.totalTests > 1 ? `${stats.breakthrough > 0 ? '+' : ''}${stats.breakthrough}` : '—',
      suffix: stats.totalTests > 1 ? 'đ' : undefined,
      accentBar: isUp ? 'bg-emerald-500' : 'bg-rose-500',
      badge: isUp ? 'bg-[#BBF7D0] text-slate-950' : 'bg-[#FECDD3] text-slate-950',
      number: isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
      icon: isUp ? TrendingUp : TrendingDown,
      cornerBadge: stats.totalTests > 1 ? (isUp ? 'Tăng trưởng' : 'Cần phục hồi') : 'Cần từ 2 đề',
      cornerBadgeStyle: isUp ? 'bg-[#BBF7D0] text-slate-950' : 'bg-[#FECDD3] text-slate-950',
      pill: isUp
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
      note: stats.totalTests > 1 ? `${stats.firstScore} → ${stats.latestScore}` : 'Cần từ 2 đề',
      subText: stats.totalTests > 1 ? 'Đề 1 ➔ Mới nhất' : 'Chưa đủ lượt',
      hint: 'Chênh lệch tổng điểm giữa bài Full Test đầu tiên và bài gần nhất.'
    },
    {
      label: 'Kỷ lục cá nhân',
      value: hasTests ? stats.highest : '—',
      suffix: hasTests ? 'đ' : undefined,
      accentBar: 'bg-amber-500',
      badge: 'bg-amber-100 text-amber-950',
      number: 'text-amber-600 dark:text-amber-400',
      icon: Award,
      cornerBadge: hasTests ? (stats.highest >= 900 ? 'Top 1% ⭐' : stats.highest >= 800 ? 'Top Tier' : 'Best') : '—',
      cornerBadgeStyle: 'bg-amber-100 text-amber-950',
      pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
      note: `L ${stats.highestListening} · R ${stats.highestReading}`,
      subText: hasTests && typeof stats.highest === 'number' && goalNum > stats.highest
        ? `Cách mục tiêu: -${goalNum - stats.highest}đ`
        : (hasTests ? 'Đạt mục tiêu ⭐' : 'Chưa có đề'),
      hint: 'Điểm số cao nhất từng đạt được trong toàn bộ các bài Full Test.'
    },
    {
      label: 'Độ ổn định',
      value: rolling.tests.length > 1 ? `±${stats.stability}` : '—',
      suffix: rolling.tests.length > 1 ? 'đ' : undefined,
      accentBar: 'bg-pink-500',
      badge: 'bg-[#FECDD3] text-slate-950',
      number: 'text-pink-600 dark:text-pink-400',
      icon: Zap,
      cornerBadge: rolling.tests.length > 1 ? `${rolling.tests.length} Đề gần nhất` : 'Độ lệch chuẩn',
      cornerBadgeStyle: 'bg-[#FECDD3] text-slate-950',
      pill: 'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300',
      note: `${stabilityLabel}`,
      subText: rolling.tests.length > 1
        ? (stats.stability <= 25 ? 'Phong độ rất vững' : stats.stability <= 45 ? 'Phong độ tốt' : 'Cần giữ nhịp')
        : 'Chưa đủ đề',
      hint: 'Độ lệch chuẩn tổng điểm của tối đa 5 Full Test gần nhất, loại lượt làm lại.'
    }
  ];

  return (
    <div className="space-y-4 animate-fade-in text-slate-800 dark:text-slate-200">
      
      {/* 1. DẢI CHỈ SỐ - 4 Thẻ Card độc lập chuẩn SaaS Analytics cao cấp */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map(k => (
          <div
            key={k.label}
            className={`${CARD} relative overflow-hidden group flex flex-col justify-between`}
          >
            {/* Vạch màu nhận diện ở đỉnh thẻ */}
            <div className={`absolute top-0 left-0 right-0 h-1.5 ${k.accentBar}`} />

            <div>
              {/* Header: Icon + Tên nhãn + Corner Badge */}
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] ${k.badge}`}>
                    <k.icon className="w-4 h-4 stroke-[2.5]" />
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                    {k.label}
                  </span>
                </div>
                <span className={`text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-full border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] shrink-0 ${k.cornerBadgeStyle}`}>
                  {k.cornerBadge}
                </span>
              </div>

              {/* Con số chính nổi bật */}
              <div className="mt-3 flex items-baseline gap-1">
                <span className={`text-2xl sm:text-3xl font-black tabular-nums font-mono leading-none ${k.number}`}>
                  {k.value}
                </span>
                {k.suffix && (
                  <span className="text-xs sm:text-sm font-bold text-slate-400 dark:text-slate-500">
                    {k.suffix}
                  </span>
                )}
              </div>
            </div>

            {/* Footer chân thẻ: Pill chi tiết + Sub-text bổ trợ */}
            <div className="mt-3 pt-2.5 border-t-2 border-slate-900/10 dark:border-slate-800 flex items-center justify-between gap-1 min-w-0 text-xs">
              <span
                className={`inline-block max-w-[65%] truncate px-2 py-0.5 rounded-md text-[11px] font-bold border border-slate-900/40 dark:border-slate-400 ${k.pill}`}
                title={k.hint || k.note}
              >
                {k.note}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold truncate shrink-0">
                {k.subText}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 2. LỘ TRÌNH TĂNG TRƯỞNG - cùng kiểu biểu đồ ở Tổng Quan: số điểm trên
          từng chấm, chấm mới nhất tô đặc, nhãn mục tiêu nằm trên đường. */}
      <div className={`${CARD} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Lộ trình tăng trưởng</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {chartViewMode === 'TOTAL' ? 'Tổng điểm quy đổi · các bài Full Test' : 'Listening và Reading trên cùng thang 495'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-sm">
              <Filter className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={chartAttemptFilter}
                onChange={(e) => setChartAttemptFilter(e.target.value as ChartAttemptFilter)}
                aria-label="Lọc lượt thi"
                className="bg-transparent font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer py-0.5"
              >
                <option value="ALL">Tất cả lượt thi</option>
                <option value="FIRST_ONLY">Chỉ lần đầu</option>
                <option value="BEST_ONLY">Điểm cao nhất mỗi đề</option>
              </select>
            </label>

            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80" role="tablist">
              {([['TOTAL', 'Tổng điểm'], ['LR', 'Listening & Reading']] as const).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={chartViewMode === key}
                  onClick={() => setChartViewMode(key)}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition cursor-pointer ${
                    chartViewMode === key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartViewMode === 'LR' && (
          <div className="flex items-center gap-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${SKILL_COLORS.listening.bar}`} /> Listening
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${SKILL_COLORS.reading.bar}`} /> Reading
            </span>
          </div>
        )}

        {chartData.length > 0 ? (
          <div className="h-[300px] sm:h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 24, right: 24, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="anFillTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={isDark ? 0.3 : 0.16} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="anFillL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SKILL_COLORS.listening.hex} stopOpacity={0.14} />
                    <stop offset="95%" stopColor={SKILL_COLORS.listening.hex} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="anFillR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SKILL_COLORS.reading.hex} stopOpacity={0.14} />
                    <stop offset="95%" stopColor={SKILL_COLORS.reading.hex} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#E2E8F0'} />

                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: isDark ? '#CBD5E1' : '#475569', fontWeight: 600 }}
                  tickMargin={8}
                  axisLine={{ stroke: isDark ? '#475569' : '#CBD5E1' }}
                  tickLine={false}
                  padding={{ left: 24, right: 24 }}
                />
                <YAxis
                  domain={chartViewMode === 'TOTAL' ? chartYAxisConfig.totalDomain : chartYAxisConfig.subDomain}
                  ticks={chartViewMode === 'TOTAL' ? chartYAxisConfig.totalTicks : chartYAxisConfig.subTicks}
                  interval={0}
                  width={44}
                  tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />

                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    const diff = sessionDiffMap[d.id];
                    return (
                      <div className="p-3 rounded-xl bg-slate-900/95 text-white shadow-xl border border-slate-700 text-sm space-y-1 min-w-[200px]">
                        <div className="text-xs text-slate-300 font-semibold">
                          {d.date} · {d.name}{d.isRetest ? ` · Lần ${d.attemptNumber}` : ''}
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-black text-blue-300 tabular-nums">{d.total}đ</span>
                          {diff !== null && diff !== undefined && (
                            <span className={`text-xs font-bold ${diff >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {diff > 0 ? `+${diff}` : diff} so với đề trước
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-300">L {d.listening} · R {d.reading}</div>
                        {d.isRetest && d.scoreDiffFromFirst !== null && d.scoreDiffFromFirst !== undefined && (
                          <div className="text-xs text-slate-300">
                            So với lần 1: {d.scoreDiffFromFirst >= 0 ? `+${d.scoreDiffFromFirst}` : d.scoreDiffFromFirst}đ
                          </div>
                        )}
                      </div>
                    );
                  }}
                />

                {chartViewMode === 'TOTAL' && (
                  <ReferenceLine
                    y={goalScore}
                    stroke={isDark ? '#60A5FA' : '#93C5FD'}
                    strokeDasharray="6 3"
                    label={{
                      value: `Mục tiêu ${goalScore}`,
                      position: 'insideBottomRight',
                      fontSize: 12,
                      fontWeight: 600,
                      fill: isDark ? '#93C5FD' : '#2563EB'
                    }}
                  />
                )}

                {/* Không dùng hiệu ứng vẽ đường: Recharts chỉ vẽ chấm (và số
                    điểm) sau khi hiệu ứng xong, mà hiệu ứng có lúc không xong. */}
                {chartViewMode === 'TOTAL' ? (
                  <Area
                    type="linear"
                    dataKey="total"
                    name="Tổng điểm"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fill="url(#anFillTotal)"
                    isAnimationActive={false}
                    dot={(props: any) => {
                      const { cx, cy, payload, index } = props;
                      if (!cx || !cy) return <g key={props?.key || 'empty'} />;
                      const isLast = index === chartData.length - 1;
                      return (
                        <g key={`an-dot-${payload?.id || cx}`}>
                          <text x={cx} y={cy - 12} textAnchor="middle" fontSize={12} fontWeight={700} fill={isDark ? '#E2E8F0' : '#1E293B'}>
                            {payload?.total}
                          </text>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isLast ? 5.5 : 4}
                            fill={isLast ? '#2563EB' : isDark ? '#0F172A' : '#FFFFFF'}
                            stroke="#2563EB"
                            strokeWidth={2}
                          />
                        </g>
                      );
                    }}
                    activeDot={{ r: 6, fill: '#2563EB', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                ) : (
                  <>
                    <Area
                      type="linear"
                      dataKey="listening"
                      name="Listening"
                      stroke={SKILL_COLORS.listening.hex}
                      strokeWidth={2.5}
                      fill="url(#anFillL)"
                      isAnimationActive={false}
                      dot={{ r: 4, fill: isDark ? '#0F172A' : '#FFFFFF', stroke: SKILL_COLORS.listening.hex, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: SKILL_COLORS.listening.hex, stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                    <Area
                      type="linear"
                      dataKey="reading"
                      name="Reading"
                      stroke={SKILL_COLORS.reading.hex}
                      strokeWidth={2.5}
                      fill="url(#anFillR)"
                      isAnimationActive={false}
                      dot={{ r: 4, fill: isDark ? '#0F172A' : '#FFFFFF', stroke: SKILL_COLORS.reading.hex, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: SKILL_COLORS.reading.hex, stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <BarChart3 className="w-8 h-8 opacity-40" />
            <span>Chưa có bài Full Test nào để vẽ biểu đồ.</span>
          </div>
        )}
      </div>

      {/* 3. MA TRẬN 7 PART - hai khối trung tính, màu nằm ở icon, thanh và
          chip của từng kỹ năng (chàm / xanh ngọc) như thẻ Kỹ năng ở Tổng Quan.
          Part thấp nhất đánh dấu hổ phách (màu cảnh báo), thanh vẫn giữ màu kỹ năng. */}
      <div className={`${CARD} space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Ma trận năng lực 7 Part</h2>
          {partStats && (
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg whitespace-nowrap">
              {partStats.validTestsCount}/5 đề mới gần nhất
            </span>
          )}
        </div>

        {partStats ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {([
                {
                  skill: 'listening' as const,
                  icon: Headphones,
                  title: 'Listening',
                  current: targetGap.currentLC,
                  target: targetGap.targetLC,
                  gap: targetGap.lcGap,
                  questions: targetGap.lcQuestionsNeeded,
                  parts: [
                    { key: 'part1', code: 'P1', name: 'Mô tả tranh', max: 6 },
                    { key: 'part2', code: 'P2', name: 'Hỏi & Đáp', max: 25 },
                    { key: 'part3', code: 'P3', name: 'Hội thoại', max: 39 },
                    { key: 'part4', code: 'P4', name: 'Bài nói ngắn', max: 30 }
                  ]
                },
                {
                  skill: 'reading' as const,
                  icon: BookOpen,
                  title: 'Reading',
                  current: targetGap.currentRC,
                  target: targetGap.targetRC,
                  gap: targetGap.rcGap,
                  questions: targetGap.rcQuestionsNeeded,
                  parts: [
                    { key: 'part5', code: 'P5', name: 'Điền câu', max: 30 },
                    { key: 'part6', code: 'P6', name: 'Điền đoạn văn', max: 16 },
                    { key: 'part7', code: 'P7', name: 'Đọc hiểu văn bản', max: 54 }
                  ]
                }
              ]).map(block => {
                const c = SKILL_COLORS[block.skill];
                return (
                  <div key={block.skill} className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${c.soft}`}>
                          <block.icon className={`w-5 h-5 ${c.text}`} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{block.title}</h3>
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-md text-xs font-semibold ${c.chip}`}>
                            {block.gap > 0 ? `Cần thêm +${block.gap}đ (~${block.questions} câu)` : 'Đã đạt phần mục tiêu'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-2xl font-black tabular-nums ${c.text}`}>{block.current}</span>
                        <span className="text-sm font-semibold text-slate-400 dark:text-slate-500"> / {block.target}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {block.parts.map(p => {
                        const key = p.key as keyof LRPartScore;
                        const acc = partStats.accuracy[key] || 0;
                        const avg = Math.round(partStats.averages[key] || 0);
                        const isWeakest = weakestPart?.key === key;
                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                              isWeakest
                                ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
                                : 'bg-white border-slate-100 dark:bg-slate-900/70 dark:border-slate-800'
                            }`}
                          >
                            <span className={`w-8 h-8 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${c.chip}`}>
                              {p.code}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.name}</span>
                                {isWeakest && (
                                  <span className="px-1.5 py-0.5 rounded-md text-xs font-bold text-amber-800 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/60 whitespace-nowrap">
                                    Thấp nhất
                                  </span>
                                )}
                              </div>
                              <div className="mt-1.5 flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.max(2, acc)}%` }} />
                                </div>
                                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                  {avg}/{p.max} câu
                                </span>
                              </div>
                            </div>
                            <span className={`text-base font-black tabular-nums w-12 text-right shrink-0 ${
                              isWeakest ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100'
                            }`}>
                              {acc}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Gợi ý tính từ dữ liệu thật. Bản cũ ghi cứng "~2 câu · +25đ" cho mọi người. */}
            {weakestPart && weakestPart.accuracy < 100 && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-sm text-slate-700 dark:text-slate-200">
                <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 fill-current shrink-0" />
                <span className="min-w-0">
                  <strong className="font-bold">{weakestPart.name.split(':')[0]}</strong> đang thấp nhất: trung bình {weakestPart.avgCorrect}/{weakestPart.max} câu ({weakestPart.accuracy}%).
                  {' '}Mỗi câu đúng thêm ≈ +5đ {['part1', 'part2', 'part3', 'part4'].includes(weakestPart.key) ? 'Listening' : 'Reading'}.
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Chưa có bài Full Test nào ghi số câu đúng từng Part.
          </div>
        )}
      </div>

      {/* 4. Chẩn Đoán Theo Nguyên Nhân Sai (SPEC 1.4 điểm 1) */}
      <div className={`${CARD} space-y-4`}>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="truncate">Chẩn Đoán Nguyên Nhân Mất Điểm</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Không phải bạn sai ở Part nào, mà là bạn sai <strong className="font-semibold">vì sao</strong>
            </p>
          </div>
          {errorDiagnosis && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
              {errorDiagnosis.total} lỗi đã ghi · {errorDiagnosis.pendingCount} chờ ôn
            </span>
          )}
        </div>

        {errorDiagnosis ? (
          <>
            {/* Câu kết luận - thứ người dùng đọc trước tiên */}
            <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/40">
              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                <strong className="font-bold">{errorDiagnosis.top.percent}%</strong> số lỗi của bạn thuộc nhóm{' '}
                <strong className="font-bold">{errorDiagnosis.top.label}</strong>
                {errorDiagnosis.top.parts.length > 1 ? (
                  <>
                    {' '}— rải ở {errorDiagnosis.top.parts.map(p => `Part ${p}`).join(', ')}.{' '}
                    <span className="text-slate-600 dark:text-slate-300">
                      Đây là lỗ hổng <strong className="font-semibold">kỹ năng</strong>, không phải lỗ hổng Part.
                      Luyện riêng một Part sẽ không giải quyết được.
                    </span>
                  </>
                ) : (
                  <>
                    {' '}— tập trung ở Part {errorDiagnosis.top.parts[0]}.{' '}
                    <span className="text-slate-600 dark:text-slate-300">
                      Khu trú ở một Part nên có thể xử lý bằng luyện tập nhắm đúng chỗ.
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Phân bố theo nhóm nguyên nhân: một màu, xếp giảm dần, nhãn trực tiếp */}
            <div className="space-y-2.5">
              {errorDiagnosis.rows.map((row, index) => {
                const barPercent = Math.round((row.count / errorDiagnosis.maxCount) * 100);
                const isTop = index === 0;

                return (
                  <div key={row.category} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {row.label}
                        </span>
                        {isTop && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/70 whitespace-nowrap shrink-0">
                            Điểm nghẽn
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap shrink-0">
                        {row.count} <span className="font-medium text-slate-400 dark:text-slate-500">· {row.percent}%</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-500"
                          style={{ width: `${Math.max(3, barPercent)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap shrink-0 w-[92px] text-right">
                        {row.parts.map(p => `P${p}`).join(' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
              Cột bên phải là các Part mà nhóm lỗi đó xuất hiện. Dữ liệu lấy từ Sổ Tay Bắt Bẫy — ghi càng đủ, chẩn đoán càng chính xác.
            </p>
          </>
        ) : (
          <div className="py-10 text-center space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chưa có lỗi nào trong Sổ Tay Bắt Bẫy.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto">
              Mỗi lần làm đề, ghi lại vài câu sai kèm nguyên nhân. Sau khoảng 20 lỗi, phần này sẽ chỉ ra
              nguyên nhân nào đang lấy đi nhiều điểm nhất của bạn.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={`${CARD} space-y-3`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Lịch học 12 tuần</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">{heatmap.filter(day => day.active).length}/84 ngày</span>
          </div>
          <div className="grid grid-flow-col grid-rows-7 grid-cols-12 gap-1" aria-label="Lịch học 12 tuần">
            {heatmap.map(day => (
              <span key={day.date} title={`${day.date}: ${day.session ? 'có buổi học' : ''}${day.session && day.vocabulary ? ', ' : ''}${day.vocabulary ? 'có từ vựng' : ''}${!day.active ? 'chưa ghi học' : ''}`}
                aria-label={`${day.date}: ${day.active ? 'đã học' : 'chưa học'}`}
                className={`aspect-square rounded-[4px] border ${day.active ? 'border-blue-500 bg-blue-600 dark:border-blue-400 dark:bg-blue-500' : 'border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800'}`} />
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{vocabTotal12Weeks} từ đã ghi trong 12 tuần. Một ngày được tô khi có buổi học hoặc ghi từ vựng.</p>
        </section>

        <section className={`${CARD} space-y-3`}>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Thời gian vượt từng pha</h2>
          {pacing.phases.length ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400">Trung bình từ {pacing.runsUsed} lượt Phòng Thi cùng chế độ có bấm “xong pha”.</p>
              <div className="h-40" aria-label="Biểu đồ thời gian vượt từng pha">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pacing.phases} margin={{ top: 4, right: 8, bottom: 4, left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="′" />
                    <Tooltip formatter={(value: number) => [`${value} phút`, 'Vượt giờ trung bình']} />
                    <Bar dataKey="averageOverrun" fill="#475569" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">{pacing.phases.map(phase => (
                <div key={phase.name} className="flex justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <span>{phase.name} <span className="text-xs text-slate-400">({phase.count} lượt)</span></span>
                  <strong className={phase.averageOverrun > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}>{phase.averageOverrun > 0 ? '+' : ''}{phase.averageOverrun} phút</strong>
                </div>
              ))}</div>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Cần ít nhất 3 lượt cùng chế độ: vào Phòng Thi và bấm “xong pha” khi hoàn tất từng pha để xem xu hướng.</p>
          )}
        </section>
      </div>

      <section className={`${CARD} space-y-3`}>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Ưu tiên cải thiện theo nguyên nhân</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {priority.eligible
            ? `Ước tính từ ${priority.testsUsed} đề mới và ${priority.mistakeCount} lỗi đã phân loại; đây không phải điểm ETS chính thức.`
            : `Chưa đủ dữ liệu (${priority.testsUsed}/3 đề mới có điểm từng Part, ${priority.mistakeCount}/10 lỗi). Hiện chỉ xếp theo tần suất lỗi.`}
        </p>
        {priority.rows.length ? <div className="space-y-2">{priority.rows.map(row => (
          <div key={row.category} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <span>{ERROR_CATEGORY_LABELS[row.category].label}</span>
            <strong className="whitespace-nowrap">{priority.eligible ? `ước tính +${Math.round(row.estimatedPoints)}đ` : `${row.count} lỗi`}</strong>
          </div>
        ))}</div> : <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có lỗi đã phân loại.</p>}
      </section>

    </div>
  );
};
