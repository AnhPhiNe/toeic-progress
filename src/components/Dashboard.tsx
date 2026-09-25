import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Flame,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  Headphones,
  Target,
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
import { StudySession, UserProfile } from '../types';
import { getTodayDateString, computeSessionAttemptMap } from '../utils/storage';
import { CARD } from './surfaces';

interface DashboardProps {
  /** Cảnh báo tái phạm, đặt ngay đầu trang khi có (SPEC mục 4.6) */
  relapseSlot?: React.ReactNode;
  profile: UserProfile;
  sessions: StudySession[];
  theme: 'light' | 'dark';
  onOpenSessionLogger: () => void;
  onNavigateToAnalytics: () => void;
}

// Bề mặt thẻ dùng chung với các màn hình khác (xem surfaces.ts)

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

    const ceiling = Math.min(990, Math.max(targetScore, Math.ceil((maxScore + 25) / 50) * 50));
    const range = ceiling - minScore;

    // Dải điểm rộng (>= 180đ): Bước nhảy 100đ tròn trịa (700, 800, 900, 990)
    // Dải điểm hẹp (< 180đ): Bước nhảy 50đ mượt mà
    let floor: number;
    let step: number;

    if (range >= 180) {
      floor = Math.max(100, Math.floor((minScore - 30) / 100) * 100);
      step = 100;
    } else {
      floor = Math.max(200, Math.floor((minScore - 25) / 50) * 50);
      step = 50;
    }

    const ticks: number[] = [];
    for (let s = floor; s < ceiling; s += step) {
      // Tránh tick quá gần trần (ví dụ 950 ngay sát 990 chỉ cách 40đ)
      if (ceiling - s < (step === 100 ? 50 : 35)) continue;
      ticks.push(s);
    }
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

  // Chiến lược trọng tâm dựa trên điểm số thực tế
  const skillStrategy = useMemo(() => {
    if (!latestTest) return null;
    const total = latestTest.totalScore || 0;
    const gap = targetScore - total;
    if (gap <= 0) {
      return {
        title: 'Đã chạm mục tiêu:',
        text: `Tuyệt vời! Bạn đã đạt ${total}/${targetScore} điểm. Tiếp tục duy trì nhịp làm đề để giữ vững phong độ đỉnh cao.`
      };
    }
    if (listeningScore >= 495) {
      return {
        title: `Chiến lược chạm mốc ${targetScore}:`,
        text: `Listening đã đạt tuyệt đối (495/495). Bạn chỉ cần cải thiện thêm ${gap} điểm ở Reading (khoảng ${Math.ceil(gap / 8)}–${Math.ceil(gap / 6)} câu) để cán đích.`
      };
    }
    if (readingScore >= 495) {
      return {
        title: `Chiến lược chạm mốc ${targetScore}:`,
        text: `Reading đã đạt tuyệt đối (495/495). Bạn chỉ cần cải thiện thêm ${gap} điểm ở Listening (khoảng ${Math.ceil(gap / 8)}–${Math.ceil(gap / 6)} câu) để cán đích.`
      };
    }
    if (listeningScore > readingScore) {
      return {
        title: `Ưu tiên bứt phá:`,
        text: `Listening đang chiếm ưu thế (${listeningScore} so với Reading ${readingScore}). Tăng tốc cải thiện Reading sẽ giúp bạn thu hẹp ${gap} điểm nhanh nhất.`
      };
    }
    return {
      title: `Ưu tiên bứt phá:`,
      text: `Reading đang nhỉnh hơn (${readingScore} so với Listening ${listeningScore}). Luyện phản xạ Listening Part 3 & 4 để bù ${gap} điểm tới mục tiêu.`
    };
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
      const main = grid.closest('main');
      const mainPadBottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 32;
      // Đo chiều cao khả dụng từ đỉnh lưới đến đáy đệm của main để lấp đầy màn hình, đều đặn 32px trên và dưới
      const available = window.innerHeight - top - mainPadBottom;
      // Khống chế chiều cao grid tối thiểu 380px, tối đa 680px (trên màn siêu lớn)
      setFitHeight(Math.max(380, Math.min(680, Math.floor(available))));
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

  /**
   * Dải 3 chỉ số trọng tâm theo Phương Án 2: Kỷ Lục & Xu Hướng (Điểm Cao Nhất, Điểm Mới Nhất, Đà Tiến Bộ)
   * Chuẩn thiết kế Neo Metric Bar đồng bộ 100% màu sắc với trang Kế Hoạch.
   */
  const kpis = useMemo(() => {
    const hasDiff = Boolean(stats && stats.totalTests > 1);
    const highestPercent = targetScore > 0 ? Math.min(100, Math.round(((highestScore || 0) / targetScore) * 100)) : 0;
    const latestScore = stats?.latest.total || 0;
    const latestPercent = targetScore > 0 ? Math.min(100, Math.round((latestScore / targetScore) * 100)) : 0;
    const latestGap = targetScore - latestScore;

    return [
      {
        id: 'highest',
        label: 'Điểm cao nhất',
        topChip: highestScore >= targetScore && targetScore > 0
          ? 'ĐẠT ĐÍCH 🏆'
          : highestScore > 0
          ? `${highestPercent}% ĐÍCH`
          : 'CHƯA THI',
        topChipStyle: highestScore >= targetScore && targetScore > 0
          ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
          : highestScore > 0
          ? 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        value: highestScore || 0,
        suffix: targetScore ? `/ ${targetScore}đ` : 'đ',
        accentBar: 'bg-amber-500',
        barColor: 'bg-amber-500', // ĐỒNG BỘ 100% HỔ PHÁCH
        number: 'text-amber-600 dark:text-amber-400',
        progressPercent: highestPercent,
        note: bestTest ? (bestTest.testName || 'Kỷ lục cá nhân') : 'Chưa có bài thi nào',
        subText: highestScore >= targetScore && targetScore > 0
          ? 'Cán đích 🎉'
          : pointsRemaining > 0
          ? `Cách ${pointsRemaining}đ`
          : 'Kỷ lục 🏆',
        statusColor: highestScore >= targetScore && targetScore > 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-amber-600 dark:text-amber-400'
      },
      {
        id: 'latest',
        label: 'Điểm mới nhất',
        topChip: latestScore >= targetScore && targetScore > 0
          ? 'CÁN ĐÍCH 🎯'
          : latestScore > 0
          ? `${latestPercent}% ĐÍCH`
          : 'CHƯA THI',
        topChipStyle: latestScore >= targetScore && targetScore > 0
          ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
          : latestScore > 0
          ? 'bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        value: latestScore,
        suffix: targetScore ? `/ ${targetScore}đ` : 'đ',
        accentBar: 'bg-blue-500',
        barColor: 'bg-blue-500', // ĐỒNG BỘ 100% XANH DƯƠNG
        number: 'text-blue-600 dark:text-blue-400',
        progressPercent: latestPercent,
        note: stats?.latest.name || 'Chưa làm đề nào',
        subText: latestScore > 0
          ? (latestGap <= 0 ? 'Đạt mục tiêu 🎉' : `Cách ${latestGap}đ`)
          : 'Chờ thi',
        statusColor: latestScore > 0 && latestGap <= 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-blue-600 dark:text-blue-400'
      },
      {
        id: 'progress',
        label: 'Đà tiến bộ',
        topChip: !hasDiff
          ? 'CHỜ THI'
          : diff > 0
          ? 'BỨT PHÁ ⭐'
          : diff < 0
          ? 'CẦN ÔN ⚠️'
          : 'GIỮ VỮNG',
        topChipStyle: !hasDiff
          ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
          : diff >= 0
          ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
          : 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
        value: hasDiff ? `${diff > 0 ? '+' : ''}${diff}` : '—',
        suffix: hasDiff ? 'điểm' : undefined,
        accentBar: diff >= 0 ? 'bg-emerald-500' : 'bg-rose-500',
        barColor: diff >= 0 ? 'bg-emerald-500' : 'bg-rose-500', // ĐỒNG BỘ 100% XANH LÁ HOẶC ĐỎ HỒNG
        number: diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        progressPercent: !hasDiff
          ? 0
          : Math.min(100, Math.max(12, Math.round((Math.abs(diff) / 200) * 100))),
        note: hasDiff && stats
          ? `${stats.first.total}đ ➔ ${stats.latest.total}đ`
          : stats?.totalTests === 1
          ? 'Mới thi 1 đề'
          : 'Cần từ 2 đề',
        subText: hasDiff
          ? (diff > 0 ? 'Tăng liên tục 🚀' : diff < 0 ? 'Cần ôn bẫy' : 'Phong độ ổn định')
          : 'Chờ đề thứ 2',
        statusColor: !hasDiff
          ? 'text-slate-500 dark:text-slate-400'
          : diff >= 0
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-rose-600 dark:text-rose-400'
      }
    ];
  }, [stats, highestScore, targetScore, pointsRemaining, bestTest, diff]);

  return (
    <div className="w-full space-y-3 sm:space-y-3.5 animate-fade-in">
      {relapseSlot}

      <div
        ref={gridRef}
        className="grid grid-cols-1 xl:grid-cols-12 gap-5 xl:gap-6 items-stretch"
        style={fitHeight ? { minHeight: fitHeight } : undefined}
      >

        {/* ================= CỘT TRÁI (3 KPI Compact Slim & Biểu đồ tiến độ) ================= */}
        <div className="xl:col-span-8 flex flex-col gap-3 sm:gap-3.5 min-w-0">

          {/* 1. DẢI 3 THẺ CHỈ SỐ TRỌNG TÂM — COMPACT SLIM (THANH THOÁT, NHƯỜNG KHÔNG GIAN CHO BIỂU ĐỒ) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
            {kpis.map((k) => (
              <div
                key={k.id}
                className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2 sm:py-2.5 shadow-[2px_2px_0px_0px_#0f172a] dark:bg-[#111A2C] dark:border-slate-200 dark:shadow-[2px_2px_0px_0px_#cbd5e1] hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_#0f172a] dark:hover:shadow-[3px_3px_0px_0px_#cbd5e1] transition-all duration-200 relative overflow-hidden flex flex-col justify-between group"
              >
                {/* Vạch màu nhận diện ở đỉnh thẻ */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${k.accentBar}`} />

                <div>
                  {/* Hàng 1: Tiêu đề bên trái + Chip Mini góc phải */}
                  <div className="flex items-center justify-between gap-1.5 mt-0.5">
                    <span className="text-[10.5px] sm:text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      {k.label}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-black border ${k.topChipStyle}`}>
                      {k.topChip}
                    </span>
                  </div>

                  {/* Hàng 2: Con số chính vừa vặn, thanh thoát */}
                  <div className="my-1 flex items-baseline gap-1">
                    <span className={`text-xl sm:text-2xl font-black font-mono tabular-nums leading-none ${k.number}`}>
                      {k.value}
                    </span>
                    {k.suffix && (
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                        {k.suffix}
                      </span>
                    )}
                  </div>

                  {/* Hàng 3: Thanh tiến độ Mini mảnh dẻ (h-1) ĐỒNG BỘ 100% MÀU SẮC */}
                  <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${k.barColor}`}
                      style={{ width: `${Math.max(k.progressPercent > 0 ? 4 : 0, Math.min(100, k.progressPercent))}%` }}
                    />
                  </div>
                </div>

                {/* Hàng 4 (Footer): Ghi chú bên trái + Trạng thái bên phải */}
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1 text-[10px] font-bold">
                  <span className="text-slate-400 dark:text-slate-400 truncate">
                    {k.note}
                  </span>
                  <span className={`shrink-0 font-black ${k.statusColor}`}>
                    {k.subText}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 3. BIỂU ĐỒ TIẾN BỘ */}
          <div className={`${CARD} flex-1 flex flex-col gap-2 p-3 sm:p-3.5`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Tiến bộ qua từng bài thi
              </h2>
              <div className="flex items-center gap-1.5">
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a]" role="tablist">
                  {([['ALL', 'Tất cả'], ['FIRST', 'Lần đầu']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={chartFilter === key}
                      onClick={() => setChartFilter(key)}
                      className={`px-2.5 py-0.5 rounded-md text-xs font-black transition-all cursor-pointer ${
                        chartFilter === key
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 border border-slate-900 shadow-[1px_1px_0px_0px_#0f172a]'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border border-transparent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={onNavigateToAnalytics}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 border-slate-900 bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-[1.5px_1.5px_0px_0px_#0f172a] hover:bg-slate-100 dark:hover:bg-slate-700 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none text-xs font-black transition cursor-pointer"
                  title="Xem phân tích chi tiết"
                >
                  Chi tiết
                  <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                </button>
              </div>
            </div>

            <div className="relative w-full h-[180px] sm:h-[200px] xl:h-auto xl:flex-1 xl:min-h-[160px]">
              <div className="absolute inset-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 20, right: 16, left: -4, bottom: 0 }}>
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
                          <div className="p-3 rounded-xl bg-white dark:bg-[#111A2C] border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] text-sm space-y-1.5 z-30">
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-black flex items-center justify-between gap-3">
                              <span>Ngày {label}</span>
                              {d.isRetest ? (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-slate-900 text-[10px] font-black">
                                  Lần {d.attemptNumber}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-slate-900 text-[10px] font-black">
                                  Lần đầu
                                </span>
                              )}
                            </div>
                            <div className="font-black text-slate-900 dark:text-white text-xs truncate max-w-[200px]">
                              {d.name || 'Đề thi ETS'}
                            </div>
                            <div className="pt-1 border-t-2 border-slate-900/10 dark:border-slate-700 flex items-center justify-between gap-4">
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Tổng điểm:</span>
                              <span className="font-black text-blue-600 dark:text-blue-400 text-base font-mono tabular-nums">
                                {d.total}đ
                              </span>
                            </div>
                            {(d.listening > 0 || d.reading > 0) && (
                              <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
                                <span className="text-indigo-600 dark:text-indigo-400">L: {d.listening}đ</span>
                                <span className="text-teal-600 dark:text-teal-400">R: {d.reading}đ</span>
                              </div>
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
                        position: 'insideBottomLeft',
                        fontSize: 12,
                        fontWeight: 700,
                        fill: isDark ? '#93C5FD' : '#2563EB'
                      }}
                    />
                    <Area
                      type="linear"
                      dataKey="total"
                      stroke="#2563EB"
                      strokeWidth={2.5}
                      fill="url(#scoreFill)"
                      isAnimationActive={false}
                      dot={(props: any) => {
                        const { cx, cy, payload, index } = props;
                        if (!cx || !cy) return <g key={props?.key || 'empty'} />;
                        const isLast = index === chartData.length - 1;
                        const score = payload?.total || 0;
                        const ceiling = yAxisConfig.domain[1];
                        const isNearCeiling = ceiling - score <= 20;
                        return (
                          <g key={`dot-${payload?.id || cx}`}>
                            {isLast && (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={10}
                                fill="#2563EB"
                                opacity={0.25}
                                className="animate-ping"
                              />
                            )}
                            <text
                              x={cx}
                              y={isNearCeiling ? cy + 18 : cy - 12}
                              textAnchor="middle"
                              fontSize={12}
                              fontWeight={800}
                              fill={isDark ? '#F1F5F9' : '#0F172A'}
                            >
                              {payload?.total}
                            </text>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isLast ? 6 : 4}
                              fill={isLast ? '#2563EB' : isDark ? '#0F172A' : '#FFFFFF'}
                              stroke={isLast ? (isDark ? '#93C5FD' : '#0F172A') : '#2563EB'}
                              strokeWidth={2}
                            />
                          </g>
                        );
                      }}
                      activeDot={{ r: 6.5, fill: '#2563EB', stroke: isDark ? '#FFFFFF' : '#0F172A', strokeWidth: 2 }}
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
          </div>

        </div>

        {/* ================= CỘT PHẢI (Tăng khoảng cách giữa các card, giảm kích cỡ chiếm chỗ) ================= */}
        <div className="xl:col-span-4 flex flex-col gap-4 sm:gap-5 min-w-0">

          {/* 5. CHUỖI NGÀY HỌC: Tinh gọn, thoáng đãng, không lồng hộp con */}
          <div className={`${CARD} p-3 sm:p-3.5 space-y-2.5 group hover:-translate-y-0.5 hover:shadow-[3.5px_3.5px_0px_0px_#0f172a] transition-all duration-200`}>
            {/* Header: Flame + Title + Streak Badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] group-hover:scale-105 group-hover:rotate-6 transition-transform duration-200 flex items-center justify-center shrink-0">
                  <Flame className="w-4 h-4 fill-amber-500 stroke-amber-700 animate-flame" />
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">Chuỗi Ngày Học</h2>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-tight">Giữ thói quen mỗi ngày</p>
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl bg-amber-100 dark:bg-amber-950/80 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] text-amber-950 dark:text-amber-200 shrink-0 hover:scale-105 transition-transform"
                title="Số ngày học liên tục"
              >
                <span className="text-base sm:text-lg font-black tabular-nums leading-none">
                  {profile.currentStreak}
                </span>
                <span className="text-xs font-black">ngày 🔥</span>
              </span>
            </div>

            {/* Hàng tuần & Trạng thái hôm nay: Đặt trực tiếp trên mặt card, không bọc trong hộp xám/hổ phách */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Tuần này:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10.5px] font-black">
                  {weekDays.filter(d => d.isCompleted).length}/7 ngày
                </span>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-black transition-transform ${
                hasStudiedToday
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200'
              }`}>
                {hasStudiedToday ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                    Đã học hôm nay 🎉
                  </>
                ) : (
                  <>
                    <Flame className="w-3 h-3 stroke-[2.5] fill-amber-500 text-amber-700" />
                    Chưa học hôm nay
                  </>
                )}
              </span>
            </div>

            {/* 7 ngày: Đặt trực tiếp trên mặt card lớn, thông thoáng */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-0.5">
              {weekDays.map(d => (
                <div key={d.label} className="flex flex-col items-center gap-1 min-w-0">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center transition-all duration-200 cursor-default ${
                      d.isCompleted
                        ? 'bg-amber-200 text-slate-950 dark:bg-amber-300 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] hover:-translate-y-0.5'
                        : d.isCurrent
                        ? 'bg-amber-100 dark:bg-amber-950/80 text-slate-950 border-2 border-dashed border-amber-500 shadow-[1px_1px_0px_0px_#d97706] hover:scale-105'
                        : d.isMissed
                        ? 'bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 opacity-60'
                        : 'bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700'
                    }`}
                    title={`${d.label}: ${d.isCompleted ? 'Đã học' : d.isCurrent ? 'Hôm nay' : 'Chưa học'}`}
                  >
                    {d.isCompleted ? (
                      <span className="text-xs sm:text-sm font-black leading-none text-slate-950">✓</span>
                    ) : d.isCurrent ? (
                      <Flame className="w-3.5 h-3.5 text-amber-600 fill-amber-500/50 animate-bounce" />
                    ) : d.isMissed ? (
                      <span className="w-2 h-[2px] rounded-full bg-slate-400" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    )}
                  </div>
                  <span className={`text-[10px] font-black ${
                    d.isCurrent
                      ? 'text-amber-600 dark:text-amber-400 scale-105'
                      : d.isCompleted
                      ? 'text-slate-900 dark:text-slate-200'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 6. KỸ NĂNG HIỆN TẠI - Chuẩn Neo-Pop: Progress bar retro, nút nổi nảy, callout sticker chiến lược */}
          <div className={`${CARD} p-3 sm:p-3.5 flex-1 flex flex-col justify-between gap-2.5 group hover:-translate-y-0.5 hover:shadow-[3.5px_3.5px_0px_0px_#0f172a] transition-all duration-200`}>
            {/* Header: Icon + Title + Badge đồng bộ phong cách với Streak */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-2 border-slate-900 dark:border-slate-200 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] group-hover:scale-105 group-hover:rotate-6 transition-transform duration-200 flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4 stroke-[2.5]" />
                </span>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">Kỹ Năng Hiện Tại</h2>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 leading-tight truncate">
                    {latestTest ? latestTest.testName : 'Listening & Reading'}
                  </p>
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl bg-blue-100 dark:bg-blue-950/80 border-2 border-slate-900 dark:border-slate-200 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] text-blue-950 dark:text-blue-200 shrink-0 hover:scale-105 transition-transform"
                title="Tổng điểm bài thi gần nhất"
              >
                <span className="text-base sm:text-lg font-black tabular-nums leading-none">
                  {latestTest ? (latestTest.totalScore || listeningScore + readingScore) : 0}
                </span>
                <span className="text-xs font-black">/ 990 🎯</span>
              </span>
            </div>

            {/* 1. KHỐI LISTENING — Punchy Neo-Pop */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/25 border border-slate-200 dark:border-indigo-900/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg bg-indigo-600 text-white border border-slate-900 dark:border-slate-700 shadow-[1px_1px_0px_0px_#0f172a] flex items-center justify-center font-black text-xs shrink-0">
                    <Headphones className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">Listening</span>
                </div>

                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="text-lg sm:text-xl font-black font-mono text-indigo-600 dark:text-indigo-400 leading-none">
                    {listeningScore}
                  </span>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">/ 495đ</span>
                  <span
                    className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-200 text-indigo-950 dark:bg-indigo-900 dark:text-indigo-100 border border-slate-900 dark:border-slate-700 shadow-[1px_1px_0px_0px_#0f172a]"
                    title={latestTest?.rawListening !== undefined ? `${latestTest.rawListening}/100 câu đúng` : undefined}
                  >
                    {latestTest?.rawListening !== undefined
                      ? `${latestTest.rawListening}/100`
                      : listeningScore >= 495 ? 'Max ⭐' : `${Math.round((listeningScore / 495) * 100)}%`}
                  </span>
                </div>
              </div>

              {/* Progress bar Listening: Viền retro game sắc nét */}
              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 border-[1.5px] border-slate-900 dark:border-slate-600 shadow-[1px_1px_0px_0px_#0f172a] dark:shadow-none overflow-hidden p-[0.5px]">
                <div
                  className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-700 ease-out"
                  style={{ width: `${Math.max(3, Math.min(100, Math.round((listeningScore / 495) * 100)))}%` }}
                />
              </div>
            </div>

            {/* 2. KHỐI READING — Punchy Neo-Pop */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/25 border border-slate-200 dark:border-teal-900/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg bg-teal-600 text-white border border-slate-900 dark:border-slate-700 shadow-[1px_1px_0px_0px_#0f172a] flex items-center justify-center font-black text-xs shrink-0">
                    <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">Reading</span>
                </div>

                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="text-lg sm:text-xl font-black font-mono text-teal-600 dark:text-teal-400 leading-none">
                    {readingScore}
                  </span>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">/ 495đ</span>
                  <span
                    className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-teal-200 text-teal-950 dark:bg-teal-900 dark:text-teal-100 border border-slate-900 dark:border-slate-700 shadow-[1px_1px_0px_0px_#0f172a]"
                    title={latestTest?.rawReading !== undefined ? `${latestTest.rawReading}/100 câu đúng` : undefined}
                  >
                    {latestTest?.rawReading !== undefined
                      ? `${latestTest.rawReading}/100`
                      : readingScore >= 495 ? 'Max ⭐' : `${Math.round((readingScore / 495) * 100)}%`}
                  </span>
                </div>
              </div>

              {/* Progress bar Reading: Viền retro game sắc nét */}
              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 border-[1.5px] border-slate-900 dark:border-slate-600 shadow-[1px_1px_0px_0px_#0f172a] dark:shadow-none overflow-hidden p-[0.5px]">
                <div
                  className="h-full rounded-full bg-teal-600 dark:bg-teal-400 transition-all duration-700 ease-out"
                  style={{ width: `${Math.max(3, Math.min(100, Math.round((readingScore / 495) * 100)))}%` }}
                />
              </div>
            </div>

            {/* 3. CHIẾN LƯỢC TRỌNG TÂM - Callout Sticker Neo viền 2px & đổ bóng */}
            {skillStrategy && (
              <div className="p-2 sm:p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/70 border-2 border-slate-900 dark:border-slate-700 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-none space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-950 dark:text-amber-200">
                  <Target className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0 stroke-[2.5]" />
                  <span>{skillStrategy.title}</span>
                </div>
                <p className="text-[10.5px] sm:text-[11px] text-slate-800 dark:text-slate-200 font-medium leading-relaxed pl-5">
                  {skillStrategy.text}
                </p>
              </div>
            )}

            {/* 4. NÚT ĐIỀU HƯỚNG — Nút nổi Neo-Pop tương tác nảy */}
            <button
              onClick={onNavigateToAnalytics}
              className="inline-flex items-center justify-between w-full px-3 py-1.5 sm:py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-950 dark:text-white border-2 border-slate-900 dark:border-slate-200 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none font-black text-xs transition-all cursor-pointer group"
            >
              <span>Xem chi tiết điểm yếu & ma trận 7 Part</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5] group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
