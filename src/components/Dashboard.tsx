import React, { useMemo } from 'react';
import { 
  Flame, 
  TrendingUp, 
  TrendingDown,
  BookOpen, 
  Zap, 
  CheckCircle2, 
  ArrowRight, 
  Headphones, 
  Target, 
  Crown,
  Award,
  PlusCircle
} from 'lucide-react';
import { 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  CartesianGrid
} from 'recharts';
import { StudySession, MistakeEntry, UserProfile } from '../types';
import { getCurrentRankTier, getTodayDateString, computeSessionAttemptMap } from '../utils/storage';

interface DashboardProps {
  /** Cảnh báo tái phạm, đặt ngay đầu trang khi có (SPEC mục 4.6) */
  relapseSlot?: React.ReactNode;
  profile: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  theme: 'light' | 'dark';
  onOpenSessionLogger: () => void;
  onNavigateToAnalytics: () => void;
  onNavigateToMistakes: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  relapseSlot,
  profile,
  sessions,
  mistakes: _mistakes,
  theme,
  onOpenSessionLogger,
  onNavigateToAnalytics,
  onNavigateToMistakes: _onNavigateToMistakes
}) => {
  const today = getTodayDateString();

  // Kiểm tra hôm nay đã học chưa
  const hasStudiedToday = useMemo(() => {
    return sessions.some(s => s.date === today) || profile.lastStudyDate === today;
  }, [sessions, profile.lastStudyDate, today]);

  // Đề Full Test
  const fullTests = useMemo(() => sessions.filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0), [sessions]);
  
  const highestScore = useMemo(() => {
    if (fullTests.length === 0) return 0;
    return Math.max(...fullTests.map(s => s.totalScore || 0));
  }, [fullTests]);

  const bestTest = useMemo(() => {
    if (fullTests.length === 0) return null;
    return [...fullTests].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))[0];
  }, [fullTests]);

  // Rank Tier hiện tại
  const currentRank = useMemo(() => getCurrentRankTier(highestScore), [highestScore]);

  /**
   * Mục tiêu điểm lấy từ hồ sơ, KHÔNG neo cứng vào 990 (SPEC mục 2.1).
   * Trước đây Dashboard tính theo 990 trong khi Phân Tích tính theo
   * targetScore, nên người đặt mục tiêu 700 và đạt 700 thấy Dashboard
   * báo "Thiếu 290đ - 71%" còn Phân Tích báo đã đạt 100%.
   */
  const targetScore = Math.max(10, Math.min(990, profile.targetScore || 990));
  const pointsRemaining = Math.max(0, targetScore - highestScore);
  const targetPercent = highestScore ? Math.min(100, Math.round((highestScore / targetScore) * 100)) : 0;

  const attemptMap = useMemo(() => computeSessionAttemptMap(sessions), [sessions]);

  // Dữ liệu sóng tiến độ mini: Sắp xếp theo ngày tăng dần để biểu đồ đi lên từ trái sang phải
  const sparklineData = useMemo(() => {
    return [...fullTests]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(session => {
        const meta = attemptMap[session.id];
        const attemptNumber = meta?.attemptNumber || session.attemptNumber || 1;
        const isRetest = attemptNumber > 1;
        return {
          id: session.id,
          date: session.date.substring(5), // MM-DD
          name: session.testName,
          total: session.totalScore || 0,
          listening: session.scaledListening || 0,
          reading: session.scaledReading || 0,
          attemptNumber,
          isRetest
        };
      });
  }, [fullTests, attemptMap]);

  // Stats tóm tắt KPI cho biểu đồ kèm ngữ cảnh chi tiết
  const chartStats = useMemo(() => {
    if (sparklineData.length === 0) return null;
    const firstScore = sparklineData[0].total;
    const latest = sparklineData[sparklineData.length - 1];
    const latestScore = latest.total;
    const scoreDiff = latestScore - firstScore;
    const best = [...sparklineData].sort((a, b) => b.total - a.total)[0];

    return {
      latestScore,
      latestName: latest.name,
      latestDate: latest.date,
      firstScore,
      bestDate: best?.date,
      bestName: best?.name,
      scoreDiff,
      totalTests: sparklineData.length
    };
  }, [sparklineData]);

  // Dynamic Y-Axis: Căn chỉnh trục Y thông minh theo dải điểm thực tế, xóa bỏ khoảng trắng thừa bên dưới
  const yAxisConfig = useMemo(() => {
    if (sparklineData.length === 0) {
      const emptyFloor = Math.max(200, Math.min(400, targetScore - 400));
      const emptyTicks: number[] = [];
      for (let t = emptyFloor; t < targetScore; t += 100) emptyTicks.push(t);
      emptyTicks.push(targetScore);
      return {
        domain: [emptyFloor, targetScore] as [number, number],
        ticks: emptyTicks
      };
    }
    const minScore = Math.min(...sparklineData.map(d => d.total));
    
    // Tìm mốc sàn làm tròn xuống bội số 50, chừa 25 điểm an toàn để điểm thấp nhất không dính sát đáy
    let floorScore = Math.floor((minScore - 25) / 50) * 50;
    floorScore = Math.max(200, Math.min(floorScore, 850));

    // Trần biểu đồ là mục tiêu của người dùng, chừa chỗ nếu đã vượt mục tiêu.
    // Kéo trục tới 990 cho người nhắm 700 sẽ ép đường tiến bộ phẳng lì.
    const maxScore = Math.max(...sparklineData.map(d => d.total));
    let ceilingScore = Math.max(targetScore, Math.ceil((maxScore + 25) / 50) * 50);
    ceilingScore = Math.min(990, ceilingScore);

    // Bước nhảy 50 điểm (hoặc 100 điểm nếu khoảng cách lớn hơn 350)
    const step = (ceilingScore - floorScore) > 350 ? 100 : 50;
    const ticks: number[] = [];
    for (let s = floorScore; s < ceilingScore; s += step) {
      ticks.push(s);
    }
    if (!ticks.includes(ceilingScore)) {
      ticks.push(ceilingScore);
    }

    return {
      domain: [floorScore, ceilingScore] as [number, number],
      ticks
    };
  }, [sparklineData, targetScore]);

  // Tính 7 ngày trong tuần cho Lịch Check-in
  const weekDays = useMemo(() => {
    const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const today = getTodayDateString();

    // Thứ Hai của tuần hiện tại
    const now = new Date(`${today}T00:00:00`);
    const dayOfWeek = now.getDay(); // 0 = Chủ nhật
    const monday = new Date(now);
    monday.setDate(now.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));

    const toIso = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // Ngày nào THỰC SỰ có buổi học được ghi. Trước đây mọi ngày đã trôi qua
    // đều được tô xanh bất kể có học hay không, nên lưới này chỉ đếm số ngày
    // đã qua trong tuần chứ không phản ánh kỷ luật.
    const studiedDates = new Set(sessions.map(s => s.date));
    if (profile.lastStudyDate) studiedDates.add(profile.lastStudyDate);

    return labels.map((label, index) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + index);
      const iso = toIso(d);

      return {
        label,
        date: iso,
        isCompleted: studiedDates.has(iso),
        isCurrent: iso === today,
        isMissed: iso < today && !studiedDates.has(iso)
      };
    });
  }, [sessions, profile.lastStudyDate]);

  const isDark = theme === 'dark';

  // Linear Bento Matrix Stats & Progress
  const listeningScore = bestTest?.scaledListening || 0;
  const readingScore = bestTest?.scaledReading || 0;
  const listeningPercent = Math.min(100, Math.round((listeningScore / 495) * 100));
  const readingPercent = Math.min(100, Math.round((readingScore / 495) * 100));

  return (
    <div className="w-full space-y-4 animate-fade-in">
      {relapseSlot}
      
      {/* 2-COLUMN BALANCED GRID (Apple / Notion Calm Aesthetics) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        
        {/* ================= LEFT COLUMN (8 / 12 ~ 67%): PERFORMANCE ================= */}
        <div className="xl:col-span-8 flex flex-col">
          
          {/* 1. PROGRESS LINE CHART CARD */}
          <div className="relative overflow-hidden p-4 sm:p-5 space-y-3.5 flex-1 flex flex-col justify-between rounded-2xl bg-white/95 dark:bg-[#0E1526]/95 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-sm transition-all duration-300">
            {/* Title row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200/70 dark:border-blue-900/40 shrink-0 shadow-2xs flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-none">
                  Tiến Trình Tăng Trưởng Điểm Số
                </h3>
              </div>
              <button
                onClick={onNavigateToAnalytics}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900/90 border border-blue-200/80 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-95 text-xs font-bold transition-all cursor-pointer shadow-2xs group"
                title="Xem phân tích chi tiết điểm số"
              >
                <span>Xem phân tích</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* 3 KPI Stat Cards - Đồng bộ Vibrant Pastel Gradient chuẩn UI/UX Pro Max */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {/* Card 1: Điểm Mới Nhất - Blue Vibrant Pastel */}
              <div className="relative overflow-hidden p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-blue-100/90 via-blue-50/75 to-indigo-100/50 dark:from-blue-950/60 dark:via-slate-900/90 dark:to-blue-950/40 border border-blue-300/80 dark:border-blue-800/70 shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-700 transition-all duration-200 group flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/15 dark:bg-blue-500/20 rounded-full blur-xl pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1 sm:mb-1.5 min-w-0">
                    <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate min-w-0">
                      Mới Nhất
                    </span>
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/90 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 flex items-center justify-center shadow-2xs shrink-0">
                      <Target className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 tracking-tight tabular-nums leading-none">
                      {chartStats?.latestScore || highestScore}
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">/ {targetScore}đ</span>
                  </div>
                </div>
                {/* Capsule Context Badge - Gọn gàng & Sắc nét */}
                <div className="mt-2 sm:mt-2.5 px-2.5 py-1 rounded-xl bg-white/95 dark:bg-slate-900/85 border border-blue-200/70 dark:border-blue-900/50 shadow-2xs flex items-center justify-between gap-1.5 text-[11px] backdrop-blur-xs min-w-0">
                  <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">
                    Đề thi
                  </span>
                  <span className="font-extrabold text-blue-700 dark:text-blue-300 truncate text-right min-w-0" title={chartStats?.latestName || 'ETS Full Test'}>
                    {chartStats?.latestName || 'ETS Test'}
                  </span>
                </div>
              </div>

              {/* Card 2: Kỷ Lục Điểm Số (Personal Best) - Amber Vibrant Pastel */}
              <div className="relative overflow-hidden p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-amber-100/90 via-amber-50/75 to-orange-100/50 dark:from-amber-950/60 dark:via-slate-900/90 dark:to-amber-950/40 border border-amber-300/80 dark:border-amber-800/70 shadow-xs hover:shadow-md hover:border-amber-400 dark:hover:border-amber-700 transition-all duration-200 group flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/15 dark:bg-amber-500/20 rounded-full blur-xl pointer-events-none" />
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1 sm:mb-1.5 min-w-0">
                    <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate min-w-0">
                      Kỷ Lục (PB)
                    </span>
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/90 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 flex items-center justify-center shadow-2xs shrink-0">
                      <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <div className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 tracking-tight tabular-nums leading-none">
                      {highestScore}
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">điểm</span>
                  </div>
                </div>
                {/* Capsule Context Badge - Phân biệt rõ Listening / Reading */}
                <div className="mt-2 sm:mt-2.5 px-2.5 py-1 rounded-xl bg-white/95 dark:bg-slate-900/85 border border-amber-200/70 dark:border-amber-900/50 shadow-2xs flex items-center justify-between gap-1.5 text-[11px] backdrop-blur-xs min-w-0">
                  <span className="font-bold text-slate-700 dark:text-slate-300 truncate min-w-0">
                    Đỉnh LC/RC
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="bg-amber-200/90 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-1 py-0.5 rounded text-[10.5px] font-black shadow-2xs">
                      L: {bestTest?.scaledListening || 0}
                    </span>
                    <span className="bg-amber-200/90 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-1 py-0.5 rounded text-[10.5px] font-black shadow-2xs">
                      R: {bestTest?.scaledReading || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: Mức Độ Tăng Trưởng - CẢ THẺ đổi màu theo dấu.
                  Trước đây chỉ con số chuyển sang đỏ còn vỏ thẻ vẫn xanh lá,
                  nên thẻ nói "tốt" trong khi số nói "giảm". */}
              <div className={`relative overflow-hidden p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br shadow-xs hover:shadow-md transition-all duration-200 group flex flex-col justify-between ${
                (chartStats?.scoreDiff ?? 0) >= 0
                  ? 'from-emerald-100/90 via-emerald-50/75 to-teal-100/50 dark:from-emerald-950/60 dark:via-slate-900/90 dark:to-emerald-950/40 border border-emerald-300/80 dark:border-emerald-800/70 hover:border-emerald-400 dark:hover:border-emerald-700'
                  : 'from-rose-100/90 via-rose-50/75 to-orange-100/50 dark:from-rose-950/60 dark:via-slate-900/90 dark:to-rose-950/40 border border-rose-300/80 dark:border-rose-800/70 hover:border-rose-400 dark:hover:border-rose-700'
              }`}>
                <div className={`absolute top-0 right-0 w-20 h-20 rounded-full blur-xl pointer-events-none ${
                  (chartStats?.scoreDiff ?? 0) >= 0 ? 'bg-emerald-500/15 dark:bg-emerald-500/20' : 'bg-rose-500/15 dark:bg-rose-500/20'
                }`} />
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1 sm:mb-1.5 min-w-0">
                    <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider truncate min-w-0">
                      Tăng Trưởng
                    </span>
                    <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-white/90 flex items-center justify-center shadow-2xs shrink-0 border ${
                      (chartStats?.scoreDiff ?? 0) >= 0
                        ? 'dark:bg-emerald-900/60 border-emerald-200/80 dark:border-emerald-800/80 text-emerald-600 dark:text-emerald-300'
                        : 'dark:bg-rose-900/60 border-rose-200/80 dark:border-rose-800/80 text-rose-600 dark:text-rose-300'
                    }`}>
                      {(chartStats?.scoreDiff ?? 0) >= 0 ? (
                        <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      ) : (
                        <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <div className={`text-xl sm:text-2xl font-black tracking-tight tabular-nums leading-none ${
                      (chartStats?.scoreDiff ?? 0) >= 0 
                        ? 'text-emerald-700 dark:text-emerald-300' 
                        : 'text-rose-700 dark:text-rose-300'
                    }`}>
                      {chartStats && chartStats.totalTests > 1 
                        ? `${chartStats.scoreDiff >= 0 ? '+' : ''}${chartStats.scoreDiff}` 
                        : '—'}
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">điểm</span>
                  </div>
                </div>
                {/* Capsule Context Badge - Thể hiện tiến độ rõ ràng */}
                <div className={`mt-2 sm:mt-2.5 px-2.5 py-1 rounded-xl bg-white/95 dark:bg-slate-900/85 border shadow-2xs flex items-center justify-between gap-1.5 text-[11px] backdrop-blur-xs min-w-0 ${
                  (chartStats?.scoreDiff ?? 0) >= 0
                    ? 'border-emerald-200/70 dark:border-emerald-900/50'
                    : 'border-rose-200/70 dark:border-rose-900/50'
                }`}>
                  <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">
                    So mốc đầu
                  </span>
                  <div className="flex items-center gap-1 text-[11px] shrink-0">
                    <span className="text-slate-600 dark:text-slate-300 font-bold">
                      {chartStats?.firstScore || 0}đ
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-black">➔</span>
                    <span className={`px-1 py-0.5 rounded text-[10.5px] font-black shadow-2xs ${
                      (chartStats?.scoreDiff ?? 0) >= 0 
                        ? 'bg-emerald-200/90 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200' 
                        : 'bg-rose-200/90 dark:bg-rose-900/80 text-rose-900 dark:text-rose-200'
                    }`}>
                      {chartStats?.latestScore || 0}đ
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Chart */}
            <div className="h-[310px] sm:h-[325px] w-full">
              {sparklineData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={sparklineData} 
                    margin={{ top: 8, right: 24, left: 0, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="royalBlueGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={isDark ? 0.35 : 0.18} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      vertical={false} 
                      stroke={isDark ? '#334155' : '#E2E8F0'} 
                      opacity={0.7} 
                      horizontalValues={yAxisConfig.ticks}
                    />

                    <XAxis 
                      dataKey="date" 
                      stroke={isDark ? '#475569' : '#CBD5E1'} 
                      tick={{ fontSize: 11, fill: isDark ? '#E2E8F0' : '#334155', fontWeight: 600 }} 
                      tickMargin={8}
                      axisLine={{ stroke: isDark ? '#475569' : '#CBD5E1' }}
                      tickLine={false}
                      padding={{ left: 28, right: 28 }}
                    />
                    <YAxis 
                      domain={yAxisConfig.domain}
                      ticks={yAxisConfig.ticks}
                      interval={0}
                      minTickGap={0}
                      width={42}
                      stroke={isDark ? '#475569' : '#CBD5E1'} 
                      tick={{ fontSize: 10.5, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }} 
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="p-2.5 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 text-white shadow-xl border border-slate-700/80 text-xs space-y-1 backdrop-blur-sm">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-slate-400 font-semibold">{label} · {d.name || 'Đề ETS'}</span>
                                {d.attemptNumber && (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                                    d.isRetest 
                                      ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30' 
                                      : 'bg-blue-500/20 text-blue-300'
                                  }`}>
                                    Lần {d.attemptNumber}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-baseline space-x-2">
                                <span className="text-base font-black text-blue-400 tabular-nums">{d.total}đ</span>
                                {(d.listening > 0 || d.reading > 0) && (
                                  <span className="text-[10px] text-slate-300 font-semibold">
                                    LC {d.listening} · RC {d.reading}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }} 
                    />
                    <ReferenceLine 
                      y={targetScore} 
                      stroke={isDark ? '#3B82F6' : '#93C5FD'} 
                      strokeDasharray="6 3" 
                      strokeWidth={1}
                    />
                    <Area 
                      type="linear" 
                      dataKey="total" 
                      stroke="#2563EB" 
                      strokeWidth={3} 
                      fill="url(#royalBlueGlow)"
                      fillOpacity={1}
                      dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        if (!cx || !cy) return <g key={props?.key || 'empty'} />;
                        const isRetest = payload?.isRetest;
                        return (
                          <circle
                            key={`dash-dot-${payload?.id || cx}`}
                            cx={cx}
                            cy={cy}
                            r={isRetest ? 5 : 4}
                            fill={isRetest ? '#8B5CF6' : (isDark ? '#0F172A' : '#FFFFFF')}
                            stroke={isRetest ? '#C084FC' : '#2563EB'}
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={{ r: 6.5, fill: '#2563EB', stroke: '#FFFFFF', strokeWidth: 2.5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full py-5 flex flex-col items-center justify-center text-center space-y-2.5 px-4">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5 max-w-sm">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Bắt Đầu Hành Trình Chinh Phục {targetScore}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Chưa có kết quả đề thi nào được ghi nhận. Hãy nhập điểm đề đầu tiên để kích hoạt biểu đồ tăng trưởng!
                    </p>
                  </div>
                  <button
                    onClick={onOpenSessionLogger}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-sm shadow-blue-600/20 transition cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Nhập Điểm Đề Đầu Tiên</span>
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ================= RIGHT COLUMN (4 / 12 ~ 33%): STREAK & MỤC TIÊU ================= */}
        <div className="xl:col-span-4 flex flex-col justify-between space-y-3.5">
          
          {/* 1. CHUỖI NGÀY HỌC - THE GOLDEN FIRE STREAK */}
          <div className="relative overflow-hidden p-3.5 sm:p-4 space-y-3 rounded-2xl bg-gradient-to-br from-amber-50/90 via-orange-50/50 to-amber-50/30 dark:from-[#1C1814] dark:to-[#14100C] border border-amber-200/80 dark:border-amber-900/40 shadow-[0_2px_12px_rgba(245,158,11,0.06)] hover:shadow-[0_8px_28px_rgba(245,158,11,0.1)] hover:-translate-y-0.5 transition-all duration-300">
            {/* Header: Flame Badge + Streak Number */}
            <div className="relative flex items-center justify-between !mt-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-400 text-white shadow-xs shadow-orange-500/30 flex items-center justify-center shrink-0">
                  <Flame className="w-4 h-4 fill-white animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-none">
                    Chuỗi Ngày Học
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
                    Kỷ luật ôn tập hàng ngày
                  </p>
                </div>
              </div>

              {/* Glowing Streak Pill Counter */}
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-100/90 dark:bg-amber-950/80 border border-amber-300/80 dark:border-amber-700 shadow-2xs">
                <span className="text-2xl font-black text-amber-950 dark:text-amber-200 tabular-nums leading-none">
                  {profile.currentStreak}
                </span>
                <div className="relative flex items-center justify-center">
                  <Flame className="w-4 h-4 text-red-600 fill-orange-500 drop-shadow-[0_2px_6px_rgba(239,68,68,0.35)] animate-pulse" />
                </div>
              </div>
            </div>

            {/* 7-Day Check-in Dots */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-white/95 dark:bg-slate-900/90 border border-amber-200/50 dark:border-slate-800 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold px-0.5">
                <span className="text-slate-800 dark:text-slate-200 font-bold">
                  Tuần này: <span className="text-amber-600 dark:text-amber-400 font-black">{weekDays.filter(d => d.isCompleted).length}/7</span> ngày
                </span>
                {hasStudiedToday ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Đã học hôm nay</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 text-amber-700 dark:text-amber-300 text-[10px] font-bold animate-pulse">
                    <span>Chưa học hôm nay</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-7 gap-1 pt-0.5">
                {weekDays.map((d, i) => (
                  <div key={i} className="flex flex-col items-center space-y-1.5 min-w-0">
                    <div 
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                        d.isCompleted
                          ? `bg-gradient-to-br from-amber-500 to-orange-500 text-white font-black shadow-xs shadow-orange-500/25 ${
                              d.isCurrent ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 scale-105' : ''
                            }`
                          : d.isCurrent
                          ? 'bg-amber-50 text-amber-800 border-2 border-dashed border-amber-400 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-500 font-black animate-pulse ring-2 ring-amber-400/60 ring-offset-2 ring-offset-white dark:ring-offset-slate-900'
                          : d.isMissed
                          ? 'bg-slate-50 text-slate-300 dark:bg-slate-900/60 dark:text-slate-600 font-medium border border-dashed border-slate-300 dark:border-slate-700'
                          : 'bg-slate-100/80 text-slate-400 dark:bg-slate-800/80 dark:text-slate-500 font-medium border border-slate-200/70 dark:border-slate-700'
                      }`}
                    >
                      {d.isCompleted ? (
                        <span className="text-sm font-black leading-none">✓</span>
                      ) : d.isCurrent ? (
                        <Flame className="w-4 h-4 text-amber-500 fill-amber-500/40" />
                      ) : d.isMissed ? (
                        <span className="w-2 h-[2px] rounded-full bg-slate-300 dark:bg-slate-600" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                      )}
                    </div>
                    <div className="flex flex-col items-center">
                      <span className={`text-xs font-bold leading-tight ${
                        d.isCurrent 
                          ? 'text-amber-600 dark:text-amber-400 font-black' 
                          : d.isCompleted 
                          ? 'text-slate-700 dark:text-slate-300 font-bold' 
                          : 'text-slate-400 dark:text-slate-500 font-semibold'
                      }`}>
                        {d.label}
                      </span>
                      {d.isCurrent && (
                        <span className="w-1 h-1 rounded-full bg-amber-500 mt-0.5" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2. MỤC TIÊU ĐIỂM
              Nền xanh nhạt để tách khỏi nền trang, đồng bộ với thẻ Streak
              màu hổ phách bên trên. Sắc độ đủ nhạt để không tranh chấp với
              các thanh xanh đậm bên trong - phân cấp nằm ở độ dày và độ đậm
              của thanh, không phải ở việc vỏ thẻ phải trung tính. */}
          <div className="relative overflow-hidden flex-1 p-4 sm:p-4.5 flex flex-col justify-between gap-3.5 rounded-2xl bg-gradient-to-br from-sky-50/90 via-blue-50/50 to-sky-50/30 dark:from-[#0E1A29] dark:to-[#0B1320] border border-sky-200/80 dark:border-sky-900/40 shadow-[0_2px_12px_rgba(14,165,233,0.06)] hover:shadow-[0_8px_28px_rgba(14,165,233,0.1)] hover:-translate-y-0.5 transition-all duration-300">

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs shadow-blue-600/25 shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight truncate">
                  Mục Tiêu {targetScore}
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-[11px] font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <Crown className="w-3.5 h-3.5 text-amber-600 fill-amber-500 shrink-0" />
                {currentRank.title}
              </span>
            </div>

            {/* Tiến độ tổng. Con số đã nói đủ nên bỏ nhãn trục "Khởi đầu"/"Đích đến" */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="flex items-baseline gap-1 min-w-0">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                    {highestScore || 0}
                  </span>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">/ {targetScore}đ</span>
                </span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                  {pointsRemaining > 0 ? (
                    <>Còn <span className="text-slate-900 dark:text-white font-black">{pointsRemaining}đ</span></>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-black">Đã đạt</span>
                  )}
                  <span className="ml-1.5 text-slate-400 dark:text-slate-500 font-semibold">{targetPercent}%</span>
                </span>
              </div>

              <div className="w-full h-3 rounded-full bg-white/90 dark:bg-slate-800 border border-sky-200/50 dark:border-transparent overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 dark:bg-blue-500 transition-all duration-700"
                  style={{ width: `${Math.min(100, Math.max(2, targetPercent))}%` }}
                />
              </div>
            </div>

            {/* Listening & Reading.
                Cùng một màu: mỗi ô đã có icon và tên riêng nên màu theo kỹ năng
                là mã hóa thừa - và cặp xanh/tím cũ chỉ cách nhau ΔE 1.3 với
                người mù màu đỏ-lục, tức gần như không phân biệt được. */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: Headphones, label: 'Listening', score: listeningScore, percent: listeningPercent },
                { icon: BookOpen, label: 'Reading', score: readingScore, percent: readingPercent }
              ].map(item => (
                <div key={item.label} className="p-3 rounded-xl bg-white/95 dark:bg-slate-900/60 border border-sky-200/60 dark:border-slate-700/70 shadow-2xs space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-1 min-w-0">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <item.icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{item.label}</span>
                    </span>
                    <span className={`text-[11px] font-bold tabular-nums shrink-0 ${
                      item.percent >= 100
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}>
                      {item.percent}%
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums leading-none">
                      {item.score}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">/ 495đ</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        item.percent >= 100 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-blue-400 dark:bg-blue-500'
                      }`}
                      style={{ width: `${Math.max(2, item.percent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={onOpenSessionLogger}
              className="w-full py-2.5 px-3 rounded-xl btn-linear-primary text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Ghi kết quả đề mới</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
