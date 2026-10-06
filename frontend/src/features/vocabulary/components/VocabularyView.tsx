import React, { useMemo, useState, useEffect } from 'react';
import {
  BookMarked,
  Trash2,
  CheckCircle2,
  Calendar,
  BarChart3,
  BookOpen
} from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList
} from 'recharts';
import type { VocabLog } from '@/shared/data/dataBundle';
import { getTodayDateString } from '@/shared/data/storage';

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
  onDeleteVocab
}) => {
  const [isDomDark, setIsDomDark] = useState(() => 
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDomDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const isDark = theme === 'dark' || isDomDark;
  const today = getTodayDateString();

  // Form ghi nhanh số từ vựng
  const [quickDate, setQuickDate] = useState(today);
  const [quickCount, setQuickCount] = useState<number>(20);
  
  // Trạng thái đã lưu phản hồi trực tiếp trên nút (chống giật khung)
  const [isJustSaved, setIsJustSaved] = useState(false);

  // Lọc các bản ghi hợp lệ (chưa bị xóa mềm)
  const activeLogs = useMemo(() => {
    return vocabLog.filter(item => !item.deletedAt && item.count > 0);
  }, [vocabLog]);

  // Gom nhóm dữ liệu theo ngày để hiển thị biểu đồ cột
  const chartData = useMemo(() => {
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

  // Tổng số từ đã tích lũy
  const totalVocabCount = useMemo(() => {
    return chartData.length > 0
      ? chartData[chartData.length - 1].cumulative
      : 0;
  }, [chartData]);

  // Danh sách lịch sử sắp xếp từ mới nhất xuống cũ nhất
  const sortedLogsDesc = useMemo(() => {
    return [...activeLogs].sort((a, b) => b.date.localeCompare(a.date));
  }, [activeLogs]);

  // Thống kê tóm tắt cho card lịch sử (Kỷ lục & Trung bình)
  const maxDayLog = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData.reduce((max, curr) => (curr.daily > max.daily ? curr : max), chartData[0]);
  }, [chartData]);

  const avgDailyWords = useMemo(() => {
    if (chartData.length === 0) return 0;
    const total = chartData.reduce((sum, item) => sum + item.daily, 0);
    return Math.round((total / chartData.length) * 10) / 10;
  }, [chartData]);

  // Xử lý lưu từ vựng (phản hồi tại nút, 0px layout shift)
  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDate || quickCount <= 0) return;
    onSaveVocab(quickDate, Number(quickCount));
    setIsJustSaved(true);
    setTimeout(() => setIsJustSaved(false), 1800);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-4 w-full flex-1 flex flex-col min-h-0">
      
      {/* ================= 1. THANH TIÊU ĐỀ & FORM NHẬP INLINE GỌN GÀNG ================= */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        
        {/* Vế trái: Tiêu đề + Huy hiệu tổng từ */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a]">
            <BookMarked className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-950 dark:text-white tracking-tight">
                Vốn Từ Vựng TOEIC
              </h1>
              <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-950 dark:text-purple-300 font-mono font-black text-xs border border-slate-900 shadow-[1px_1px_0px_#0f172a]">
                {totalVocabCount} từ tích lũy
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
              Nhập số từ bạn đã học để vẽ biểu đồ tiến độ mỗi ngày
            </p>
          </div>
        </div>

        {/* Vế phải: Form nhập từ vựng 1 dòng - Chuẩn Neo-Brutalism */}
        <form onSubmit={handleQuickSubmit} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Chọn ngày */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-900 dark:text-slate-300 shrink-0" />
            <input
              type="date"
              aria-label="Ngày học từ vựng"
              required
              max={today}
              value={quickDate}
              onChange={e => setQuickDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-950 dark:text-white font-bold shadow-[2px_2px_0px_#0f172a] dark:shadow-[2px_2px_0px_#cbd5e1] focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Ô nhập số lượng từ */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              aria-label="Số từ đã học"
              min="1"
              max="999"
              required
              value={quickCount}
              onChange={e => setQuickCount(Math.max(1, Number(e.target.value)))}
              className="w-16 px-2 py-1.5 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-950 dark:text-white text-center font-mono font-black shadow-[2px_2px_0px_#0f172a] dark:shadow-[2px_2px_0px_#cbd5e1] focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-xs font-black text-slate-900 dark:text-white">từ</span>
          </div>

          {/* Nút lưu - phản hồi trạng thái ngay trên nút (0px layout shift) */}
          <button
            type="submit"
            className={`px-4 py-1.5 rounded-xl font-black text-xs border-2 border-slate-900 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              isJustSaved
                ? 'bg-emerald-400 text-slate-950 shadow-[2px_2px_0px_#0f172a] scale-105'
                : 'bg-yellow-300 hover:bg-yellow-200 text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{isJustSaved ? 'Đã lưu!' : 'Lưu từ vựng'}</span>
          </button>
        </form>
      </div>

      {/* ================= 2. KHU VỰC CHÍNH: BIỂU ĐỒ CỘT (70%) + LỊCH SỬ (30%) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 lg:h-[calc(100vh-210px)] lg:min-h-[460px] lg:max-h-[600px] min-h-0">
        
        {/* Cột 1: Biểu đồ cột từ vựng (Chiếm 8/12 cột, tỷ lệ rộng - cao cân đối, không nén) */}
        <div className="lg:col-span-8 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] flex flex-col h-full min-h-[360px]">
          
          {/* Header biểu đồ */}
          <div className="flex items-center justify-between gap-2 flex-wrap pb-2.5 border-b-2 border-slate-900 dark:border-slate-700 shrink-0">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 stroke-[2.5]" />
              <h2 className="text-sm sm:text-base font-black text-slate-950 dark:text-white">
                Biểu Đồ Cột Từ Vựng Đã Học
              </h2>
              <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-300 font-mono border border-slate-900">
                {chartData.length} ngày
              </span>
            </div>

            {/* Chú thích màu cột chuẩn Neo-Brutalism */}
            <div className="flex items-center gap-2 text-xs font-black">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-200 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-200 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] text-[11px]">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 border border-slate-900"></span>
                <span>Hôm nay</span>
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-200 dark:bg-indigo-950/80 text-indigo-950 dark:text-indigo-200 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] text-[11px]">
                <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 border border-slate-900"></span>
                <span>Ngày trước</span>
              </span>
            </div>
          </div>

          {/* Vùng vẽ biểu đồ cột - Tự co giãn theo chiều cao container (Thoáng mắt, rõ nét) */}
          {chartData.length > 0 ? (
            <div className="flex-1 w-full pt-3 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 26, right: 16, left: 0, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#E2E8F0'} />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11.5, fill: isDark ? '#CBD5E1' : '#334155', fontWeight: 800 }}
                    tickLine={false}
                    axisLine={{ stroke: isDark ? '#475569' : '#0F172A', strokeWidth: 2 }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B', fontWeight: 700, fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-slate-900 text-slate-950 dark:text-white border-2 border-slate-900 shadow-[3px_3px_0px_#0f172a] text-xs space-y-0.5 z-30">
                          <div className="text-slate-700 dark:text-slate-300 font-bold">{formatVnDate(d.date)}</div>
                          <div className="font-mono font-black text-emerald-700 dark:text-emerald-400 text-sm">
                            +{d.daily} từ
                          </div>
                          <div className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                            Tổng tích lũy: <strong className="text-purple-700 dark:text-purple-300 font-mono font-black">{d.cumulative} từ</strong>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="daily"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="daily"
                      position="top"
                      content={(props: any) => {
                        const { x, y, width, value } = props;
                        if (value === undefined || value === null || value === 0) return null;
                        return (
                          <text
                            x={Number(x) + Number(width) / 2}
                            y={Number(y) - 6}
                            textAnchor="middle"
                            fill={isDark ? '#F8FAFC' : '#0F172A'}
                            fontSize={11.5}
                            fontWeight={900}
                            fontFamily="ui-monospace, monospace"
                          >
                            +{value}
                          </text>
                        );
                      }}
                    />
                    {chartData.map((entry, idx) => {
                      const isToday = entry.date === today;
                      return (
                        <Cell
                          key={`vocab-bar-${idx}`}
                          fill={isToday 
                            ? (isDark ? '#10B981' : '#059669') 
                            : (isDark ? '#818CF8' : '#6366F1')
                          }
                          stroke="#0F172A"
                          strokeWidth={2}
                          className="transition-all hover:opacity-90 cursor-pointer"
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-14 px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
              <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                Chưa có dữ liệu từ vựng
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Nhập số từ bạn vừa học ở thanh trên để bắt đầu vẽ biểu đồ cột!
              </p>
            </div>
          )}
        </div>

        {/* Cột 2: Lịch sử nạp từ vựng - Chuẩn 100% Neo-Brutalism */}
        <div className="lg:col-span-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#121A2B] border-2 border-slate-900 dark:border-slate-700 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] flex flex-col h-full min-h-[360px] justify-between">
          
          {/* Header lịch sử */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b-2 border-slate-900 dark:border-slate-700 shrink-0">
            <h2 className="text-sm sm:text-base font-black text-slate-950 dark:text-white">
              Lịch Sử Ghi Nhận
            </h2>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-purple-200 dark:bg-purple-950/80 text-purple-950 dark:text-purple-300 border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a]">
              {sortedLogsDesc.length} lượt
            </span>
          </div>

          {/* Danh sách các lần nạp dạng Mini-Card Neo-Brutalism có viền đen 2px và đổ bóng sắc nét */}
          {sortedLogsDesc.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                Chưa có lượt ghi nhận từ vựng nào.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-0 pt-2.5">
              {sortedLogsDesc.map(log => {
                const isToday = log.date === today;
                return (
                  <div
                    key={log.id}
                    className={`p-2.5 rounded-xl border-2 border-slate-900 dark:border-slate-700 flex items-center justify-between transition-all ${
                      isToday
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 shadow-[2.5px_2.5px_0px_#0f172a] dark:shadow-[2.5px_2.5px_0px_#cbd5e1]'
                        : 'bg-white dark:bg-slate-900 shadow-[2px_2px_0px_#0f172a] dark:shadow-[2px_2px_0px_#cbd5e1] hover:bg-slate-50 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-xs border-1.5 border-slate-900 shrink-0 ${
                          isToday ? 'bg-emerald-500' : 'bg-indigo-500'
                        }`}
                      />
                      <span className="text-xs font-black text-slate-950 dark:text-white font-mono">
                        {formatVnDate(log.date)}
                      </span>
                      {isToday && (
                        <span className="px-1.5 py-0.2 rounded-md text-[9.5px] font-black bg-emerald-300 text-slate-950 border border-slate-900 shadow-[1px_1px_0px_#0f172a] shrink-0">
                          Hôm nay
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-mono font-black text-xs px-2.5 py-0.5 rounded-lg border-2 border-slate-900 shadow-[1.5px_1.5px_0px_#0f172a] ${
                          isToday
                            ? 'bg-emerald-300 text-slate-950'
                            : 'bg-purple-200 text-slate-950'
                        }`}
                      >
                        +{log.count} từ
                      </span>
                      {onDeleteVocab && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Xóa bản ghi +${log.count} từ ngày ${formatVnDate(log.date)}?`)) {
                              onDeleteVocab(log.id);
                            }
                          }}
                          className="p-1 rounded-lg border-1.5 border-slate-900 bg-white dark:bg-slate-800 hover:bg-rose-200 dark:hover:bg-rose-950 text-slate-700 hover:text-rose-950 transition-all shadow-[1.5px_1.5px_0px_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
                          title="Xóa bản ghi này"
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Thẻ thống kê tóm tắt chân trang - Chuẩn phong cách Neo-Brutalism */}
          {chartData.length > 0 && (
            <div className="mt-3 pt-2.5 border-t-2 border-slate-900 dark:border-slate-700 shrink-0">
              <div className="p-2.5 rounded-2xl border-2 border-slate-900 dark:border-slate-700 bg-amber-100/70 dark:bg-slate-900/90 shadow-[2.5px_2.5px_0px_#0f172a] dark:shadow-[2.5px_2.5px_0px_#cbd5e1] grid grid-cols-2 gap-2.5">
                <div className="p-2 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-[1.5px_1.5px_0px_#0f172a]">
                  <div className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    🏆 Kỷ lục ngày
                  </div>
                  <div className="font-mono font-black text-sm text-indigo-700 dark:text-indigo-400 mt-0.5">
                    +{maxDayLog?.daily || 0} từ{' '}
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans font-bold">
                      ({maxDayLog?.displayDate})
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-xl border-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-[1.5px_1.5px_0px_#0f172a]">
                  <div className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    ⚡ Trung bình
                  </div>
                  <div className="font-mono font-black text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                    ~{avgDailyWords} từ
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans font-bold">
                      /ngày
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
