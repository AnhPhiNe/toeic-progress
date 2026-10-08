import { useMemo, useState } from 'react';
import { BarChart3, BookOpen, ArrowRight, Timer } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Customized, PieChart, Pie } from 'recharts';
import type { StudySession, MistakeEntry, UserProfile, ErrorCategory, ReadingPartType } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import type { VocabLog } from '@/shared/data/dataBundle';
import { CARD } from '@/shared/ui/surfaces';
import { AnalyticsScopePicker } from '@/features/analytics/components/AnalyticsScopePicker';
import { useChartMotion } from '@/features/analytics/components/useChartMotion';
import { analyticsScopeData, formatAnalyticsNumber as number, type AnalyticsScope } from '@/features/analytics/lib/analyticsScope';
import './analytics.css';

const ERROR_NAMES: Record<ErrorCategory, string> = {
  VOCABULARY_TRAP: 'Bẫy từ vựng & paraphrase', ADVANCED_GRAMMAR: 'Ngữ pháp', TIME_PRESSURE: 'Áp lực thời gian',
  CARELESS_DISTRACTION: 'Đọc lướt / nhìn nhầm', LISTENING_SPEED: 'Tốc độ nghe & nối âm', OTHER: 'Khác'
};
const PART_NAMES = ['Mô tả tranh', 'Hỏi & đáp', 'Hội thoại', 'Bài nói ngắn', 'Điền câu', 'Điền đoạn văn', 'Đọc hiểu văn bản'];
const tooltipClass = 'rounded-xl border-2 border-slate-900 bg-white p-3 text-sm text-slate-900 shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-white';
const actionClass = 'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 px-3 py-2 text-sm font-bold shadow-[2px_2px_0px_#0f172a] dark:border-slate-300 disabled:opacity-40';

interface AnalyticsViewProps {
  profile?: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  vocabLog: VocabLog[];
  theme: 'light' | 'dark';
  onDeleteSession?: (sessionId: string) => void;
  onEditSession?: (session: StudySession) => void;
  onOpenSessionLogger?: (prefill?: { durationMinutes?: number; sessionType?: 'FULL_TEST' | 'PART_PRACTICE' | 'VOCAB' }) => void;
  onNavigateToMistakes?: (sourceNames?: string[]) => void;
  onNavigateToTimer?: (part?: ReadingPartType) => void;
}

