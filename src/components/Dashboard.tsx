import React, { useMemo, useState } from 'react';
import {
  Flame,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  Headphones,
  Target,
  PlusCircle,
  Clock
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
import { StudySession, UserProfile } from '../types';
import { getTodayDateString, computeSessionAttemptMap } from '../utils/storage';
import { getPracticeParts, getPracticeAccuracy } from '../utils/etsScoring';

interface DashboardProps {
  /** Cảnh báo tái phạm, đặt ngay đầu trang khi có (SPEC mục 4.6) */
  relapseSlot?: React.ReactNode;
  profile: UserProfile;
  sessions: StudySession[];
  theme: 'light' | 'dark';
  onOpenSessionLogger: () => void;
  onNavigateToAnalytics: () => void;
}

/**
 * Màu nền thẻ. Mỗi thẻ một tông theo CHỦ ĐỀ của nó, và hai thẻ đứng cạnh
 * nhau không bao giờ chung tông - trang không còn là một mảng trắng liền.
 * Tông chỉ ở mức 50 nên mọi màu tín hiệu bên trong vẫn nổi rõ.
 */
const CARD = 'rounded-2xl border p-4 sm:p-5 transition-colors';
const TINT = {
  amber: 'bg-amber-50 border-amber-200/80 dark:bg-amber-950/20 dark:border-amber-900/40',
  sky: 'bg-sky-50/80 border-sky-200/70 dark:bg-sky-950/20 dark:border-sky-900/40',
  violet: 'bg-violet-50/80 border-violet-200/70 dark:bg-violet-950/20 dark:border-violet-900/40',
  teal: 'bg-teal-50/70 border-teal-200/70 dark:bg-teal-950/20 dark:border-teal-900/40',
  split: 'bg-gradient-to-br from-blue-100/70 via-slate-50 to-orange-100/70 border-slate-200 dark:from-blue-950/20 dark:to-orange-950/20 dark:border-slate-800'
};

const formatShortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export const Dashboard: React.FC<DashboardProps> = ({
  relapseSlot,
  profile,
  sessions,
  theme,
  onOpenSessionLogger,
  onNavigateToAnalytics
}) => {
  const today = getTodayDateString();
  const isDark = theme === 'dark';
  const [chartFilter, setChartFilter] = useState<'ALL' | 'FIRST'>('ALL');

  const hasStudiedToday = useMemo(() => {
    return sessions.some(s => s.date === today) || profile.lastStudyDate === today;
  }, [sessions, profile.lastStudyDate, today]);

  const fullTests = useMemo(
    () => sessions.filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0),
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
    return [...fullTests]
      .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))
      .map(session => {
        const attemptNumber = attemptMap[session.id]?.attemptNumber || session.attemptNumber || 1;
        return {
          id: session.id,
          date: formatShortDate(session.date),
          name: session.testName,
          total: session.totalScore || 0,
          listening: session.scaledListening || 0,
          reading: session.scaledReading || 0,
          attemptNumber,
          isRetest: attemptNumber > 1
        };
      });
  }, [fullTests, attemptMap]);

  // "Lần đầu" loại các lượt làm lại - điểm làm lại đề cũ bị thổi phồng vì nhớ đáp án
  const chartData = useMemo(
    () => (chartFilter === 'FIRST' ? allChartData.filter(d => !d.isRetest) : allChartData),
    [allChartData, chartFilter]
  );

  const stats = useMemo(() => {
    if (allChartData.length === 0) return null;
    const first = allChartData[0];
    const latest = allChartData[allChartData.length - 1];
    return {
      latest,
      diff: latest.total - first.total,
      totalTests: allChartData.length
    };
  }, [allChartData]);

  // Trục Y bám theo dải điểm thực tế, trần là mục tiêu của người dùng
  const yAxisConfig = useMemo(() => {
    if (chartData.length === 0) {
      const floor = Math.max(200, Math.min(400, targetScore - 400));
      const ticks: number[] = [];
      for (let t = floor; t < targetScore; t += 100) ticks.push(t);
      ticks.push(targetScore);
      return { domain: [floor, targetScore] as [number, number], ticks };
    }
    const minScore = Math.min(...chartData.map(d => d.total));
    const maxScore = Math.max(...chartData.map(d => d.total));

    let floor = Math.floor((minScore - 25) / 50) * 50;
    floor = Math.max(200, Math.min(floor, 850));
    let ceiling = Math.max(targetScore, Math.ceil((maxScore + 25) / 50) * 50);
    ceiling = Math.min(990, ceiling);

    const step = ceiling - floor > 350 ? 100 : 50;
    const ticks: number[] = [];
    for (let s = floor; s < ceiling; s += step) ticks.push(s);
    if (!ticks.includes(ceiling)) ticks.push(ceiling);
    return { domain: [floor, ceiling] as [number, number], ticks };
  }, [chartData, targetScore]);

  // 7 ngày trong tuần, chỉ tô những ngày THỰC SỰ có buổi học được ghi
  const weekDays = useMemo(() => {
    const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const now = new Date(`${today}T00:00:00`);
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));

    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const studiedDates = new Set(sessions.map(s => s.date));
    if (profile.lastStudyDate) studiedDates.add(profile.lastStudyDate);

    return labels.map((label, index) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + index);
      const iso = toIso(d);
      return {
        label,
        isCompleted: studiedDates.has(iso),
        isCurrent: iso === today,
        isMissed: iso < today && !studiedDates.has(iso)
      };
    });
  }, [sessions, profile.lastStudyDate, today]);

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 4),
    [sessions]
  );

  // Kỹ năng HIỆN TẠI lấy từ bài Full Test gần nhất, không phải bài cao nhất
  const latestTest = stats ? fullTests.find(s => s.id === stats.latest.id) || bestTest : bestTest;
  const listeningScore = latestTest?.scaledListening || 0;
  const readingScore = latestTest?.scaledReading || 0;
  const weakerSkill = listeningScore < readingScore ? 'Listening' : 'Reading';
  const latestGap = Math.max(0, targetScore - (latestTest?.totalScore || 0));

  const diff = stats?.diff ?? 0;

  const todayLabel = new Date(`${today}T00:00:00`).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  /**
   * Dải bốn chỉ số. Nền chung một tông, màu nằm ở CON SỐ và mỗi số một màu
   * theo nghĩa: điểm xanh dương, tiến bộ xanh lá (đỏ khi giảm), mục tiêu
   * trung tính, chuỗi học cam - cùng tông với thẻ Nhịp học bên phải.
   */
  const kpis: { label: string; value: string | number; suffix?: string; note: string; color: string; icon?: React.ReactNode }[] = [
    {
      label: 'Điểm gần nhất',
      value: stats?.latest.total || 0,
      suffix: `/ ${targetScore}`,
      note: stats?.latest.name || 'Chưa có đề nào',
      color: 'text-blue-700 dark:text-blue-300'
    },
    {
      label: 'Tiến bộ',
      value: stats && stats.totalTests > 1 ? `${diff > 0 ? '+' : ''}${diff}` : '—',
      note: 'so với bài đầu tiên',
      color: diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
    },
    {
      label: 'Mục tiêu',
      value: targetScore,
      note: pointsRemaining > 0 ? `Còn ${pointsRemaining} điểm` : 'Đã đạt',
      color: 'text-slate-900 dark:text-white'
    },
    {
      label: 'Chuỗi học',
      value: `${profile.currentStreak} ngày`,
      note: hasStudiedToday ? 'Đã học hôm nay' : 'Giữ nhịp mỗi ngày',
      color: 'text-orange-600 dark:text-orange-400',
      icon: <Flame className="w-4 h-4 text-orange-500 fill-orange-400 shrink-0" />
    }
  ];

  return (
    <div className="w-full space-y-4 sm:space-y-5 animate-fade-in">
      {relapseSlot}

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
          Mỗi ngày, gần mục tiêu hơn.
        </h1>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 first-letter:uppercase">
          {todayLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-5 items-start">

        {/* ================= CỘT TRÁI ================= */}
        <div className="xl:col-span-8 space-y-4 sm:space-y-5 min-w-0">

          {/* 1. DẢI CHỈ SỐ - một thẻ, bốn ô ngăn bằng vạch; màu nằm ở CON SỐ */}
          <div className={`${CARD} ${TINT.violet} !p-0 grid grid-cols-2 lg:grid-cols-4`}>
            {kpis.map((k, i) => (
              <div
                key={k.label}
                className={`p-4 sm:p-5 min-w-0 border-violet-200/70 dark:border-violet-900/40 ${
                  i % 2 === 1 ? 'border-l' : ''
                } ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
              >
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{k.label}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className={`text-3xl font-black tabular-nums leading-none ${k.color}`}>{k.value}</span>
                  {k.suffix && <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">{k.suffix}</span>}
                </div>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400 truncate flex items-center gap-1" title={k.note}>
                  {k.icon}
                  <span className="truncate">{k.note}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 3. BIỂU ĐỒ TIẾN BỘ */}
          <div className={`${CARD} ${TINT.sky} space-y-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Tiến bộ qua từng bài thi
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Điểm quy đổi · các bài Full Test</p>
              </div>
              <div className="inline-flex p-1 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-sky-200/70 dark:border-slate-700" role="tablist">
                {([['ALL', 'Tất cả'], ['FIRST', 'Lần đầu']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={chartFilter === key}
                    onClick={() => setChartFilter(key)}
                    className={`px-3 py-1 rounded-lg text-sm font-semibold transition cursor-pointer ${
                      chartFilter === key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[260px] sm:h-[280px] w-full rounded-xl bg-white/70 dark:bg-slate-900/40 pt-3 pr-1">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 24, right: 24, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={isDark ? 0.3 : 0.16} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={isDark ? '#334155' : '#E2E8F0'}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: isDark ? '#CBD5E1' : '#475569', fontWeight: 600 }}
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
                      tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="p-3 rounded-xl bg-slate-900/95 text-white shadow-xl border border-slate-700 text-sm space-y-1">
                            <div className="text-xs text-slate-300 font-semibold">
                              {label} · {d.name || 'Đề ETS'}{d.isRetest ? ` · Lần ${d.attemptNumber}` : ''}
                            </div>
                            <div className="font-black text-blue-300 tabular-nums">{d.total}đ</div>
                            {(d.listening > 0 || d.reading > 0) && (
                              <div className="text-xs text-slate-300">L {d.listening} · R {d.reading}</div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      y={targetScore}
                      stroke={isDark ? '#60A5FA' : '#93C5FD'}
                      strokeDasharray="6 3"
                      label={{
                        value: `Mục tiêu ${targetScore}`,
                        position: 'insideBottomRight',
                        fontSize: 12,
                        fontWeight: 600,
                        fill: isDark ? '#93C5FD' : '#2563EB'
                      }}
                    />
                    <Area
                      type="linear"
                      dataKey="total"
                      stroke="#2563EB"
                      strokeWidth={2.5}
                      fill="url(#scoreFill)"
                      // Recharts chỉ vẽ chấm (và số điểm) SAU khi hiệu ứng đường kết thúc;
                      // trong trình duyệt nhúng hiệu ứng có lúc không bao giờ kết thúc,
                      // khiến số điểm biến mất. Số điểm là thông tin chính nên tắt hiệu ứng.
                      isAnimationActive={false}
                      // Số điểm ghi ngay trên từng chấm; chấm mới nhất tô đặc
                      // để mắt tìm ra "bây giờ" mà không cần rê chuột.
                      dot={(props: any) => {
                        const { cx, cy, payload, index } = props;
                        if (!cx || !cy) return <g key={props?.key || 'empty'} />;
                        const isLast = index === chartData.length - 1;
                        return (
                          <g key={`dot-${payload?.id || cx}`}>
                            <text
                              x={cx}
                              y={cy - 12}
                              textAnchor="middle"
                              fontSize={12}
                              fontWeight={700}
                              fill={isDark ? '#E2E8F0' : '#1E293B'}
                            >
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
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-4">
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {allChartData.length > 0 ? 'Chưa có đề nào làm lần đầu' : 'Chưa có kết quả Full Test nào'}
                  </p>
                  {allChartData.length === 0 && (
                    <button
                      onClick={onOpenSessionLogger}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl btn-linear-primary text-sm cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Nhập điểm đề đầu tiên
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={onNavigateToAnalytics}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 cursor-pointer"
              >
                Xem phân tích chi tiết
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

        {/* ================= CỘT PHẢI ================= */}
        <div className="xl:col-span-4 space-y-4 sm:space-y-5 min-w-0">

          {/* 5. NHỊP HỌC TUẦN NÀY */}
          <div className={`${CARD} ${TINT.amber} space-y-4`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Nhịp học tuần này</h2>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-amber-200 dark:border-amber-900/50 text-sm font-bold text-amber-700 dark:text-amber-300 shrink-0"
                title="Chuỗi ngày học liên tục"
              >
                <Flame className="w-4 h-4 text-orange-500 fill-orange-400 shrink-0" />
                {profile.currentStreak} ngày
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">
                <span className="text-xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
                  {weekDays.filter(d => d.isCompleted).length}
                </span>
                <span className="font-semibold"> / 7 ngày</span>
              </span>
              <span className={`text-sm font-semibold ${
                hasStudiedToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {hasStudiedToday ? 'Đã học hôm nay' : 'Hôm nay chưa học'}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(d => (
                <div key={d.label} className="flex flex-col items-center gap-1.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      d.isCompleted
                        ? 'bg-amber-500 text-white'
                        : d.isCurrent
                        ? 'bg-white dark:bg-slate-900 border-2 border-dashed border-amber-500'
                        : d.isMissed
                        ? 'bg-white/60 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-slate-700'
                        : 'bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {d.isCompleted && <CheckCircle2 className="w-4 h-4" />}
                    {!d.isCompleted && d.isCurrent && <Flame className="w-4 h-4 text-amber-500" />}
                  </div>
                  <span className={`text-xs font-semibold ${
                    d.isCurrent ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-amber-200/70 dark:border-amber-900/40 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Mục tiêu mỗi ngày</span>
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                {profile.dailyMinGoalMinutes || 30} phút
              </span>
            </div>
          </div>

          {/* 6. KỸ NĂNG HIỆN TẠI.
              Màu thanh là DANH TÍNH kỹ năng và không đổi theo trạng thái:
              Listening xanh dương, Reading cam (ΔE 30 với người mù màu đỏ-lục). */}
          <div className={`${CARD} ${TINT.split} space-y-5`}>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Kỹ năng hiện tại</h2>

            {[
              { icon: Headphones, label: 'Listening', score: listeningScore, bar: 'bg-blue-500 dark:bg-blue-400', iconColor: 'text-blue-600 dark:text-blue-400', iconBox: 'bg-blue-100/80 border-blue-200 dark:bg-blue-950/50 dark:border-blue-900/60' },
              { icon: BookOpen, label: 'Reading', score: readingScore, bar: 'bg-orange-500 dark:bg-orange-400', iconColor: 'text-orange-600 dark:text-orange-400', iconBox: 'bg-orange-100/80 border-orange-200 dark:bg-orange-950/50 dark:border-orange-900/60' }
            ].map(item => {
              const percent = Math.min(100, Math.round((item.score / 495) * 100));
              return (
                <div key={item.label} className="flex items-center gap-3.5">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${item.iconBox}`}>
                    <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.label}</div>
                    <div className="flex items-baseline justify-between gap-2 mt-0.5">
                      <span className="flex items-baseline gap-1">
                        <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums leading-none">{item.score}</span>
                        <span className="text-sm text-slate-400 dark:text-slate-500">/ 495</span>
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${
                        percent >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
                      }`}>
                        {percent}%
                      </span>
                    </div>
                    <div className="mt-2 w-full h-2 rounded-full bg-white dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${item.bar}`}
                        style={{ width: `${Math.max(2, percent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {latestTest && (
              <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200">
                <Target className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="min-w-0">
                  {latestGap > 0 ? (
                    <>Còn <span className="font-bold">{latestGap} điểm</span> để chạm mục tiêu — ưu tiên {weakerSkill}.</>
                  ) : (
                    <>Bài gần nhất đã chạm mục tiêu {targetScore}.</>
                  )}
                </span>
              </div>
            )}

            <button
              onClick={onNavigateToAnalytics}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 cursor-pointer"
            >
              Xem điểm cần cải thiện
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 8. BUỔI HỌC GẦN ĐÂY - trải hết chiều ngang, dưới cả hai cột */}
      <div className={`${CARD} ${TINT.teal}`}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Buổi học gần đây</h2>
          <button
            onClick={onNavigateToAnalytics}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 cursor-pointer shrink-0"
          >
            Xem lịch sử
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {recentSessions.length === 0 ? (
          <p className="py-4 text-sm text-slate-500 dark:text-slate-400">Chưa có buổi học nào được ghi.</p>
        ) : (
          <div className="rounded-xl bg-white/80 dark:bg-slate-900/50 border border-teal-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className="col-span-6">Đề thi</span>
              <span className="col-span-2">Ngày</span>
              <span className="col-span-2">Kết quả</span>
              <span className="col-span-2 text-right">Thời gian</span>
            </div>
            {recentSessions.map(s => {
              const attempt = attemptMap[s.id]?.attemptNumber || s.attemptNumber || 1;
              const parts = s.sessionType === 'PART_PRACTICE' ? getPracticeParts(s) : [];
              let result: string;
              if (s.sessionType === 'FULL_TEST') {
                result = `${s.totalScore || 0}đ`;
              } else {
                const acc = getPracticeAccuracy(parts);
                result = acc !== null ? `${acc}%` : '—';
              }
              const title = s.testName ||
                (s.sessionType === 'PART_PRACTICE'
                  ? `Luyện Part ${parts.map(p => p.part).join(', ') || 'lẻ'}`
                  : 'Full Test');
              return (
                <div key={s.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center text-sm">
                  <div className="col-span-8 sm:col-span-6 min-w-0 flex items-center gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</span>
                    {s.sessionType === 'FULL_TEST' && attempt > 1 && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold shrink-0">
                        Lần {attempt}
                      </span>
                    )}
                  </div>
                  <span className="hidden sm:block col-span-2 text-slate-600 dark:text-slate-300 tabular-nums">
                    {formatShortDate(s.date)}
                  </span>
                  <span className="col-span-4 sm:col-span-2 text-right sm:text-left font-bold text-slate-900 dark:text-white tabular-nums">
                    {result}
                    <span className="sm:hidden block text-xs font-medium text-slate-500 dark:text-slate-400">
                      {formatShortDate(s.date)}
                    </span>
                  </span>
                  <span className="hidden sm:block col-span-2 text-right text-slate-600 dark:text-slate-300 tabular-nums">
                    {s.durationMinutes} phút
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
