import React, { useState, useMemo } from 'react';
import { 
  BarChart3,
  BookOpen,
  AlertTriangle,
  ArrowRight,
  Timer,
  Zap
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  LabelList,
  PieChart,
  Pie
} from 'recharts';
import { StudySession, MistakeEntry, LRPartScore, UserProfile, ErrorCategory, ERROR_CATEGORY_LABELS, ReadingPartType } from '@/shared/types';
import { PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { rollingPartStats } from '@/shared/domain/learningAnalytics';
import type { VocabLog } from '@/shared/data/dataBundle';
import { CARD } from '@/shared/ui/surfaces';

// Tên tiếng Việt ngắn gọn, dễ đọc
const PART_SHORT_NAMES: Record<keyof LRPartScore, string> = {
  part1: 'Part 1: Mô tả tranh',
  part2: 'Part 2: Hỏi & Đáp',
  part3: 'Part 3: Hội thoại',
  part4: 'Part 4: Bài nói ngắn',
  part5: 'Part 5: Điền câu',
  part6: 'Part 6: Điền đoạn văn',
  part7: 'Part 7: Đọc hiểu văn bản'
};

// Màu sắc cho Donut chart nguyên nhân mất điểm
const DONUT_COLORS = [
  '#F43F5E', // Rose (Bẫy từ vựng & Paraphrase)
  '#F59E0B', // Amber (Áp lực thời gian / Cháy giờ)
  '#3B82F6', // Blue (Mất tập trung / Đọc ẩu)
  '#8B5CF6', // Purple (Ngữ pháp nâng cao)
  '#94A3B8', // Slate (Khác / Chưa phân loại)
  '#10B981', // Emerald
  '#06B6D4'  // Cyan
];

interface AnalyticsViewProps {
  profile?: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  vocabLog: VocabLog[];
  theme: 'light' | 'dark';
  onDeleteSession?: (sessionId: string) => void;
  onEditSession?: (session: StudySession) => void;
  onOpenSessionLogger?: (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB' }) => void;
  onNavigateToMistakes?: () => void;
  onNavigateToTimer?: (part?: ReadingPartType) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  profile: _profile,
  sessions,
  mistakes,
  theme,
  onNavigateToMistakes,
  onNavigateToTimer
}) => {
  const isDark = theme === 'dark';
  const [filterMode, setFilterMode] = useState<'RECENT_5' | 'ALL'>('RECENT_5');
  const [selectedPartKey, setSelectedPartKey] = useState<keyof LRPartScore | null>(null);
  const [hoveredDonutIndex, setHoveredDonutIndex] = useState<number | null>(null);

  // Các bài Full Test có điểm
  const fullTests = useMemo(() => {
    return sessions.filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0);
  }, [sessions]);

  // Sắp xếp thời gian tăng dần
  const chronologicalFullTests = useMemo(() => {
    return [...fullTests].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [fullTests]);

  // Bộ lọc: 5 đề gần nhất hoặc Tất cả
  const filteredSessions = useMemo(() => {
    if (filterMode === 'RECENT_5') {
      return chronologicalFullTests.slice(-5);
    }
    return chronologicalFullTests;
  }, [chronologicalFullTests, filterMode]);

  const rolling = useMemo(() => rollingPartStats(filteredSessions), [filteredSessions]);

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
        code: worstKey.toUpperCase().replace('PART', 'P'),
        accuracy: minAcc,
        avgCorrect: Math.round(partStats.averages[worstKey]),
        max: PART_MAX_QUESTIONS[worstKey]
      }
    };
  }, [partStats]);

  // Part đang được chọn tương tác (mặc định là Part yếu nhất)
  const activePart = useMemo(() => {
    if (!partStats) return null;
    const targetKey = selectedPartKey || weakestPart?.key || 'part7';
    const code = targetKey.toUpperCase().replace('PART', 'P');
    return {
      key: targetKey,
      code,
      name: PART_SHORT_NAMES[targetKey],
      accuracy: Math.round(partStats.accuracy[targetKey] || 0),
      avgCorrect: Math.round(partStats.averages[targetKey] || 0),
      max: PART_MAX_QUESTIONS[targetKey],
      isWeakest: weakestPart?.key === targetKey
    };
  }, [partStats, selectedPartKey, weakestPart]);

  // Phân tích kỹ năng Listening & Reading
  const targetGap = useMemo(() => {
    const sectionTests = chronologicalFullTests.filter(session => session.scaledListening !== undefined && session.scaledReading !== undefined);
    let currentLC = sectionTests.length > 0 ? (sectionTests[sectionTests.length - 1].scaledListening || 0) : 0;
    let currentRC = sectionTests.length > 0 ? (sectionTests[sectionTests.length - 1].scaledReading || 0) : 0;

    if (sectionTests.length >= 3) {
      const last3 = sectionTests.slice(-3);
      const weightedLC = (last3[2].scaledListening || 0) * 0.5 + (last3[1].scaledListening || 0) * 0.3 + (last3[0].scaledListening || 0) * 0.2;
      const weightedRC = (last3[2].scaledReading || 0) * 0.5 + (last3[1].scaledReading || 0) * 0.3 + (last3[0].scaledReading || 0) * 0.2;
      currentLC = Math.round(weightedLC / 5) * 5;
      currentRC = Math.round(weightedRC / 5) * 5;
    } else if (sectionTests.length === 2) {
      const weightedLC = (sectionTests[1].scaledListening || 0) * 0.6 + (sectionTests[0].scaledListening || 0) * 0.4;
      const weightedRC = (sectionTests[1].scaledReading || 0) * 0.6 + (sectionTests[0].scaledReading || 0) * 0.4;
      currentLC = Math.round(weightedLC / 5) * 5;
      currentRC = Math.round(weightedRC / 5) * 5;
    }

    return {
      hasScores: sectionTests.length > 0,
      currentLC,
      currentRC
    };
  }, [chronologicalFullTests]);

  // Dữ liệu cho biểu đồ cột đứng 7 Part
  const partChartData = useMemo(() => {
    if (!partStats) return [];
    const partKeys: Array<keyof LRPartScore> = ['part1', 'part2', 'part3', 'part4', 'part5', 'part6', 'part7'];
    return partKeys.map((k) => {
      const code = k.toUpperCase().replace('PART', 'P');
      const fullName = PART_SHORT_NAMES[k];
      const accuracy = Math.round(partStats.accuracy[k] || 0);
      const avg = Math.round(partStats.averages[k] || 0);
      const max = PART_MAX_QUESTIONS[k];
      const isListening = ['part1', 'part2', 'part3', 'part4'].includes(k);
      const isWeakest = weakestPart?.key === k;

      return {
        key: k,
        code,
        fullName,
        accuracy,
        avg,
        max,
        isListening,
        isWeakest
      };
    });
  }, [partStats, weakestPart]);

  // Chẩn đoán nguyên nhân mất điểm từ Sổ tay bắt bẫy
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
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'vi'));

    return {
      total,
      rows,
      top: rows[0]
    };
  }, [mistakes]);

  // Ước tính điểm tiềm năng gỡ được từ điểm nghẽn
  const potentialPoints = useMemo(() => {
    if (!weakestPart) return 30;
    const diff = (weakestPart.max - weakestPart.avgCorrect) * 5;
    return Math.max(15, Math.min(60, Math.round(diff / 5) * 5));
  }, [weakestPart]);

  // Thông điệp chẩn đoán đòn bẩy ngắn gọn, chuẩn xác
  const diagnosticMessage = useMemo(() => {
    if (!targetGap.hasScores) return 'Chưa có điểm Listening/Reading để so sánh kỹ năng. Có thể bổ sung điểm riêng khi sửa kết quả đề.';
    const lc = targetGap.currentLC;
    const rc = targetGap.currentRC;
    const wpName = weakestPart ? weakestPart.name.split(':')[0] : 'Part 7';
    const wpAcc = weakestPart ? `${weakestPart.accuracy}%` : '';
    const topError = errorDiagnosis?.top ? errorDiagnosis.top.label : null;

    if (lc >= 450 && rc < lc) {
      return `Listening đã chạm mốc ${lc}đ (rất vững). Trọng tâm gỡ điểm nằm ở Reading ${wpName} (${wpAcc})${topError ? ` và ${topError}` : ''}.`;
    }
    if (rc >= 450 && lc < rc) {
      return `Reading đã chạm mốc ${rc}đ (rất vững). Trọng tâm gỡ điểm nằm ở Listening ${wpName} (${wpAcc})${topError ? ` và ${topError}` : ''}.`;
    }
    return `Cán cân Nghe (${lc}đ) và Đọc (${rc}đ) đang tiến triển. Trọng tâm ưu tiên gỡ điểm: ${wpName} (${wpAcc})${topError ? ` và ${topError}` : ''}.`;
  }, [targetGap, weakestPart, errorDiagnosis]);

  // Render tick tùy chỉnh cho XAxis: hiện cả mã Part (P1) và số câu đúng (6/6)
  const renderCustomXAxisTick = (props: any): React.ReactElement<SVGElement> => {
    const { x, y, payload } = props;
    const item = partChartData.find(d => d.code === payload?.value);
    if (!item) return <g />;
    const isWeak = item.isWeakest;
    const isSelected = activePart?.key === item.key;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={15}
          textAnchor="middle"
          fontSize={13}
          fontWeight={isWeak || isSelected ? 900 : 800}
          fill={isWeak ? '#E11D48' : isDark ? '#F8FAFC' : '#0F172A'}
        >
          {item.code}
        </text>
        <text
          x={0}
          y={30}
          textAnchor="middle"
          fontSize={11.5}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fontWeight={700}
          fill={isWeak ? (isDark ? '#FDA4AF' : '#E11D48') : (isDark ? '#94A3B8' : '#475569')}
        >
          {item.avg}/{item.max}
        </text>
      </g>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-fade-in text-slate-800 dark:text-slate-200 my-auto">
      
      {/* 1. HAI KHỐI BIỂU ĐỒ CHUYÊN SÂU ĐỐI XỨNG (50% / 50%) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        
        {/* CỘT 1: BIỂU ĐỒ CỘT 7 PART TINH CHỈNH */}
        <section className={`${CARD} flex flex-col justify-between space-y-3.5 p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between pb-3 border-b-2 border-slate-900/10 dark:border-slate-800 gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-950 dark:text-white flex items-center gap-2 whitespace-nowrap">
                <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 stroke-[2.5]" />
                <span>Năng Lực 7 Part</span>
              </h2>
            </div>

            {/* Bộ lọc 5 đề / Tất cả đề */}
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 shadow-2xs text-xs shrink-0">
              <button
                type="button"
                onClick={() => setFilterMode('RECENT_5')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                  filterMode === 'RECENT_5'
                    ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-700 dark:text-white border border-slate-900/15'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                5 đề gần nhất
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                  filterMode === 'ALL'
                    ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-700 dark:text-white border border-slate-900/15'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                Tất cả ({fullTests.length})
              </button>
            </div>
          </div>

          {partChartData.length > 0 ? (
            <div className="space-y-3">
              {/* Canvas Biểu đồ cột tương tác - Chiều cao 295px tối ưu, cân bằng */}
              <div className="relative w-full h-[295px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={partChartData}
                    margin={{ top: 14, right: 8, left: -24, bottom: 12 }}
                    onClick={(state) => {
                      if (state && state.activePayload && state.activePayload.length) {
                        setSelectedPartKey(state.activePayload[0].payload.key as keyof LRPartScore);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#F1F5F9'} />
                    <XAxis
                      dataKey="code"
                      tick={renderCustomXAxisTick}
                      axisLine={{ stroke: isDark ? '#475569' : '#CBD5E1', strokeWidth: 1.5 }}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      domain={[50, 102]}
                      ticks={[50, 60, 70, 80, 90, 100]}
                      unit="%"
                      tick={{ fontSize: 11.5, fill: isDark ? '#94A3B8' : '#475569', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="p-3 rounded-xl bg-white dark:bg-[#111A2C] border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] text-xs space-y-1.5 z-30">
                            <div className="font-black text-slate-950 dark:text-white text-sm">{data.fullName}</div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-600 dark:text-slate-300">Độ chính xác:</span>
                              <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm">{data.accuracy}%</span>
                            </div>
                            <div className="text-slate-700 dark:text-slate-300 font-medium">
                              Đúng trung bình: <strong className="font-black text-slate-950 dark:text-white">{data.avg}/{data.max}</strong> câu
                            </div>
                            {data.isWeakest && (
                              <div className="text-rose-600 dark:text-rose-400 font-black pt-0.5 flex items-center gap-1">
                                <span>⚠️</span>
                                <span>Điểm nghẽn thấp nhất</span>
                              </div>
                            )}
                            <div className="text-[11px] text-slate-400 font-bold pt-1 border-t border-slate-200 dark:border-slate-800">
                              Bấm để chọn luyện Part này
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      y={90}
                      stroke={isDark ? '#475569' : '#CBD5E1'}
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                    <Bar dataKey="accuracy" radius={[6, 6, 0, 0]} barSize={34} isAnimationActive={false}>
                      {partChartData.map((entry) => {
                        const isSelected = activePart?.key === entry.key;
                        const isWeak = entry.isWeakest;
                        const fillColor = isWeak 
                          ? '#F43F5E' 
                          : entry.isListening 
                            ? (isDark ? '#6366F1' : '#4F46E5') 
                            : (isDark ? '#14B8A6' : '#0D9488');
                        return (
                          <Cell
                            key={`cell-${entry.key}`}
                            className="cursor-pointer transition-all duration-200 hover:opacity-90"
                            fill={fillColor}
                            stroke={isSelected || isWeak ? (isWeak ? '#FDA4AF' : '#818CF8') : 'none'}
                            strokeWidth={isSelected || isWeak ? 2 : 0}
                          />
                        );
                      })}
                      <LabelList
                        dataKey="accuracy"
                        position="top"
                        content={(props: any) => {
                          const { x, y, width, value } = props;
                          if (value === undefined || value === null) return null;
                          return (
                            <text
                              x={Number(x) + Number(width) / 2}
                              y={Number(y) - 6}
                              textAnchor="middle"
                              fill={isDark ? '#F1F5F9' : '#0F172A'}
                              stroke="none"
                              strokeWidth={0}
                              fontSize={12.5}
                              fontWeight={900}
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                            >
                              {value}%
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Dòng tóm tắt nghe/đọc phong cách Neo sắc nét */}
              <div className="flex items-center justify-center gap-6 text-xs sm:text-sm text-slate-700 dark:text-slate-300 border-t-2 border-slate-900/10 dark:border-slate-800 pt-3">
                <span className="flex items-center gap-2 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400"></span>
                  Listening: <strong className="font-mono text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400">{targetGap.hasScores ? `${targetGap.currentLC}/495đ` : 'Chưa ghi'}</strong>
                </span>
                <span className="text-slate-300 dark:text-slate-700 font-black">•</span>
                <span className="flex items-center gap-2 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 dark:bg-teal-400"></span>
                  Reading: <strong className="font-mono text-sm sm:text-base font-black text-teal-600 dark:text-teal-400">{targetGap.hasScores ? `${targetGap.currentRC}/495đ` : 'Chưa ghi'}</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
              Chưa có dữ liệu bài Full Test nào có ghi số câu đúng từng Part.
            </div>
          )}
        </section>

        {/* CỘT 2: BIỂU ĐỒ DONUT NGUYÊN NHÂN MẤT ĐIỂM TINH GỌN */}
        <section className={`${CARD} flex flex-col justify-between space-y-3.5 p-5 sm:p-6`}>
          <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900/10 dark:border-slate-800">
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-950 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 stroke-[2.5]" />
                <span>Nguyên Nhân Mất Điểm</span>
              </h2>
            </div>
            <span className="text-xs font-mono font-black text-slate-950 bg-amber-300 dark:bg-amber-400 px-3 py-1 rounded-lg border-2 border-slate-900 shadow-2xs">
              {errorDiagnosis?.total || 0} LỖI GHI NHẬN
            </span>
          </div>

          {errorDiagnosis && errorDiagnosis.total > 0 ? (
            <div className="space-y-3">
              {/* Split Layout: Bánh Donut bên trái (5/12) + Danh sách bên phải (7/12) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center py-1">
                
                {/* Bánh Donut bên trái - Chiều cao 275px cân xứng */}
                <div className="sm:col-span-5 relative h-[275px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                    <PieChart>
                      <Tooltip
                        wrapperStyle={{ zIndex: 50, pointerEvents: 'none' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="p-3 rounded-xl bg-white dark:bg-[#111A2C] border-2 border-slate-900 shadow-[3px_3px_0px_0px_#0f172a] text-xs space-y-1 z-50">
                              <span className="font-black text-slate-950 dark:text-white text-sm">{data.label}:</span>{' '}
                              <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-sm">{data.count} lỗi ({data.percent}%)</span>
                            </div>
                          );
                        }}
                      />
                      <Pie
                        data={errorDiagnosis.rows}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={90}
                        paddingAngle={3}
                        isAnimationActive={false}
                        onMouseEnter={(_, index) => setHoveredDonutIndex(index)}
                        onMouseLeave={() => setHoveredDonutIndex(null)}
                      >
                        {errorDiagnosis.rows.map((entry, index) => (
                          <Cell
                            key={`donut-cell-${entry.category}`}
                            fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Tâm tròn Donut */}
                  <div className={`absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-200 ${hoveredDonutIndex !== null ? 'opacity-0' : 'opacity-100'}`}>
                    <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-slate-950 dark:text-white leading-none">
                      {errorDiagnosis.total}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
                      Lỗi sai
                    </span>
                  </div>
                </div>

                {/* Danh sách phân loại bên phải */}
                <div className="sm:col-span-7 space-y-1.5 text-xs sm:text-sm max-h-[275px] overflow-y-auto pr-1">
                  {errorDiagnosis.rows.map((row, index) => {
                    const isTop = index === 0;
                    const color = DONUT_COLORS[index % DONUT_COLORS.length];
                    return (
                      <div
                        key={row.category}
                        className={`flex items-center justify-between p-2 rounded-xl border transition-all gap-2 ${
                          isTop
                            ? 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <span className={`flex items-center gap-2 min-w-0 ${isTop ? 'font-black text-slate-950 dark:text-white' : 'font-bold text-slate-700 dark:text-slate-200'}`}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: color }} />
                          <span className="text-xs sm:text-[12.5px] leading-snug" title={row.label}>{row.label}</span>
                        </span>
                        <span className="font-mono text-right shrink-0 pl-1 whitespace-nowrap">
                          <strong className={`text-xs sm:text-sm font-black ${isTop ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                            {row.percent}%
                          </strong>{' '}
                          <span className="text-xs font-bold text-slate-400">({row.count})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dòng tóm tắt phẳng phong cách Neo */}
              <div className="flex items-center justify-between text-xs sm:text-sm text-slate-700 dark:text-slate-300 border-t-2 border-slate-900/10 dark:border-slate-800 pt-3 px-1 font-bold">
                <span>Độ phủ: <strong className="font-mono text-sm sm:text-base font-black text-slate-950 dark:text-white">{errorDiagnosis.rows.length}/7</strong> nhóm bẫy</span>
                <span className="font-semibold text-slate-500 dark:text-slate-400">Ghi nhận từ đề thi thử</span>
              </div>
            </div>
          ) : (
            <div className="py-14 text-center space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                Chưa có lỗi nào trong Sổ Tay Bắt Bẫy.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
                Khi làm đề xong, hãy ghi lại các câu sai kèm lý do vào Sổ tay để hệ thống tự động mổ xẻ bẫy mất điểm cho bạn.
              </p>
            </div>
          )}
        </section>

      </div>

      {/* 2. THẺ BỔ SUNG Ở DƯỚI: CHẨN ĐOÁN ĐÒN BẨY ĐIỂM SỐ & HÀNH ĐỘNG (GỌN GÀNG, KHÔNG RỐI) */}
      {(weakestPart || (errorDiagnosis && errorDiagnosis.total > 0)) && (
        <div className="p-4 sm:p-5 rounded-2xl border-2 border-slate-900 bg-amber-50/80 dark:bg-amber-950/25 dark:border-slate-700 shadow-[3px_3px_0px_0px_#0f172a] dark:shadow-[3px_3px_0px_0px_#cbd5e1] flex flex-col md:flex-row items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-lg shrink-0 border-2 border-slate-900 shadow-2xs">
              <Zap className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h4 className="font-black text-base sm:text-lg text-slate-950 dark:text-white tracking-tight">Chẩn Đoán Đòn Bẩy Điểm Số</h4>
                <span className="text-xs font-black uppercase tracking-wider text-amber-950 bg-amber-300 border-2 border-slate-900 px-2.5 py-0.5 rounded-lg font-mono shadow-2xs">
                  Tiềm năng +{potentialPoints}đ
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 font-semibold leading-relaxed">
                {diagnosticMessage}
              </p>
            </div>
          </div>

          {/* 2 Nút hành động trực tiếp Neo-Brutalism */}
          <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
            {onNavigateToTimer && weakestPart && (
              <button
                type="button"
                onClick={() => {
                  const partType: ReadingPartType = 
                    weakestPart.code === 'P5' ? 'PART_5' :
                    weakestPart.code === 'P6' ? 'PART_6' :
                    weakestPart.code === 'P7' ? 'PART_7' : 'POMODORO';
                  onNavigateToTimer(partType);
                }}
                className="flex-1 md:flex-none px-4.5 py-2.5 rounded-xl border-2 border-slate-900 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white dark:border-slate-600 text-xs sm:text-sm font-black shadow-[2px_2px_0px_0px_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <Timer className="w-4 h-4 text-amber-400 stroke-[2.5]" />
                <span>Bấm giờ {weakestPart.code}</span>
              </button>
            )}
            {onNavigateToMistakes && errorDiagnosis && errorDiagnosis.total > 0 && (
              <button
                type="button"
                onClick={onNavigateToMistakes}
                className="flex-1 md:flex-none px-4.5 py-2.5 rounded-xl border-2 border-slate-900 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black shadow-[2px_2px_0px_0px_#0f172a] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <span>Mở Sổ tay {errorDiagnosis.total} câu sai</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
