import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Flame,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  Headphones,
  Target,
  PlusCircle,
  Gauge,
  TrendingUp,
  TrendingDown
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
 * Một bề mặt thẻ cho cả trang: nền trắng, viền mảnh, bóng nhẹ. Thẻ tách
 * khỏi nền trang nhờ nền trang đậm hơn (App.tsx), KHÔNG nhờ tô màu thẻ -
 * mỗi thẻ một màu nền đã thử và bị chê chói, rời rạc.
 * Ngoại lệ duy nhất: thẻ Chuỗi Ngày Học giữ nền hổ phách (người dùng chọn).
 * Màu chỉ mang nghĩa: xanh dương = điểm / biểu đồ / hành động chính,
 * cyan = Listening, tím = Reading, xanh lá / đỏ = tăng / giảm.
 */
const CARD =
  'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)] dark:bg-[#111A2C] dark:border-slate-800 dark:shadow-none';

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
      first,
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

  // Kỹ năng HIỆN TẠI lấy từ bài Full Test gần nhất, không phải bài cao nhất
  const latestTest = stats ? fullTests.find(s => s.id === stats.latest.id) || bestTest : bestTest;
  const listeningScore = latestTest?.scaledListening || 0;
  const readingScore = latestTest?.scaledReading || 0;

  // Một dòng gợi ý: còn bao nhiêu điểm tới mục tiêu và nên dồn sức vào kỹ năng nào
  const skillHint = useMemo(() => {
    if (!latestTest) return null;
    const gap = targetScore - (latestTest.totalScore || 0);
    if (gap <= 0) return `Bài gần nhất đã chạm mục tiêu ${targetScore}.`;
    const weaker = listeningScore < readingScore ? 'Listening' : 'Reading';
    const otherMaxed = Math.max(listeningScore, readingScore) >= 495;
    return otherMaxed
      ? `Còn ${gap} điểm ở ${weaker} để chạm mục tiêu.`
      : `Còn ${gap} điểm để chạm mục tiêu — ưu tiên ${weaker}.`;
  }, [latestTest, targetScore, listeningScore, readingScore]);

  /**
   * Khớp màn hình (≥ xl): lưới hai cột cao đúng bằng phần còn lại của khung
   * nhìn SAU KHI trừ footer, để cả mép dưới hai thẻ lẫn thanh footer đều
   * nằm trong màn hình khi vừa mở trang; biểu đồ co giãn lấp phần chênh.
   * Chỗ trống dưới 440px thì thôi khớp, để nội dung không bị ép bẹp.
   * Đã thử: chỉ trừ đệm 20px và quên footer - footer bị đẩy khỏi màn hình,
   * và trên máy phóng to 125% (khung nhìn ~730px) thẻ vẫn bị khuất.
   */
  const gridRef = useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const mq = window.matchMedia('(min-width: 1280px)');
    const update = () => {
      if (!mq.matches) {
        setFitHeight(undefined);
        return;
      }
      const top = grid.getBoundingClientRect().top + window.scrollY;
      // Phần nằm dưới lưới: đệm dưới của <main> + footer của App
      const main = grid.closest('main');
      const mainPad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const footer = document.querySelector('footer');
      const footerH = footer ? footer.getBoundingClientRect().height : 0;
      setFitHeight(Math.max(440, Math.floor(window.innerHeight - top - mainPad - footerH)));
    };
    update();
    // Cảnh báo tái phạm mở/đóng làm lưới dịch xuống/lên - đo lại khi phần trên đổi cỡ
    const ro = new ResizeObserver(update);
    if (grid.parentElement) ro.observe(grid.parentElement);
    window.addEventListener('resize', update);
    mq.addEventListener('change', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
    };
  }, []);

  const diff = stats?.diff ?? 0;

  const todayLabel = new Date(`${today}T00:00:00`).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  /**
   * Dải bốn chỉ số. Mỗi ô một màu riêng, dùng cho ô icon, con số và nhãn
   * ghi chú. Bộ màu chọn bằng đo ΔE (OKLab): mọi cặp màu trên trang cách
   * nhau ≥ 16 với mắt thường - điểm xanh dương, tiến bộ xanh lá (đỏ khi
   * giảm), mục tiêu hồng, chuỗi học hổ phách (cùng tông thẻ Chuỗi Ngày Học).
   */
  const isUp = diff >= 0;
  const kpis: {
    label: string;
    value: string | number;
    suffix?: string;
    note: string;
    icon: React.ElementType;
    number: string;
    badge: string;
    pill: string;
  }[] = [
    {
      label: 'Điểm gần nhất',
      value: stats?.latest.total || 0,
      suffix: `/ ${targetScore}`,
      note: stats?.latest.name || 'Chưa có đề nào',
      icon: Gauge,
      number: 'text-blue-600 dark:text-blue-400',
      badge: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
      pill: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
    },
    {
      label: 'Tiến bộ',
      value: stats && stats.totalTests > 1 ? `${diff > 0 ? '+' : ''}${diff}` : '—',
      note: stats && stats.totalTests > 1 ? `${stats.first.total} → ${stats.latest.total}` : 'Cần từ 2 đề',
      icon: isUp ? TrendingUp : TrendingDown,
      number: isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
      badge: isUp
        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
      pill: isUp
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
    },
    {
      label: 'Mục tiêu',
      value: targetScore,
      note: pointsRemaining > 0 ? `Còn ${pointsRemaining} điểm` : 'Đã đạt',
      icon: Target,
      number: 'text-pink-600 dark:text-pink-400',
      badge: 'bg-pink-50 text-pink-600 dark:bg-pink-950/60 dark:text-pink-400',
      pill: 'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300'
    },
    {
      label: 'Chuỗi học',
      value: `${profile.currentStreak} ngày`,
      note: hasStudiedToday ? 'Đã học hôm nay' : 'Chưa học hôm nay',
      icon: Flame,
      number: 'text-amber-600 dark:text-amber-400',
      badge: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
      pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
    }
  ];

  return (
    <div className="w-full space-y-4 animate-fade-in">
      {relapseSlot}

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Mỗi ngày, gần mục tiêu hơn.
        </h1>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 first-letter:uppercase">
          {todayLabel}
        </span>
      </div>

      <div
        ref={gridRef}
        className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch"
        style={fitHeight ? { minHeight: fitHeight } : undefined}
      >

        {/* ================= CỘT TRÁI ================= */}
        <div className="xl:col-span-8 flex flex-col gap-4 min-w-0">

          {/* 1. DẢI CHỈ SỐ - một thẻ, bốn ô ngăn bằng vạch; màu nằm ở CON SỐ */}
          <div className={`${CARD} !p-0 grid grid-cols-2 lg:grid-cols-4`}>
            {kpis.map((k, i) => (
              <div
                key={k.label}
                className={`px-3 py-3.5 2xl:px-5 min-w-0 border-slate-100 dark:border-slate-800 ${
                  i % 2 === 1 ? 'border-l' : ''
                } ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${k.badge}`}>
                    <k.icon className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-semibold leading-tight text-slate-600 dark:text-slate-300 min-w-0">{k.label}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`text-[28px] font-black tabular-nums leading-none ${k.number}`}>{k.value}</span>
                  {k.suffix && <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">{k.suffix}</span>}
                </div>
                <span
                  className={`mt-2 inline-block max-w-full truncate px-2 py-0.5 rounded-md text-xs font-semibold ${k.pill}`}
                  title={k.note}
                >
                  {k.note}
                </span>
              </div>
            ))}
          </div>

          {/* 3. BIỂU ĐỒ TIẾN BỘ */}
          <div className={`${CARD} flex-1 flex flex-col gap-4`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Tiến bộ qua từng bài thi
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Điểm quy đổi · các bài Full Test</p>
              </div>
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80" role="tablist">
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

            <div className="relative w-full h-[260px] sm:h-[300px] xl:h-auto xl:flex-1 xl:min-h-[190px]">
              <div className="absolute inset-0">
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
        <div className="xl:col-span-4 flex flex-col gap-4 min-w-0">

          {/* 5. CHUỖI NGÀY HỌC.
              Thẻ duy nhất giữ nền màu: tông hổ phách là danh tính của thói quen
              học, người dùng chọn giữ lại thiết kế này. */}
          <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-gradient-to-br from-amber-50 via-orange-50/50 to-amber-50/40 dark:from-[#1C1814] dark:to-[#14100C] p-4 space-y-3 shadow-[0_2px_12px_rgba(245,158,11,0.06)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-400 text-white shadow-sm shadow-orange-500/30 flex items-center justify-center shrink-0">
                  <Flame className="w-[18px] h-[18px] fill-white" />
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">Chuỗi Ngày Học</h2>
              </div>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-100/90 dark:bg-amber-950/80 border border-amber-300/80 dark:border-amber-700 shrink-0"
                title="Số ngày học liên tục"
              >
                <span className="text-xl font-black text-amber-950 dark:text-amber-200 tabular-nums leading-none">
                  {profile.currentStreak}
                </span>
                <Flame className="w-4 h-4 text-red-600 fill-orange-500" />
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white/95 dark:bg-slate-900/90 border border-amber-200/60 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                  Tuần này:{' '}
                  <span className="text-amber-600 dark:text-amber-400 font-black">
                    {weekDays.filter(d => d.isCompleted).length}/7
                  </span>
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold whitespace-nowrap ${
                  hasStudiedToday
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/80 text-amber-700 dark:text-amber-300'
                }`}>
                  {hasStudiedToday && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {hasStudiedToday ? 'Đã học hôm nay' : 'Chưa học hôm nay'}
                </span>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {weekDays.map(d => (
                  <div key={d.label} className="flex flex-col items-center gap-1.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        d.isCompleted
                          ? `bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm shadow-orange-500/25 ${
                              d.isCurrent ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : ''
                            }`
                          : d.isCurrent
                          ? 'bg-amber-50 border-2 border-dashed border-amber-400 dark:bg-amber-950/70 dark:border-amber-500'
                          : d.isMissed
                          ? 'bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700'
                          : 'bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700'
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
                    <span className={`text-xs font-bold ${
                      d.isCurrent
                        ? 'text-amber-600 dark:text-amber-400'
                        : d.isCompleted
                        ? 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6. KỸ NĂNG HIỆN TẠI - theo mẫu người dùng đưa.
              Màu là DANH TÍNH kỹ năng, không đổi theo trạng thái:
              Listening chàm, Reading xanh ngọc (người dùng chọn theo mẫu).
              Độ chính xác từng Part đã thử đặt ở đây và gỡ: trùng với Phân Tích. */}
          <div className={`${CARD} flex-1 flex flex-col gap-3`}>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Kỹ năng hiện tại</h2>

            {[
              { icon: Headphones, label: 'Listening', score: listeningScore, bar: 'bg-indigo-600 dark:bg-indigo-400', iconColor: 'text-indigo-600 dark:text-indigo-400', iconBox: 'bg-indigo-50 border-indigo-100 dark:bg-indigo-950/50 dark:border-indigo-900/60' },
              { icon: BookOpen, label: 'Reading', score: readingScore, bar: 'bg-teal-600 dark:bg-teal-400', iconColor: 'text-teal-600 dark:text-teal-400', iconBox: 'bg-teal-50 border-teal-100 dark:bg-teal-950/50 dark:border-teal-900/60' }
            ].map(item => {
              const percent = Math.min(100, Math.round((item.score / 495) * 100));
              return (
                <div key={item.label} className="flex items-center gap-3.5">
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${item.iconBox}`}>
                    <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.label}</div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-baseline gap-1">
                        <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums leading-tight">{item.score}</span>
                        <span className="text-sm text-slate-400 dark:text-slate-500">/ 495</span>
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${
                        percent >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
                      }`}>
                        {percent}%
                      </span>
                    </div>
                    <div className="mt-1.5 w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${item.bar}`}
                        style={{ width: `${Math.max(2, percent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {skillHint && (
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
                <Target className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="min-w-0">{skillHint}</span>
              </div>
            )}

            <button
              onClick={onNavigateToAnalytics}
              className="mt-auto self-start inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 cursor-pointer"
            >
              Xem điểm cần cải thiện
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