export function AnalyticsView({ sessions, mistakes, theme, onOpenSessionLogger, onNavigateToMistakes, onNavigateToTimer }: AnalyticsViewProps) {
  const [scope, setScope] = useState<AnalyticsScope>('latest');
  const barMotion = useChartMotion(500);
  const donutMotion = useChartMotion(600);
  const data = useMemo(() => analyticsScopeData(sessions, mistakes, scope), [sessions, mistakes, scope]);
  const latest = useMemo(() => analyticsScopeData(sessions, [], 'latest').source, [sessions]);
  const isDark = theme === 'dark';
  const partColors = { lc: isDark ? '#818cf8' : '#4f46e5', rc: isDark ? '#2dd4bf' : '#0d9488', weak: isDark ? '#fb7185' : '#f43f5e' };
  const date = data.selected[0]?.date;
  const dateLabel = date ? new Date(`${date}T12:00:00`).toLocaleDateString('vi-VN') : '';
  const chartLabel = data.parts.map(part => `${part.code}: ${Math.round(part.accuracy)}%`).join(', ');
  // Recharts 2 interpolates sectors by index. Keep category identities fixed across filters.
  const donutData = useMemo(() => (Object.keys(ERROR_NAMES) as ErrorCategory[]).map(category =>
    data.errors.find(row => row.category === category) ?? { category, count: 0, percent: 0 }), [data.errors]);
  const priority = data.weakest ? `Ưu tiên Part ${data.weakest.key.slice(4)} (${Math.round(data.weakest.accuracy)}%)${data.errors[0] ? ` và ${ERROR_NAMES[data.errors[0].category].toLocaleLowerCase('vi')}` : ''}.`
    : 'Ghi kết quả đề để xác định Part cần luyện; vẫn có thể xem các lỗi đã lưu.';

  return <div className="analytics-view mx-auto w-full max-w-6xl space-y-5 pb-6 text-slate-800 dark:text-slate-200">
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Đang xem</span>
      <AnalyticsScopePicker value={scope} onChange={setScope} names={data.names} latestName={latest || undefined} resultCount={data.resultCount} />
      <span role="status" className="text-xs text-slate-500 dark:text-slate-400">{data.single ? date ? `Kết quả ngày ${dateLabel}` : 'Chưa nhập kết quả' : `Dữ liệu ${data.selected.length} lượt làm`}</span>
    </div>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section aria-labelledby="analytics-parts-heading" className={`${CARD} analytics-panel flex flex-col !p-5`}>
        <h2 id="analytics-parts-heading" className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><BarChart3 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />Độ chính xác 7 Part</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500 dark:text-slate-400">{data.single ? 'Kết quả mới nhất của đề' : `Tỷ lệ đúng trung bình · ${data.partResults.length} lượt có chi tiết Part`}</p>
        {data.parts.length ? <div className="h-[285px] w-full" role="img" aria-label={`Tỷ lệ đúng theo Part, ${chartLabel}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.parts} margin={{ top: 24, right: 5, left: -20, bottom: 8 }} accessibilityLayer>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
              <XAxis dataKey="code" tick={{ fontSize: 12, fill: isDark ? '#f1f5f9' : '#0f172a', fontWeight: 700 }} tickLine={false} axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1' }} interval={0} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={{ fontSize: 12, fill: isDark ? '#94a3b8' : '#64748b' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: isDark ? '#ffffff08' : '#0f172a05' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const part = payload[0].payload as typeof data.parts[number];
                return <div className={tooltipClass}><strong>Part {part.key.slice(4)}: {PART_NAMES[Number(part.key.slice(4)) - 1]}</strong>
                  <p>Độ chính xác: {number(part.accuracy)}%</p><p>{data.single ? 'Đúng' : 'Đúng trung bình'}: {number(part.correct)}/{part.max} câu</p></div>;
              }} />
              <Bar dataKey="accuracy" radius={[6, 6, 0, 0]} barSize={34} isAnimationActive={barMotion.enabled}
                animationBegin={0} animationDuration={barMotion.duration} animationEasing="ease-out" onAnimationEnd={barMotion.finish}>
                {data.parts.map(part => <Cell key={part.key} fill={part.key === data.weakest?.key ? partColors.weak : Number(part.key.slice(4)) <= 4 ? partColors.lc : partColors.rc} />)}
              </Bar>
              <Customized component={({ xAxisMap, yAxisMap }: { xAxisMap?: Record<string, { scale: ((value: string) => number) & { bandwidth: () => number } }>; yAxisMap?: Record<string, { scale: (value: number) => number }> }) => {
                const x = xAxisMap?.[0]?.scale, y = yAxisMap?.[0]?.scale;
                if (!x || !y) return null;
                // Target labels stay visible and stationary while only the columns move.
                return <g className="analytics-bar-labels" pointerEvents="none">{data.parts.map(part =>
                  <text key={part.key} x={x(part.code) + x.bandwidth() / 2} y={y(part.accuracy) - 8} textAnchor="middle" fill={isDark ? '#f1f5f9' : '#0f172a'} fontSize={12} fontWeight={700}>{Math.round(part.accuracy)}%</text>)}</g>;
              }} />
            </BarChart>
          </ResponsiveContainer>
        </div> : <div className="flex min-h-[285px] flex-col items-center justify-center gap-3 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>Chưa có kết quả hoặc chi tiết Part{data.single ? ' của đề này' : ' trong phạm vi chọn'}.</p>
          {onOpenSessionLogger && <button type="button" onClick={() => onOpenSessionLogger({ sessionType: 'FULL_TEST' })} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Nhập kết quả</button>}
        </div>}
        <div className="mt-auto flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
          {([['Listening', data.listening, 'text-indigo-600 dark:text-indigo-400', 'bg-indigo-600 dark:bg-indigo-400'], ['Reading', data.reading, 'text-teal-600 dark:text-teal-400', 'bg-teal-600 dark:bg-teal-400']] as const).map(([label, section, textClass, dotClass]) =>
            <span key={label} className="flex flex-wrap items-center gap-2" title={section.count ? `${section.count} lượt có điểm ${label}` : undefined}>
              <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden="true" />{label}: <strong className={`font-bold tabular-nums ${textClass}`}>{section.value === null ? 'Chưa ghi' : `${data.single ? '' : 'TB '}${number(section.value)}/495`}</strong>
            </span>)}
        </div>
      </section>
      <section aria-labelledby="analytics-errors-heading" className={`${CARD} analytics-panel flex flex-col !p-5`}>
        <h2 id="analytics-errors-heading" className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><BookOpen className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />Lỗi thường gặp trong Sổ tay</h2>
        <p className="mb-3 mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{data.single ? `Toàn bộ lỗi đã gắn với ${data.source || 'đề được chọn'}` : scope === 'all' ? 'Toàn bộ lỗi đã ghi trong Sổ tay' : 'Lỗi đã ghi của các đề trong phạm vi chọn'}</p>
        {data.notes.length ? <div className="analytics-errors flex-1">
          <div className="analytics-donut relative" role="img" aria-label={`${data.notes.length} lỗi đã ghi: ${data.errors.map(row => `${ERROR_NAMES[row.category]} ${row.count} lỗi`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart data={donutData}><Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as typeof data.errors[number];
                return <div className={tooltipClass}>{ERROR_NAMES[row.category]}: <strong>{row.count} lỗi ({Math.round(row.percent)}%)</strong></div>;
              }} />
                <Pie data={donutData} dataKey="count" nameKey="category" cx="50%" cy="50%" innerRadius="58%" outerRadius="83%"
                  startAngle={90} endAngle={-270} paddingAngle={2} stroke="none" isAnimationActive={donutMotion.enabled}
                  animationBegin={0} animationDuration={donutMotion.duration} animationEasing="ease-out" onAnimationEnd={donutMotion.finish}>
                  {donutData.map(row => <Cell key={row.category} fill={ERROR_CATEGORY_LABELS[row.category].color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-4xl font-black tabular-nums text-slate-950 dark:text-white">{data.notes.length}</strong><span className="mt-1 text-xs text-slate-500 dark:text-slate-400">lỗi đã ghi</span></div>
          </div>
          <dl className="analytics-error-list">
            {data.errors.map(row => <div className="contents" key={row.category}><dt className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ERROR_CATEGORY_LABELS[row.category].color }} aria-hidden="true" /><span>{ERROR_NAMES[row.category]}</span></dt>
              <dd className="whitespace-nowrap text-xs tabular-nums"><strong className="font-bold text-slate-950 dark:text-white">{Math.round(row.percent)}%</strong> <span className="text-slate-500 dark:text-slate-400">({row.count})</span></dd></div>)}
          </dl>
        </div> : <div className="flex min-h-[285px] flex-1 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">Chưa có lỗi nào{data.single ? ' được gắn với đề này' : ' trong phạm vi chọn'}.</div>}
        <p className="mt-auto border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">Thống kê lỗi đã ghi, không phải toàn bộ câu sai khi thi.</p>
      </section>
    </div>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-slate-900 bg-amber-50 p-4 shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-amber-950/25 dark:shadow-[3px_3px_0px_#cbd5e1]">
      <div className="min-w-0 flex-1"><h3 className="text-base font-black text-slate-950 dark:text-white">Ưu tiên luyện tiếp</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{priority}</p></div>
      <div className="flex flex-wrap gap-3">
        {onNavigateToTimer && data.weakest && <button type="button" className={actionClass} onClick={() => onNavigateToTimer(Number(data.weakest!.key.slice(4)) < 5 ? 'POMODORO' : `PART_${data.weakest!.key.slice(4)}` as ReadingPartType)}><Timer className="h-4 w-4" aria-hidden="true" />{Number(data.weakest.key.slice(4)) < 5 ? 'Phiên tập trung' : `Bấm giờ ${data.weakest.code}`}</button>}
        {onNavigateToMistakes && <button type="button" className={`${actionClass} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => onNavigateToMistakes(data.notebookSources)}>{data.single ? 'Mở Sổ tay của đề' : 'Mở Sổ tay'}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
      </div>
    </section>
  </div>;
}
