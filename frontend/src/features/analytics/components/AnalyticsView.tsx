import { useId, useMemo, useState } from 'react';
import { BarChart3, BookOpen, ArrowRight, Timer, Layers } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Customized, PieChart, Pie } from 'recharts';
import type { StudySession, MistakeEntry, UserProfile, ErrorCategory, ReadingPartType } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import type { VocabLog } from '@/shared/data/dataBundle';
import { CARD } from '@/shared/ui/surfaces';
import { AnalyticsScopePicker } from '@/features/analytics/components/AnalyticsScopePicker';
import { useChartMotion } from '@/features/analytics/components/useChartMotion';
import { analyticsScopeData, analyticsAttemptLabel, formatAnalyticsNumber as number } from '@/features/analytics/lib/analyticsScope';
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

export function AnalyticsView({ sessions, mistakes, theme, onOpenSessionLogger, onEditSession, onNavigateToMistakes, onNavigateToTimer }: AnalyticsViewProps) {
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [attemptChoice, setAttemptChoice] = useState<{ source: string; id: string } | null>(null);
  const attemptPickerId = useId();
  const barMotion = useChartMotion(500);
  const donutMotion = useChartMotion(600);
  const data = useMemo(() => analyticsScopeData(sessions, mistakes, sourceKey,
    attemptChoice?.source === sourceKey ? attemptChoice?.id : undefined), [sessions, mistakes, sourceKey, attemptChoice]);
  const isDark = theme === 'dark';
  const partColors = { lc: isDark ? '#818cf8' : '#4f46e5', rc: isDark ? '#2dd4bf' : '#0d9488', weak: isDark ? '#fb7185' : '#f43f5e' };
  const resultStatus = data.attempt ? analyticsAttemptLabel(data.attemptNumber!, data.attempt.date) : 'Chưa nhập kết quả';
  const chartLabel = data.parts.map(part => `${part.code}: ${Math.round(part.accuracy)}%`).join(', ');
  // Recharts 2 interpolates sectors by index. Keep category identities fixed across filters.
  const donutData = useMemo(() => (Object.keys(ERROR_NAMES) as ErrorCategory[]).map(category =>
    data.errors.find(row => row.category === category) ?? { category, count: 0, percent: 0 }), [data.errors]);
  const commonError = data.errors[0] ? ERROR_NAMES[data.errors[0].category].toLocaleLowerCase('vi') : null;
  const priority = data.weakest ? `Ưu tiên Part ${data.weakest.key.slice(4)} (${Math.round(data.weakest.accuracy)}%)${commonError ? ` và ${commonError}` : ''}.`
    : data.parts.length ? `Cả 7 Part đạt 100% trong lượt này.${commonError ? ` Sổ tay ghi nhiều lỗi nhất ở nhóm ${commonError}.` : ''}`
      : commonError ? `Sổ tay ghi nhiều lỗi nhất ở nhóm ${commonError}. ${data.attempt ? 'Bổ sung chi tiết Part của lượt này để xác định Part cần luyện.' : 'Ghi kết quả đề để xác định Part cần luyện.'}`
        : 'Ghi kết quả đề để xác định Part cần luyện; vẫn có thể xem các lỗi đã lưu.';

  return <div className="analytics-view mx-auto w-full max-w-6xl space-y-5 pb-6 text-slate-800 dark:text-slate-200">
    <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
      <div role="group" aria-label="Đề" className="min-w-0 max-w-full space-y-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Đề</p>
        <AnalyticsScopePicker value={data.sourceKey} onChange={key => { setSourceKey(key); setAttemptChoice(null); }} names={data.names} />
      </div>
      <div className="min-w-0 max-w-full space-y-2">
        <label htmlFor={attemptPickerId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Lần làm</label>
        <select id={attemptPickerId} value={data.attempt?.id ?? ''} disabled={!data.attempts.length} onChange={event => { setSourceKey(data.sourceKey); setAttemptChoice({ source: data.sourceKey, id: event.target.value }); }} className="min-h-11 max-w-full cursor-pointer rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:cursor-default disabled:opacity-60 dark:border-slate-600 dark:bg-[#111A2C] dark:text-white">
          {!data.attempts.length && <option value="">Chưa có lượt làm</option>}
          {data.attempts.map(row => <option key={row.session.id} value={row.session.id}>{analyticsAttemptLabel(row.number, row.session.date, row.latest)}</option>)}
        </select>
      </div>
    </div>
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section aria-labelledby="analytics-parts-heading" className={`${CARD} analytics-panel flex flex-col !p-5`}>
        <div className="analytics-chart-header mb-3">
          <h2 id="analytics-parts-heading" className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><BarChart3 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />Độ chính xác 7 Part</h2>
          <span role="status" className="analytics-result-date">{resultStatus}</span>
        </div>
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
                  <p>Độ chính xác: {number(part.accuracy)}%</p><p>Đúng: {number(part.correct)}/{part.max} câu</p></div>;
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
          <p>{data.attempt ? 'Lượt này chưa có chi tiết Part.' : 'Chưa nhập kết quả của đề này.'}</p>
          {data.attempt && onEditSession ? <button type="button" onClick={() => onEditSession(data.attempt!)} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Bổ sung chi tiết</button>
            : !data.attempt && onOpenSessionLogger && <button type="button" onClick={() => onOpenSessionLogger({ sessionType: 'FULL_TEST' })} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Nhập kết quả</button>}
        </div>}
        <div className="mt-auto flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
          {([['Listening', data.listening, 'text-indigo-600 dark:text-indigo-400', 'bg-indigo-600 dark:bg-indigo-400'], ['Reading', data.reading, 'text-teal-600 dark:text-teal-400', 'bg-teal-600 dark:bg-teal-400']] as const).map(([label, section, textClass, dotClass]) =>
            <span key={label} className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden="true" />{label}: <strong className={`font-bold tabular-nums ${textClass}`}>{section.value === null ? 'Chưa ghi' : `${number(section.value)}/495`}</strong>
            </span>)}
        </div>
      </section>
      <section aria-labelledby="analytics-errors-heading" className={`${CARD} analytics-panel flex flex-col !p-5`}>
        <h2 id="analytics-errors-heading" className="mb-3 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><BookOpen className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />Lỗi đã ghi của đề</h2>
        {data.notes.length ? <div className="analytics-errors flex-1">
          <div className="analytics-donut relative" role="img" aria-describedby="analytics-errors-scope" aria-label={`${data.notes.length} lỗi đã ghi: ${data.errors.map(row => `${ERROR_NAMES[row.category]} ${row.count} lỗi`).join(', ')}`}>
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
        </div> : <div className="flex min-h-[285px] flex-1 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">Chưa có lỗi nào được gắn với đề này.</div>}
        <p id="analytics-errors-scope" className="mt-auto flex items-center gap-2 border-t border-slate-200 pt-3 text-sm font-semibold text-amber-800 dark:border-slate-700 dark:text-amber-200"><Layers className="h-4 w-4 shrink-0" aria-hidden="true" />Gồm các lần làm của đề</p>
      </section>
      </div>
    </div>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-slate-900 bg-amber-50 p-4 shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-amber-950/25 dark:shadow-[3px_3px_0px_#cbd5e1]">
      <div className="min-w-0 flex-1"><h3 className="text-base font-black text-slate-950 dark:text-white">Ưu tiên luyện tiếp</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{priority}</p></div>
      <div className="flex flex-wrap gap-3">
        {onNavigateToTimer && data.weakest && <button type="button" className={actionClass} onClick={() => onNavigateToTimer(Number(data.weakest!.key.slice(4)) < 5 ? 'POMODORO' : `PART_${data.weakest!.key.slice(4)}` as ReadingPartType)}><Timer className="h-4 w-4" aria-hidden="true" />{Number(data.weakest.key.slice(4)) < 5 ? 'Phiên tập trung' : `Bấm giờ ${data.weakest.code}`}</button>}
        {onNavigateToMistakes && <button type="button" className={`${actionClass} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => onNavigateToMistakes(data.notebookSources)}>Mở Sổ tay của đề<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
      </div>
    </section>
  </div>;
}
