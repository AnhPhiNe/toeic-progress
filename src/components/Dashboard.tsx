import React, { useMemo } from 'react';
import { 
  Flame, 
  Trophy, 
  TrendingUp, 
  BookOpen, 
  Zap, 
  CheckCircle2, 
  ArrowRight, 
  AlertCircle,
  BarChart2,
  Headphones,
  Target,
  Crown
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
import { StudySession, MistakeEntry, UserProfile, LRPartScore } from '../types';
import { getCurrentRankTier, getTodayDateString } from '../utils/storage';
import { calculatePartAccuracy } from '../utils/etsScoring';

interface DashboardProps {
  profile: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  theme: 'light' | 'dark';
  onOpenSessionLogger: () => void;
  onNavigateToAnalytics: () => void;
  onNavigateToMistakes: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
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

  // Số điểm còn thiếu để chạm 990
  const pointsRemaining = Math.max(0, 990 - highestScore);
  const targetPercent = highestScore ? Math.min(100, Math.round((highestScore / 990) * 100)) : 0;

  // Dữ liệu sóng tiến độ mini: Sắp xếp theo ngày tăng dần để biểu đồ đi lên từ trái sang phải
  const sparklineData = useMemo(() => {
    return [...fullTests]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(session => ({
        date: session.date.substring(5), // MM-DD
        name: session.testName,
        total: session.totalScore || 0,
        listening: session.scaledListening || 0,
        reading: session.scaledReading || 0
      }));
  }, [fullTests]);

  // Stats tóm tắt KPI cho biểu đồ
  const chartStats = useMemo(() => {
    if (sparklineData.length === 0) return null;
    const firstScore = sparklineData[0].total;
    const latestScore = sparklineData[sparklineData.length - 1].total;
    const scoreDiff = latestScore - firstScore;
    return {
      latestScore,
      scoreDiff,
      totalTests: sparklineData.length
    };
  }, [sparklineData]);

  // Độ chính xác 7 Part trung bình từ 3 đề gần nhất
  const partMeters = useMemo(() => {
    const validTests = fullTests.filter(t => t.partScores);
    if (validTests.length === 0) {
      return [
        { key: 'part1', name: 'Part 1: Tranh', acc: 95, color: 'bg-emerald-500' },
        { key: 'part2', name: 'Part 2: Hỏi-Đáp', acc: 92, color: 'bg-emerald-500' },
        { key: 'part3', name: 'Part 3: Hội thoại', acc: 88, color: 'bg-sky-500' },
        { key: 'part4', name: 'Part 4: Bài nói', acc: 87, color: 'bg-sky-500' },
        { key: 'part5', name: 'Part 5: Điền câu', acc: 93, color: 'bg-indigo-500' },
        { key: 'part6', name: 'Part 6: Đoạn văn', acc: 90, color: 'bg-indigo-500' },
        { key: 'part7', name: 'Part 7: Đọc hiểu', acc: 81, color: 'bg-amber-500' },
      ];
    }

    const totals: LRPartScore = { part1: 0, part2: 0, part3: 0, part4: 0, part5: 0, part6: 0, part7: 0 };
    const sample = validTests.slice(0, 3);
    sample.forEach(t => {
      if (t.partScores) {
        totals.part1 += t.partScores.part1 || 0;
        totals.part2 += t.partScores.part2 || 0;
        totals.part3 += t.partScores.part3 || 0;
        totals.part4 += t.partScores.part4 || 0;
        totals.part5 += t.partScores.part5 || 0;
        totals.part6 += t.partScores.part6 || 0;
        totals.part7 += t.partScores.part7 || 0;
      }
    });

    const averages: LRPartScore = {
      part1: totals.part1 / sample.length,
      part2: totals.part2 / sample.length,
      part3: totals.part3 / sample.length,
      part4: totals.part4 / sample.length,
      part5: totals.part5 / sample.length,
      part6: totals.part6 / sample.length,
      part7: totals.part7 / sample.length,
    };

    const accuracy = calculatePartAccuracy(averages);

    const getMeterColor = (acc: number) => {
      if (acc >= 92) return 'bg-emerald-500';
      if (acc >= 85) return 'bg-sky-500';
      if (acc >= 75) return 'bg-indigo-500';
      return 'bg-amber-500';
    };

    return [
      { key: 'part1', name: 'Part 1: Tranh', acc: accuracy.part1, color: getMeterColor(accuracy.part1) },
      { key: 'part2', name: 'Part 2: Hỏi & Đáp', acc: accuracy.part2, color: getMeterColor(accuracy.part2) },
      { key: 'part3', name: 'Part 3: Hội thoại', acc: accuracy.part3, color: getMeterColor(accuracy.part3) },
      { key: 'part4', name: 'Part 4: Bài nói', acc: accuracy.part4, color: getMeterColor(accuracy.part4) },
      { key: 'part5', name: 'Part 5: Điền câu', acc: accuracy.part5, color: getMeterColor(accuracy.part5) },
      { key: 'part6', name: 'Part 6: Đoạn văn', acc: accuracy.part6, color: getMeterColor(accuracy.part6) },
      { key: 'part7', name: 'Part 7: Đọc hiểu', acc: accuracy.part7, color: getMeterColor(accuracy.part7) },
    ];
  }, [fullTests]);

  // Part yếu nhất
  const weakestMeter = useMemo(() => {
    return [...partMeters].sort((a, b) => a.acc - b.acc)[0];
  }, [partMeters]);

  // Tính 7 ngày trong tuần cho Lịch Check-in
  const weekDays = useMemo(() => {
    const days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const currentDayOfWeek = new Date().getDay(); // 0 = CN, 1 = T2...
    const adjustedCurrent = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;

    return days.map((dayLabel, index) => {
      const isPast = index < adjustedCurrent;
      const isCurrent = index === adjustedCurrent;
      const isCompleted = isPast || (isCurrent && hasStudiedToday);

      return {
        label: dayLabel,
        isCompleted,
        isCurrent
      };
    });
  }, [hasStudiedToday]);

  const isDark = theme === 'dark';

  // Linear Bento Matrix Stats & Progress
  const listeningScore = bestTest?.scaledListening || 0;
  const readingScore = bestTest?.scaledReading || 0;
  const listeningPercent = Math.min(100, Math.round((listeningScore / 495) * 100));
  const readingPercent = Math.min(100, Math.round((readingScore / 495) * 100));

  // Cột mốc TOEIC tạo động lực
  const milestones = useMemo(() => [
    { score: 500, label: 'Cơ bản' },
    { score: 750, label: 'Bứt phá' },
    { score: 900, label: 'Xuất sắc' },
    { score: 990, label: 'Master', isMax: true }
  ], []);

  return (
    <div className="w-full space-y-5 animate-fade-in">
      
      {/* 2-COLUMN BALANCED GRID (Apple / Notion Calm Aesthetics) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ================= LEFT COLUMN (8 / 12 ~ 67%): PERFORMANCE ================= */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* 1. PROGRESS SPARKLINE CARD (Biểu đồ sóng có KPI Stats) */}
          <div className="ui-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                    Tiến Trình Tăng Trưởng Điểm Số
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Sự thăng tiến qua từng đề thi chuẩn ETS
                  </p>
                </div>
              </div>

              {/* KPI Quick Stats Chips */}
              <div className="flex items-center flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 text-xs font-semibold">
                  Mới nhất: <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums">{chartStats?.latestScore || highestScore}đ</strong>
                </span>

                {chartStats && chartStats.totalTests > 1 && (
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    chartStats.scoreDiff >= 0 
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60'
                  }`}>
                    Tăng trưởng: <strong className="tabular-nums">{chartStats.scoreDiff >= 0 ? `+${chartStats.scoreDiff}` : chartStats.scoreDiff}đ ↗</strong>
                  </span>
                )}

                <span className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  {chartStats?.totalTests || 0} đề ETS
                </span>

                <button
                  onClick={onNavigateToAnalytics}
                  className="px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition flex items-center space-x-1 cursor-pointer"
                  title="Xem phân tích chi tiết điểm số"
                >
                  <span>Chi tiết</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Sparkline Area Chart - Clean, High Contrast & Interactive */}
            <div className="h-48 sm:h-52 w-full pt-1">
              {sparklineData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={sparklineData} 
                    margin={{ top: 22, right: 24, left: 0, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="scoreGlowCalm" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.35}/>
                        <stop offset="65%" stopColor="#6366F1" stopOpacity={0.12}/>
                        <stop offset="100%" stopColor="#818CF8" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>

                    {/* Mạng lưới tọa độ ngang nét đứt rõ nét */}
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      vertical={false} 
                      stroke={isDark ? '#334155' : '#E2E8F0'} 
                      opacity={0.85} 
                    />

                    <XAxis 
                      dataKey="date" 
                      stroke={isDark ? '#475569' : '#CBD5E1'} 
                      tick={{ fontSize: 11, fill: isDark ? '#E2E8F0' : '#334155', fontWeight: 600 }} 
                      axisLine={{ stroke: isDark ? '#475569' : '#CBD5E1' }}
                      tickLine={false}
                      padding={{ left: 28, right: 28 }}
                    />
                    <YAxis 
                      domain={[(dataMin: number) => Math.max(0, Math.floor((dataMin - 50) / 50) * 50), (dataMax: number) => Math.min(1000, Math.ceil((dataMax + 50) / 50) * 50)]}
                      width={42}
                      stroke={isDark ? '#475569' : '#CBD5E1'} 
                      tick={{ fontSize: 11, fill: isDark ? '#E2E8F0' : '#334155', fontWeight: 600 }} 
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => val >= 1000 ? '990' : val}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="p-2.5 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 text-white shadow-xl border border-slate-700/80 text-xs space-y-1 backdrop-blur-sm">
                              <div className="text-[10px] text-slate-400 font-semibold">{label} · {d.name || 'Đề ETS'}</div>
                              <div className="flex items-baseline space-x-2">
                                <span className="text-base font-black text-indigo-400 tabular-nums">{d.total}đ</span>
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
                      y={1000} 
                      stroke="#4F46E5" 
                      strokeDasharray="4 4" 
                      strokeWidth={1.5}
                      label={{ 
                        value: '🎯 ĐÍCH 990', 
                        fill: isDark ? '#A5B4FC' : '#4F46E5', 
                        fontSize: 10, 
                        fontWeight: 800, 
                        position: 'insideTopLeft' 
                      }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#4F46E5" 
                      strokeWidth={3} 
                      fill="url(#scoreGlowCalm)" 
                      dot={{ r: 4.5, fill: isDark ? '#0F172A' : '#FFFFFF', stroke: '#4F46E5', strokeWidth: 2.5 }} 
                      activeDot={{ r: 6.5, fill: '#4F46E5', stroke: '#FFFFFF', strokeWidth: 2.5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Chưa có bài test nào.
                </div>
              )}
            </div>
          </div>

          {/* 2. 7-PART MASTERY - COMPACT LISTENING & READING */}
          <div className="ui-card p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
                  <BarChart2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-[13px] font-bold text-slate-900 dark:text-white">
                    Độ Thành Thạo 7 Part
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Tỷ lệ chính xác trung bình (%) từ 3 đề gần nhất
                  </p>
                </div>
              </div>

              {/* Weakest Part Callout Badge */}
              <div className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 text-[11px] font-semibold">
                <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Cần kéo điểm: {weakestMeter.name.split(':')[0]} ({weakestMeter.acc}%)</span>
              </div>
            </div>

            {/* 2-Column Compact: Listening (1-4) & Reading (5-7) in subtle tinted container */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800/60 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
              
              {/* LISTENING (Part 1 - 4) */}
              <div className="space-y-1.5">
                <div className="flex items-center space-x-1.5 text-sky-700 dark:text-sky-300 pb-1">
                  <Headphones className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Listening (Part 1 – 4)</span>
                </div>

                {partMeters.slice(0, 4).map(meter => {
                  const isHigh = meter.acc >= 90;
                  return (
                    <div key={meter.key} className="space-y-0.5">
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                          {meter.name}
                        </span>
                        <span className="font-black text-slate-900 dark:text-white text-[11px] tabular-nums">
                          {meter.acc}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 ${
                            isHigh 
                              ? 'bg-gradient-to-r from-sky-500 to-cyan-400' 
                              : 'bg-gradient-to-r from-amber-500 to-orange-400'
                          }`}
                          style={{ width: `${meter.acc}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* READING (Part 5 - 7) */}
              <div className="space-y-1.5">
                <div className="flex items-center space-x-1.5 text-emerald-700 dark:text-emerald-300 pb-1">
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">Reading (Part 5 – 7)</span>
                </div>

                {partMeters.slice(4).map(meter => {
                  const isHigh = meter.acc >= 90;
                  return (
                    <div key={meter.key} className="space-y-0.5">
                      <div className="flex justify-between items-baseline">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                          {meter.name}
                        </span>
                        <span className="font-black text-slate-900 dark:text-white text-[11px] tabular-nums">
                          {meter.acc}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 ${
                            isHigh 
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                              : 'bg-gradient-to-r from-amber-500 to-orange-400'
                          }`}
                          style={{ width: `${meter.acc}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

        </div>

        {/* ================= RIGHT COLUMN (4 / 12 ~ 33%): STREAK & COMPACT 990 ================= */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* 1. CHUỖI NGÀY HỌC - THE GOLDEN FIRE STREAK */}
          <div className="relative overflow-hidden p-4 sm:p-4.5 space-y-3 rounded-2xl bg-gradient-to-br from-amber-500/[0.08] via-orange-500/[0.04] to-amber-500/[0.02] dark:from-amber-950/30 dark:via-slate-900/80 dark:to-slate-900/90 border border-amber-300/80 dark:border-amber-600/50 shadow-sm shadow-amber-500/5">
            
            {/* Ambient Background Glows */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="absolute -top-10 -right-10 w-28 h-28 bg-gradient-to-br from-amber-400/20 to-orange-400/10 rounded-full blur-2xl" />
            </div>

            {/* Header: Flame Badge + Streak Number */}
            <div className="relative flex items-center justify-between !mt-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-400 text-white shadow-sm shadow-orange-500/30 flex items-center justify-center shrink-0">
                  <Flame className="w-4 h-4 fill-white animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-amber-950 dark:text-amber-100 uppercase tracking-wider">
                    Chuỗi Ngày Học
                  </h3>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">Kỷ luật giữ chuỗi</p>
                </div>
              </div>

              {/* Glowing Streak Pill Counter */}
              <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-amber-100/90 dark:bg-slate-900/95 border border-amber-300/90 dark:border-amber-600/70 shadow-xs">
                <span className="text-2xl font-black bg-gradient-to-r from-amber-600 via-orange-500 to-amber-500 bg-clip-text text-transparent tabular-nums leading-none">
                  {profile.currentStreak}
                </span>
                <div className="flex flex-col text-left">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 leading-none">
                    NGÀY
                  </span>
                  <span className="text-[8px] font-bold text-amber-700/80 dark:text-amber-400/80 leading-tight">
                    Giữ vững 🔥
                  </span>
                </div>
              </div>
            </div>

            {/* 7-Day Check-in Dots */}
            <div className="relative p-2.5 rounded-xl bg-amber-50/90 dark:bg-slate-900/90 border border-amber-200/90 dark:border-amber-800/60 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold px-0.5">
                <span className="text-slate-700 dark:text-slate-200 font-bold">Tiến độ tuần này:</span>
                {hasStudiedToday ? (
                  <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Đã học hôm nay</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-bold animate-pulse">
                    <span>Chưa học hôm nay</span>
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-0.5">
                {weekDays.map((d, i) => (
                  <div key={i} className="flex flex-col items-center space-y-1">
                    <div 
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all ${
                        d.isCompleted
                          ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-orange-500/25 font-black'
                          : d.isCurrent
                          ? 'bg-amber-100 text-amber-800 border-2 border-dashed border-amber-500 dark:bg-amber-950/70 dark:text-amber-300 font-black animate-pulse'
                          : 'bg-amber-100/50 text-amber-700/60 dark:bg-slate-800 dark:text-slate-500 font-bold'
                      }`}
                    >
                      {d.isCompleted ? '✓' : d.label}
                    </div>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2. MỤC TIÊU 990 - THE COMPACT TARGET CONSOLE */}
          <div className="ui-card p-4 sm:p-5 space-y-3.5">
            {/* Header: Target Icon + Title + Polished Rank Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    Mục Tiêu 990 TOEIC
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    Điểm số cao nhất đạt được
                  </p>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200/80 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold whitespace-nowrap shrink-0 flex items-center space-x-1">
                <Crown className="w-3 h-3 text-amber-500 fill-amber-400" />
                <span>{currentRank.title.replace(' Huyền Thoại', '')}</span>
              </span>
            </div>

            {/* Score Showcase Row */}
            <div className="flex items-baseline justify-between pt-0.5">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-indigo-600 via-sky-600 to-indigo-500 bg-clip-text text-transparent tabular-nums leading-none tracking-tight">
                  {highestScore || 0}
                </span>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  / 990đ
                </span>
              </div>

              <div className="text-right">
                <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums leading-none">
                  {targetPercent}%
                </span>
              </div>
            </div>

            {/* Precision Gauge Rail & Milestones */}
            <div className="space-y-1.5">
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800/90 border border-slate-300/80 dark:border-slate-700/60 overflow-hidden relative shadow-inner p-[1px]">
                <div 
                  className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-sky-400 to-emerald-400 transition-all duration-700 relative"
                  style={{ width: `${Math.min(100, Math.max(3, targetPercent))}%` }}
                >
                  <div className="absolute inset-x-0 top-0 h-[40%] bg-white/30 rounded-t-full" />
                </div>
              </div>

              {/* 4 Motivation Milestone Badges */}
              <div className="flex justify-between items-center text-[10px] px-0.5 font-bold">
                {milestones.map((m, idx) => {
                  const isPassed = (highestScore || 0) >= m.score;
                  const prevScore = idx === 0 ? 0 : milestones[idx - 1].score;
                  const isCurrentTarget = !isPassed && (highestScore || 0) >= prevScore;

                  return (
                    <span 
                      key={m.score}
                      className={
                        isCurrentTarget
                          ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                          : isPassed
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }
                    >
                      {isPassed ? `✓ ${m.score}` : m.score}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* 2-Column Mini Skill Cards (Listening & Reading) */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              {/* Listening Mini Card */}
              <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-800/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1 text-sky-700 dark:text-sky-300">
                    <Headphones className="w-3 h-3 shrink-0" />
                    <span className="text-[11px] font-bold">Listening</span>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 tabular-nums">
                    {listeningPercent}%
                  </span>
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums leading-none">
                    {listeningScore}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">/ 495đ</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-sky-200/70 dark:bg-slate-800 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-700" 
                    style={{ width: `${listeningPercent}%` }} 
                  />
                </div>
              </div>

              {/* Reading Mini Card */}
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1 text-emerald-700 dark:text-emerald-300">
                    <BookOpen className="w-3 h-3 shrink-0" />
                    <span className="text-[11px] font-bold">Reading</span>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {readingScore === 495 ? '100%' : `-${495 - readingScore}đ`}
                  </span>
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums leading-none">
                    {readingScore}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">/ 495đ</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-emerald-200/70 dark:bg-slate-800 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700" 
                    style={{ width: `${readingPercent}%` }} 
                  />
                </div>
              </div>
            </div>

            {/* Footer: Styled Callout with Solid Pill Button */}
            {pointsRemaining > 0 ? (
              <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-between gap-2 shadow-xs">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <Target className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                    Còn <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold">{pointsRemaining}đ</strong> để chạm đỉnh 990
                  </span>
                </div>

                <button
                  onClick={onOpenSessionLogger}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[11px] font-bold shadow-xs shadow-indigo-600/20 flex items-center space-x-1 shrink-0 cursor-pointer transition"
                >
                  <Zap className="w-3 h-3 fill-current" />
                  <span>Luyện đề</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/40 text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-center space-x-1.5 shadow-xs">
                <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Đã chạm đỉnh 990 TOEIC tuyệt đối!</span>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
