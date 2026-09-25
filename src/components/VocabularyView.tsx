import React, { useMemo, useState } from 'react';
import {
  BookMarked,
  Plus,
  Target,
  TrendingUp,
  Calendar,
  Sparkles,
  Trash2,
  CheckCircle2,
  BookOpen
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import type { VocabLog } from '../utils/dataBundle';
import { getTodayDateString } from '../utils/storage';
import { CARD } from './surfaces';

interface VocabularyViewProps {
  vocabLog: VocabLog[];
  theme: 'light' | 'dark';
  onSaveVocab: (date: string, count: number) => void;
  onDeleteVocab?: (id: string) => void;
  onOpenSessionLogger?: (prefill?: { sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB' }) => void;
}

const formatVnDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export const VocabularyView: React.FC<VocabularyViewProps> = ({
  vocabLog,
  theme,
  onSaveVocab,
  onDeleteVocab,
  onOpenSessionLogger
}) => {
  const isDark = theme === 'dark';
  const today = getTodayDateString();

  // Form ghi nhanh tại trang
  const [quickDate, setQuickDate] = useState(today);
  const [quickCount, setQuickCount] = useState<number>(20);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Lọc các bản ghi hợp lệ
  const activeLogs = useMemo(() => {
    return vocabLog.filter(item => !item.deletedAt && item.count > 0);
  }, [vocabLog]);

  // Dữ liệu lũy kế cho biểu đồ
  const vocabCumulativeData = useMemo(() => {
    if (activeLogs.length === 0) return [];

    const dailyMap: Record<string, number> = {};
    for (const log of activeLogs) {
      dailyMap[log.date] = (dailyMap[log.date] || 0) + log.count;
    }

    const sortedDates = Object.keys(dailyMap).sort();
    let cumulative = 0;

    return sortedDates.map(dateStr => {
      const daily = dailyMap[dateStr];
      cumulative += daily;
      const [, m, d] = dateStr.split('-');
      return {
        date: dateStr,
        displayDate: `${d}/${m}`,
        daily,
        cumulative
      };
    });
  }, [activeLogs]);

  // Tổng số từ hiện tại
  const totalVocabCount = useMemo(() => {
    return vocabCumulativeData.length > 0
      ? vocabCumulativeData[vocabCumulativeData.length - 1].cumulative
      : 0;
  }, [vocabCumulativeData]);

  // Cột mốc tiếp theo
  const vocabMilestone = useMemo(() => {
    if (totalVocabCount < 300) {
      return {
        target: 300,
        label: '300 từ (Cơ bản)',
        gap: 300 - totalVocabCount,
        percent: Math.min(100, Math.round((totalVocabCount / 300) * 100))
      };
    }
    if (totalVocabCount < 600) {
      return {
        target: 600,
        label: '600 Essential Words',
        gap: 600 - totalVocabCount,
        percent: Math.min(100, Math.round((totalVocabCount / 600) * 100))
      };
    }
    if (totalVocabCount < 900) {
      return {
        target: 900,
        label: '900 từ (Tinh anh 900+)',
        gap: 900 - totalVocabCount,
        percent: Math.min(100, Math.round((totalVocabCount / 900) * 100))
      };
    }
    return {
      target: 1200,
      label: '1200 từ (Toàn diện)',
      gap: Math.max(0, 1200 - totalVocabCount),
      percent: Math.min(100, Math.round((totalVocabCount / 1200) * 100))
    };
  }, [totalVocabCount]);

  // Danh sách log sắp xếp mới nhất lên đầu để hiển thị bảng
  const sortedLogsDesc = useMemo(() => {
    return [...activeLogs].sort((a, b) => b.date.localeCompare(a.date));
  }, [activeLogs]);

  // Dải 4 thẻ KPI thiết kế chuẩn đồng bộ với Phân tích điểm số & Kế hoạch (Hình 2)
  const vocabKpis = useMemo(() => {
    return [
      {
        id: 'total',
        label: 'Tổng vốn từ',
        value: totalVocabCount,
        suffix: 'từ',
        accentBar: 'bg-purple-500',
        badge: 'bg-[#DDD6FE] text-slate-950',
        number: 'text-purple-600 dark:text-purple-400',
        icon: BookMarked,
        cornerBadge: totalVocabCount >= 1200
          ? 'Đỉnh cao 🌟'
          : totalVocabCount >= 900
          ? 'Tinh anh 900+'
          : totalVocabCount >= 600
          ? '600 Essential'
          : totalVocabCount >= 300
          ? 'Nền tảng'
          : 'Khởi động',
        cornerBadgeStyle: 'bg-[#DDD6FE] text-slate-950',
        pill: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
        note: `${vocabMilestone.percent}% mốc ${vocabMilestone.target}`,
        subText: 'Vốn từ tích lũy'
      },
      {
        id: 'target',
        label: 'Mục tiêu kế tiếp',
        value: vocabMilestone.target,
        suffix: 'từ',
        accentBar: 'bg-indigo-500',
        badge: 'bg-[#BAE6FD] text-slate-950',
        number: 'text-indigo-600 dark:text-indigo-400',
        icon: Target,
        cornerBadge: `${vocabMilestone.percent}% Đạt`,
        cornerBadgeStyle: 'bg-[#BAE6FD] text-slate-950',
        pill: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
        note: vocabMilestone.label,
        subText: 'Mốc chuẩn ETS'
      },
      {
        id: 'gap',
        label: 'Cần nạp thêm',
        value: vocabMilestone.gap,
        suffix: 'từ',
        accentBar: 'bg-amber-500',
        badge: 'bg-[#FFE600] text-slate-950',
        number: 'text-amber-600 dark:text-amber-400',
        icon: TrendingUp,
        cornerBadge: vocabMilestone.gap === 0 ? 'Đã đạt mốc 🎉' : `Còn thiếu ${vocabMilestone.gap} từ`,
        cornerBadgeStyle: vocabMilestone.gap === 0
          ? 'bg-[#BBF7D0] text-slate-950'
          : 'bg-[#FFE600] text-slate-950',
        pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
        note: `Để chạm ${vocabMilestone.target} từ`,
        subText: vocabMilestone.gap === 0 ? 'Xuất sắc' : 'Khoảng cách mục tiêu'
      },
      {
        id: 'days',
        label: 'Số ngày đã học',
        value: activeLogs.length,
        suffix: 'ngày',
        accentBar: 'bg-emerald-500',
        badge: 'bg-[#BBF7D0] text-slate-950',
        number: 'text-emerald-600 dark:text-emerald-400',
        icon: Calendar,
        cornerBadge: activeLogs.length >= 14
          ? 'Rất kiên trì 🔥'
          : activeLogs.length >= 7
          ? 'Tuần đầu tốt'
          : 'Bắt đầu thói quen',
        cornerBadgeStyle: 'bg-[#BBF7D0] text-slate-950',
        pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
        note: 'Duy trì chuỗi Streak',
        subText: activeLogs.length > 0 ? `~${Math.round(totalVocabCount / Math.max(1, activeLogs.length))} từ / ngày` : 'Chưa có ngày nào'
      }
    ];
  }, [totalVocabCount, vocabMilestone, activeLogs.length]);

  // Xử lý nạp nhanh
  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDate || quickCount <= 0) return;
    onSaveVocab(quickDate, Number(quickCount));
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 2500);
  };

  return (
    <div className="space-y-5 animate-fade-in pb-12 max-w-7xl mx-auto">
      
      {/* ================= 1. HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-linear-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/20">
              <BookMarked className="w-5 h-5" />
            </span>
            Vốn Từ Vựng TOEIC
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Theo dõi quy mô từ vựng, mức độ tích lũy và duy trì thói quen nạp từ mỗi ngày
          </p>
        </div>

        {onOpenSessionLogger && (
          <button
            type="button"
            onClick={() => onOpenSessionLogger({ sessionType: 'VOCAB' })}
            className="px-4 py-2 rounded-xl btn-linear-primary text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Ghi nhận từ vựng
          </button>
        )}
      </div>

      {/* ================= 2. BẢNG GHI NHANH TỪ VỰNG ================= */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <form onSubmit={handleQuickSubmit} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-[#DDD6FE] text-slate-950 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 stroke-[2.5]" />
            </span>
            <div>
              <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                Ghi nhận nhanh từ vựng hôm nay
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nhập số từ bạn đã học qua Flashcard, Quizlet hoặc sách từ vựng để giữ chuỗi ngày học
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <input
              type="date"
              required
              max={today}
              value={quickDate}
              onChange={e => setQuickDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border-2 border-slate-900 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white font-bold focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                required
                value={quickCount}
                onChange={e => setQuickCount(Math.max(1, Number(e.target.value)))}
                className="w-20 px-3 py-1.5 rounded-xl border-2 border-slate-900 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white text-center font-black focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">từ</span>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#FFE600] hover:bg-[#FACC15] text-slate-950 text-xs sm:text-sm font-black border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
              Lưu ngay
            </button>
          </div>
        </form>

        {showSuccessToast && (
          <div className="mt-2.5 p-2 rounded-lg bg-[#BBF7D0] border-2 border-slate-900 text-slate-950 text-xs font-black flex items-center gap-1.5 animate-fade-in shadow-[1.5px_1.5px_0px_0px_#0f172a]">
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            Đã lưu thành công {quickCount} từ cho ngày {formatVnDate(quickDate)}!
          </div>
        )}
      </div>

      {/* ================= 3. DẢI 4 THẺ KPI VỐN TỪ (ĐỒNG BỘ CHUẨN NEO-BRUTALISM) ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {vocabKpis.map(k => (
          <div
            key={k.id}
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
                title={k.note}
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

      {/* ================= 4. BIỂU ĐỒ TÍCH LŨY VỐN TỪ (CUMULATIVE AREA CHART) ================= */}
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Đường Cong Tăng Trưởng Vốn Từ
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                (Cumulative Vocabulary Curve)
              </span>
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Tổng số từ vựng tích lũy qua từng ngày rèn luyện · Hướng tới mốc {vocabMilestone.label}
            </p>
          </div>
        </div>

        {vocabCumulativeData.length > 0 ? (
          <div className="h-[320px] sm:h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={vocabCumulativeData} margin={{ top: 24, right: 24, left: 0, bottom: 6 }}>
                <defs>
                  <linearGradient id="vocabViewFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={isDark ? 0.35 : 0.2} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#E2E8F0'} />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 12, fill: isDark ? '#CBD5E1' : '#475569', fontWeight: 600 }}
                  tickMargin={8}
                  axisLine={{ stroke: isDark ? '#475569' : '#CBD5E1' }}
                  tickLine={false}
                  padding={{ left: 20, right: 20 }}
                />
                <YAxis
                  domain={[0, (dataMax: number) => Math.max(vocabMilestone.target, Math.ceil((dataMax + 60) / 100) * 100)]}
                  width={44}
                  tick={{ fontSize: 12, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="p-3 rounded-xl bg-slate-900/95 text-white shadow-xl border border-slate-700 text-xs sm:text-sm space-y-1">
                        <div className="text-slate-400 font-semibold">{formatVnDate(d.date)}</div>
                        <div className="font-black text-purple-300 text-base tabular-nums">
                          {d.cumulative} từ tích lũy
                        </div>
                        <div className="text-xs text-emerald-400 font-semibold">
                          +{d.daily} từ nạp trong ngày
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  y={vocabMilestone.target}
                  stroke={isDark ? '#A78BFA' : '#8B5CF6'}
                  strokeDasharray="6 3"
                  label={{
                    value: `Mục tiêu ${vocabMilestone.label}`,
                    position: 'insideBottomLeft',
                    fontSize: 11,
                    fontWeight: 700,
                    fill: isDark ? '#C4B5FD' : '#7C3AED'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#8B5CF6"
                  strokeWidth={2.5}
                  fill="url(#vocabViewFill)"
                  isAnimationActive={false}
                  dot={(props: any) => {
                    const { cx, cy, payload, index } = props;
                    if (!cx || !cy) return <g key={props?.key || 'empty'} />;
                    const isLast = index === vocabCumulativeData.length - 1;
                    return (
                      <g key={`vocab-curve-dot-${payload?.date || cx}`}>
                        {isLast && (
                          <text
                            x={cx}
                            y={cy - 12}
                            textAnchor="middle"
                            fontSize={12}
                            fontWeight={700}
                            fill={isDark ? '#E2E8F0' : '#1E293B'}
                          >
                            {payload?.cumulative}
                          </text>
                        )}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isLast ? 6 : 4}
                          fill={isLast ? '#8B5CF6' : isDark ? '#0F172A' : '#FFFFFF'}
                          stroke="#8B5CF6"
                          strokeWidth={2}
                        />
                      </g>
                    );
                  }}
                  activeDot={{ r: 6.5, fill: '#8B5CF6', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Chưa có dữ liệu từ vựng tích lũy
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Nhập số từ vựng bạn học mỗi ngày ở khung phía trên để kích hoạt đường cong tăng trưởng vốn từ TOEIC.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ================= 5. BẢNG NHẬT KÝ NẠP TỪ THEO NGÀY ================= */}
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Lịch Sử Nạp Từ Vựng
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Danh sách chi tiết các ngày đã ghi nhận học từ vựng
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {sortedLogsDesc.length} lượt ghi nhận
          </span>
        </div>

        {sortedLogsDesc.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">
            Chưa có lượt ghi nhận từ vựng nào.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-xs">
                  <th className="pb-2.5 font-semibold">Ngày học</th>
                  <th className="pb-2.5 font-semibold">Số từ nạp</th>
                  <th className="pb-2.5 font-semibold text-right">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {sortedLogsDesc.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 font-semibold text-slate-900 dark:text-white">
                      {formatVnDate(log.date)}
                      {log.date === today && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          Hôm nay
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="font-black text-purple-600 dark:text-purple-400 tabular-nums">
                        +{log.count}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">từ</span>
                    </td>
                    <td className="py-3 text-right">
                      {onDeleteVocab && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Bạn có chắc muốn xóa bản ghi ${log.count} từ ngày ${formatVnDate(log.date)}?`)) {
                              onDeleteVocab(log.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="Xóa bản ghi này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
