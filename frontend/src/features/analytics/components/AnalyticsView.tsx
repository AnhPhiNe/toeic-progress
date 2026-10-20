import { useId, useMemo, useState } from 'react';
import { BookOpen, ArrowRight, Timer, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import type { StudySession, MistakeEntry, UserProfile, ErrorCategory, ReadingPartType } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import type { VocabLog } from '@/shared/data/dataBundle';
import { CARD } from '@/shared/ui/surfaces';
import { AnalyticsScopePicker } from '@/features/analytics/components/AnalyticsScopePicker';
import { useChartMotion } from '@/features/analytics/components/useChartMotion';
import { analyticsScopeData, analyticsAttemptLabel, formatAnalyticsNumber as number } from '@/features/analytics/lib/analyticsScope';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { testNameKey } from '@/shared/domain/testNames';
import { Sheet } from '@/app/components/MobileNav';
import './analytics.css';

const ERROR_NAMES: Record<ErrorCategory, string> = {
  VOCABULARY_TRAP: 'Bẫy từ vựng & paraphrase', ADVANCED_GRAMMAR: 'Ngữ pháp', TIME_PRESSURE: 'Áp lực thời gian',
  CARELESS_DISTRACTION: 'Đọc lướt / nhìn nhầm', LISTENING_SPEED: 'Tốc độ nghe & nối âm', OTHER: 'Khác'
};
const PART_NAMES = ['Mô tả tranh', 'Hỏi & đáp', 'Hội thoại', 'Bài nói ngắn', 'Điền câu', 'Điền đoạn văn', 'Đọc hiểu văn bản'];
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

export function AnalyticsView({ sessions, mistakes, onOpenSessionLogger, onEditSession, onNavigateToMistakes, onNavigateToTimer }: AnalyticsViewProps) {
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [attemptChoice, setAttemptChoice] = useState<{ source: string; id: string } | null>(null);
  const [activeError, setActiveError] = useState<ErrorCategory | null>(null);
  const attemptPickerId = useId();
  // Phones: horizontal Part bars, one-line mistake summary, the practice button above the bottom bar.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Widening past the phone breakpoint drops the sheet so it does not reappear on the next narrow resize.
  if (!isPhone && pickerOpen) setPickerOpen(false);
  const donutMotion = useChartMotion(600);
  const data = useMemo(() => analyticsScopeData(sessions, mistakes, sourceKey,
    attemptChoice?.source === sourceKey ? attemptChoice?.id : undefined), [sessions, mistakes, sourceKey, attemptChoice]);
  const resultStatus = data.attempt ? analyticsAttemptLabel(data.attemptNumber!, data.attempt.date) : 'Chưa nhập kết quả';
  const chartLabel = data.parts.map(part => `${part.code}: ${Math.round(part.accuracy)}%`).join(', ');
  // Recharts 2 interpolates sectors by index. Keep category identities fixed across filters.
  const donutData = useMemo(() => (Object.keys(ERROR_NAMES) as ErrorCategory[]).map(category =>
    data.errors.find(row => row.category === category) ?? { category, count: 0, percent: 0 }), [data.errors]);
  const highlightedError = data.errors.find(row => row.category === activeError);
  const commonError = data.errors[0] ? ERROR_NAMES[data.errors[0].category].toLocaleLowerCase('vi') : null;
  const priority = data.weakest ? `Ưu tiên Part ${data.weakest.key.slice(4)} (còn ${data.weakest.lost} câu ≈ ${data.weakest.lost * 5} điểm)${commonError ? ` và ${commonError}` : ''}.`
    : data.parts.length ? `Cả 7 Part đạt 100% trong lượt này.${commonError ? ` Sổ tay ghi nhiều lỗi nhất ở nhóm ${commonError}.` : ''}`
      : commonError ? `Sổ tay ghi nhiều lỗi nhất ở nhóm ${commonError}. ${data.attempt ? 'Bổ sung chi tiết Part của lượt này để xác định Part cần luyện.' : 'Ghi kết quả đề để xác định Part cần luyện.'}`
        : 'Ghi kết quả đề để xác định Part cần luyện; vẫn có thể xem các lỗi đã lưu.';

  const scopePickers = <>
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
  </>;

  if (isPhone) {
    const sourceName = data.names.find(name => testNameKey(name) === data.sourceKey) ?? 'Chưa có đề';
    const weakPart = data.weakest ? Number(data.weakest.key.slice(4)) : null;
    // One category keeps the row to two lines however many notes the test has; the notebook lists the rest.
    const errorLine = data.errors[0] ? `Hay sai nhất: ${ERROR_NAMES[data.errors[0].category]} (${data.errors[0].count})` : '';
    const lostRows = [...data.parts].sort((a, b) => b.lost - a.lost || a.accuracy - b.accuracy);
    const mostLost = Math.max(1, lostRows[0]?.lost ?? 0);
    const lostIn = (from: number, to: number) => data.parts.filter(part => { const n = Number(part.key.slice(4)); return n >= from && n <= to; }).reduce((sum, part) => sum + part.lost, 0);
    const totalLost = lostIn(1, 7), totalMax = data.parts.reduce((sum, part) => sum + part.max, 0);
    return <div className="analytics-view space-y-4 pb-24 text-slate-800 dark:text-slate-200">
      <button type="button" onClick={() => setPickerOpen(true)} aria-haspopup="dialog" aria-label={`Chọn đề và lần làm: ${sourceName}, ${resultStatus}`}
        className="flex min-h-[50px] w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-[1.5px] border-stone-300 bg-white px-4 text-left dark:border-slate-700 dark:bg-[#111A2C]">
        <span className="min-w-0 truncate"><span className="text-[15px] font-black text-slate-950 dark:text-white">{sourceName}</span><span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400"> · {resultStatus}</span></span>
        <ChevronDown className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      </button>

      <section aria-labelledby="analytics-parts-heading" className="analytics-panel rounded-2xl border-2 border-slate-900 bg-white px-4 py-3.5 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="analytics-parts-heading" className="text-[15px] font-black text-slate-950 dark:text-white">Mất điểm ở đâu</h2>
          {data.parts.length > 0 && <span className="text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">Sai {totalLost} / {totalMax} câu</span>}
        </div>
        {data.parts.length > 0 && <p className="mt-0.5 text-[12px] font-bold tabular-nums">
          <span className="text-indigo-600 dark:text-indigo-400">● Listening {lostIn(1, 4)}</span><span className="ml-3 text-teal-600 dark:text-teal-400">● Reading {lostIn(5, 7)}</span>
        </p>}
        {data.parts.length ? <ol className="mt-2.5 space-y-1" aria-label={`Số câu sai theo Part, ${chartLabel}`}>
          {lostRows.map(part => {
            const n = Number(part.key.slice(4)), weak = part.key === data.weakest?.key;
            const tone = weak ? 'bg-rose-600' : n <= 4 ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-teal-600 dark:bg-teal-400';
            return <li key={part.key} className={'flex items-center gap-3 rounded-xl py-1 ' + (weak ? '-mx-2 bg-rose-50 px-2 py-1.5 dark:bg-rose-950/40' : '')}
              title={`Part ${n}: ${PART_NAMES[n - 1]}`}>
              <span className={'flex h-[26px] w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-black text-white ' + (weak ? 'bg-rose-600' : n <= 4 ? 'bg-indigo-600' : 'bg-teal-600')}>{part.code}</span>
              <span className="block h-2 flex-1" aria-hidden="true">{part.lost > 0 && <span className={'block h-full rounded-full ' + tone} style={{ width: `${part.lost / mostLost * 100}%` }} />}</span>
              <span className="w-[76px] shrink-0 text-right leading-tight">
                <span className={'block text-[14px] font-black tabular-nums ' + (weak ? 'text-rose-600 dark:text-rose-400' : 'text-slate-950 dark:text-white')}>{part.lost} câu</span>
                <span className="block text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">đúng {Math.round(part.accuracy)}%</span>
              </span>
            </li>;
          })}
        </ol> : <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>{data.attempt ? 'Lượt này chưa có chi tiết Part.' : 'Chưa nhập kết quả của đề này.'}</p>
          {data.attempt && onEditSession ? <button type="button" onClick={() => onEditSession(data.attempt!)} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Bổ sung chi tiết</button>
            : !data.attempt && onOpenSessionLogger && <button type="button" onClick={() => onOpenSessionLogger({ sessionType: 'FULL_TEST' })} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Nhập kết quả</button>}
        </div>}
      </section>

      <button type="button" onClick={() => onNavigateToMistakes?.(data.notebookSources)} disabled={!onNavigateToMistakes}
        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-stone-300 bg-white px-4 py-3 text-left dark:border-slate-700 dark:bg-[#111A2C]">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-slate-900 dark:text-white">{data.notes.length ? `${data.notes.length} lỗi đã ghi của đề` : 'Chưa có lỗi nào gắn với đề này'}</span>
          {errorLine && <span className="mt-0.5 block truncate text-[13px] font-semibold text-slate-500 dark:text-slate-400">{errorLine}</span>}
        </span>
        <span className="flex shrink-0 items-center text-[13.5px] font-black text-blue-600 dark:text-blue-400">Sổ tay<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
      </button>

      {/* The next practice step sits above the bottom navigation, within thumb reach. */}
      {onNavigateToTimer && weakPart !== null && <div className="fixed inset-x-0 bottom-[calc(4rem+2px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7] to-transparent px-4 pb-3 pt-6 dark:from-[#070C16] dark:via-[#070C16]">
        <button type="button" onClick={() => onNavigateToTimer(weakPart < 5 ? 'POMODORO' : `PART_${weakPart}` as ReadingPartType)}
          className="flex h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-emerald-400 text-base font-black text-slate-950 shadow-[3px_3px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 dark:shadow-none">
          <Timer className="h-5 w-5" aria-hidden="true" />{weakPart < 5 ? `Phiên tập trung · ${data.weakest!.code} còn ${data.weakest!.lost} câu` : `Luyện ${data.weakest!.code} · còn ${data.weakest!.lost} câu`}
        </button>
      </div>}

      {pickerOpen && <Sheet title="Chọn đề và lần làm" onClose={() => setPickerOpen(false)}>
        <div className="space-y-4 pb-2">{scopePickers}</div>
      </Sheet>}
    </div>;
  }

  const lostRows = [...data.parts].sort((a, b) => b.lost - a.lost || a.accuracy - b.accuracy);
  const mostLost = Math.max(1, lostRows[0]?.lost ?? 0);
  const perfect = data.parts.filter(part => part.lost === 0).map(part => part.code);
  const wrongQuestions = data.attempt?.sessionType === 'FULL_TEST' ? data.attempt.wrongQuestions : undefined;

  return <div className="analytics-view mx-auto w-full max-w-6xl space-y-4 pb-6 text-slate-800 dark:text-slate-200">
    <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
      {scopePickers}
    </div>
    {/* Only a test logged by its wrong questions knows where they sit; others skip the map. */}
    {wrongQuestions && <QuestionMap wrong={wrongQuestions} />}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-labelledby="analytics-parts-heading" className={`${CARD} analytics-panel flex flex-col !px-5 !py-4`}>
        <h2 id="analytics-parts-heading" className="mb-2 text-lg font-black text-slate-950 dark:text-white">Mất điểm ở đâu</h2>
        {data.parts.length ? <>
          <ol className="space-y-0.5" aria-label={`Tỷ lệ đúng theo Part, ${chartLabel}`}>
            {lostRows.filter(part => part.lost > 0).map(part => {
              const n = Number(part.key.slice(4)), weak = part.key === data.weakest?.key;
              return <li key={part.key} className={'flex items-center gap-3 rounded-xl px-2 py-1 ' + (weak ? 'bg-rose-50 dark:bg-rose-950/40' : '')} title={`Part ${n}: ${PART_NAMES[n - 1]}`}>
                <span className={'flex h-[26px] w-9 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 text-[12px] font-black text-white dark:border-slate-300 ' + (weak ? 'bg-rose-600' : n <= 4 ? 'bg-indigo-600' : 'bg-teal-600')}>{part.code}</span>
                <span className="block h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                  <span className={'block h-full rounded-full ' + (weak ? 'bg-rose-600' : n <= 4 ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-teal-600 dark:bg-teal-400')} style={{ width: `${part.lost / mostLost * 100}%` }} />
                </span>
                <span className="w-[72px] shrink-0 text-right leading-tight">
                  <span className={'block text-[14px] font-black tabular-nums ' + (weak ? 'text-rose-600 dark:text-rose-400' : 'text-slate-950 dark:text-white')}>{part.lost} câu</span>
                  <span className="block text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">đúng {Math.round(part.accuracy)}%</span>
                </span>
              </li>;
            })}
          </ol>
          {perfect.length > 0 && <p className="mt-2 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{perfect.join(', ')}: đúng hết</p>}
        </> : <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center text-sm text-slate-500 dark:text-slate-400">
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
      <section aria-labelledby="analytics-errors-heading" className={`${CARD} analytics-panel flex flex-col !px-5 !py-4`}>
        <h2 id="analytics-errors-heading" className="mb-3 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white"><BookOpen className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />Lỗi đã ghi của đề</h2>
        {data.notes.length ? <div className="analytics-errors flex-1">
          <div className="analytics-donut relative" role="img" aria-describedby="analytics-errors-scope" aria-label={`${data.notes.length} lỗi đã ghi: ${data.errors.map(row => `${ERROR_NAMES[row.category]} ${row.count} lỗi`).join(', ')}`}>
            <div className="analytics-donut-chart relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart data={donutData}>
                <Pie data={donutData} dataKey="count" nameKey="category" cx="50%" cy="50%" innerRadius="58%" outerRadius="83%"
                  startAngle={90} endAngle={-270} paddingAngle={2} stroke="none" isAnimationActive={donutMotion.enabled}
                  onMouseEnter={row => setActiveError(row.category)} onMouseLeave={() => setActiveError(null)}
                  onFocus={row => setActiveError(row.category)} onBlur={() => setActiveError(null)}
                  animationBegin={0} animationDuration={donutMotion.duration} animationEasing="ease-out" onAnimationEnd={donutMotion.finish}>
                  {donutData.map(row => <Cell key={row.category} fill={ERROR_CATEGORY_LABELS[row.category].color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-4xl font-black tabular-nums text-slate-950 dark:text-white">{data.notes.length}</strong><span className="mt-1 text-xs text-slate-500 dark:text-slate-400">lỗi đã ghi</span></div>
            </div>
            <div className="analytics-donut-detail min-h-11 pt-1 text-center text-xs leading-4 text-slate-600 dark:text-slate-300" aria-hidden="true">
              {highlightedError && <><p className="font-semibold text-slate-900 dark:text-white">{ERROR_NAMES[highlightedError.category]}</p><p>{highlightedError.count} lỗi · {Math.round(highlightedError.percent)}%</p></>}
            </div>
          </div>
          <dl className="analytics-error-list">
            {data.errors.map(row => <div className="contents" key={row.category}><dt className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ERROR_CATEGORY_LABELS[row.category].color }} aria-hidden="true" /><span>{ERROR_NAMES[row.category]}</span></dt>
              <dd className="whitespace-nowrap text-xs tabular-nums"><strong className="font-bold text-slate-950 dark:text-white">{Math.round(row.percent)}%</strong> <span className="text-slate-500 dark:text-slate-400">({row.count})</span></dd></div>)}
          </dl>
        </div> : <div className="flex min-h-[285px] flex-1 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">Chưa có lỗi nào được gắn với đề này.</div>}
        <p id="analytics-errors-scope" className="mt-auto flex items-center gap-2 border-t border-slate-200 pt-3 text-sm font-semibold text-amber-800 dark:border-slate-700 dark:text-amber-200"><Layers className="h-4 w-4 shrink-0" aria-hidden="true" />Gồm các lần làm của đề</p>
      </section>
    </div>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-slate-900 bg-amber-50 p-4 shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-amber-950/25 dark:shadow-[3px_3px_0px_#cbd5e1]">
      <div className="min-w-[min(100%,16rem)] flex-1"><h3 className="text-base font-black text-slate-950 dark:text-white">Ưu tiên luyện tiếp</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{priority}</p></div>
      <div className="flex flex-wrap gap-3">
        {onNavigateToTimer && data.weakest && <button type="button" className={actionClass} onClick={() => onNavigateToTimer(Number(data.weakest!.key.slice(4)) < 5 ? 'POMODORO' : `PART_${data.weakest!.key.slice(4)}` as ReadingPartType)}><Timer className="h-4 w-4" aria-hidden="true" />{Number(data.weakest.key.slice(4)) < 5 ? 'Phiên tập trung' : `Bấm giờ ${data.weakest.code}`}</button>}
        {onNavigateToMistakes && <button type="button" className={`${actionClass} bg-blue-600 text-white hover:bg-blue-700`} onClick={() => onNavigateToMistakes(data.notebookSources)}>Mở Sổ tay của đề<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
      </div>
    </section>
  </div>;
}

const MAP_PARTS: Array<[number, number, number]> = [[1, 1, 6], [2, 7, 31], [3, 32, 70], [4, 71, 100], [5, 101, 130], [6, 131, 146], [7, 147, 200]];

/** Where in the 200 questions the wrong answers sit: one band per Part, a red mark per wrong question. */
function QuestionMap({ wrong }: { wrong: number[] }) {
  const listening = wrong.filter(q => q <= 100).length;
  return <section aria-labelledby="analytics-map-heading" className={`${CARD} !px-5 !py-4`}>
    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id="analytics-map-heading" className="text-lg font-black text-slate-950 dark:text-white">Bản đồ 200 câu</h2>
      <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">sai {wrong.length} câu</span>
      <span className="ml-auto flex gap-4 text-xs font-bold">
        <span className="text-indigo-600 dark:text-indigo-400">● Listening {listening}</span>
        <span className="text-teal-600 dark:text-teal-400">● Reading {wrong.length - listening}</span>
      </span>
    </div>
    <div role="img" aria-label={wrong.length ? `Câu sai: ${wrong.join(', ')}` : 'Không sai câu nào'}>
      <div className="flex h-10 overflow-hidden rounded-xl border-2 border-slate-900 dark:border-slate-300">
        {MAP_PARTS.map(([part, first, last]) => <div key={part} style={{ flex: last - first + 1 }}
          className={'relative border-slate-900 dark:border-slate-300 ' + (part > 1 ? 'border-l-2 ' : '') + (part <= 4 ? 'bg-indigo-100 dark:bg-indigo-950' : 'bg-teal-100 dark:bg-teal-950')}>
          {wrong.filter(q => q >= first && q <= last).map(q => <span key={q} title={`Câu ${q}`}
            className="absolute inset-y-1 w-1.5 -translate-x-1/2 rounded-full bg-rose-600 ring-1 ring-white dark:ring-slate-900" style={{ left: `${(q - first + 0.5) / (last - first + 1) * 100}%` }} />)}
        </div>)}
      </div>
      <div className="mt-1.5 flex text-xs font-black" aria-hidden="true">
        {MAP_PARTS.map(([part, first, last]) => <span key={part} style={{ flex: last - first + 1 }}
          className={'min-w-0 truncate pl-1 ' + (part <= 4 ? 'text-indigo-600 dark:text-indigo-400' : 'text-teal-600 dark:text-teal-400')}>P{part}</span>)}
      </div>
    </div>
  </section>;
}
