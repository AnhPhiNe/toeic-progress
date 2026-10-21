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





  const scopePickers = <>
    <div role="group" aria-label="Đề" className="min-w-0 max-w-full space-y-1.5 md:space-y-0">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 md:sr-only">Đề</p>
      <AnalyticsScopePicker value={data.sourceKey} onChange={key => { setSourceKey(key); setAttemptChoice(null); }} names={data.names} />
    </div>
    <div className="min-w-0 max-w-full space-y-1.5 md:space-y-0">
      <label htmlFor={attemptPickerId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 md:sr-only">Lần làm</label>
      <select id={attemptPickerId} value={data.attempt?.id ?? ''} disabled={!data.attempts.length} onChange={event => { setSourceKey(data.sourceKey); setAttemptChoice({ source: data.sourceKey, id: event.target.value }); }} className="min-h-10 max-w-full cursor-pointer rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm disabled:cursor-default disabled:opacity-60 dark:border-slate-600 dark:bg-[#111A2C] dark:text-white">
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
    const partsWithLoss = lostRows.filter(part => part.lost > 0);
    const perfectParts = data.parts.filter(part => part.lost === 0);
    const lostIn = (from: number, to: number) => data.parts.filter(part => { const n = Number(part.key.slice(4)); return n >= from && n <= to; }).reduce((sum, part) => sum + part.lost, 0);
    const totalLost = lostIn(1, 7);

    return <div className="analytics-view space-y-3 pb-20 text-slate-800 dark:text-slate-200">
      {/* 1. Bộ chọn đề & lần làm */}
      <button type="button" onClick={() => setPickerOpen(true)} aria-haspopup="dialog" aria-label={`Chọn đề và lần làm: ${sourceName}, ${resultStatus}`}
        className="flex min-h-[50px] w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-white px-4 text-left shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[2px_2px_0_0_#cbd5e1]">
        <span className="min-w-0 truncate">
          <span className="text-[15px] font-black text-slate-950 dark:text-white">{sourceName}</span>
          <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400"> · {resultStatus}</span>
        </span>
        <ChevronDown className="h-[18px] w-[18px] shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      </button>

      {/* 2. Thẻ Sổ tay câu sai được đẩy lên trên - không còn bị khuất ở đáy */}
      <button type="button" onClick={() => onNavigateToMistakes?.(data.notebookSources)} disabled={!onNavigateToMistakes}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-white p-3 text-left shadow-[2px_2px_0_0_#0f172a] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[2px_2px_0_0_#cbd5e1]">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-black leading-tight text-slate-950 dark:text-white">
              {data.notes.length ? `${data.notes.length} lỗi đã ghi của đề` : 'Chưa có lỗi nào gắn với đề này'}
            </span>
            {errorLine ? (
              <span className="mt-0.5 block truncate text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">
                {errorLine}
              </span>
            ) : (
              <span className="mt-0.5 block text-[11.5px] font-semibold text-slate-400 dark:text-slate-500">
                Lưu câu sai vào sổ tay để ôn lại
              </span>
            )}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-600 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
          <span>Sổ tay</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>

      {/* 3. Tháp Điểm Yếu: Tập trung các Part bị mất điểm */}
      <section aria-labelledby="analytics-parts-heading" className="analytics-panel space-y-2.5 rounded-2xl border-2 border-slate-900 bg-white p-3.5 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="analytics-parts-heading" className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
            Mất điểm ở đâu
          </h2>
          {data.parts.length > 0 && (
            <span className="text-[11.5px] font-extrabold tabular-nums text-slate-500 dark:text-slate-400">
              Tổng sai {totalLost} câu
            </span>
          )}
        </div>

        {data.parts.length ? (
          partsWithLoss.length > 0 ? (
            <ol className="space-y-2 text-xs" aria-label={`Số câu sai theo Part, ${chartLabel}`}>
              {partsWithLoss.map(part => {
                const n = Number(part.key.slice(4));
                const weak = part.key === data.weakest?.key;
                const toneBg = weak
                  ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200'
                  : n <= 4
                  ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-200'
                  : 'bg-teal-50/70 border-teal-200 text-teal-900 dark:bg-teal-950/40 dark:border-teal-900 dark:text-teal-200';
                const toneBar = weak
                  ? 'bg-rose-600 dark:bg-rose-500'
                  : n <= 4
                  ? 'bg-indigo-600 dark:bg-indigo-500'
                  : 'bg-teal-600 dark:bg-teal-500';
                const toneTrack = weak
                  ? 'bg-rose-200/80 border-rose-300 dark:bg-rose-900/60 dark:border-rose-800'
                  : n <= 4
                  ? 'bg-indigo-200/80 border-indigo-300 dark:bg-indigo-900/60 dark:border-indigo-800'
                  : 'bg-teal-200/80 border-teal-300 dark:bg-teal-900/60 dark:border-teal-800';
                const labelColor = weak
                  ? 'text-rose-700 dark:text-rose-400'
                  : n <= 4
                  ? 'text-indigo-700 dark:text-indigo-400'
                  : 'text-teal-700 dark:text-teal-400';

                return (
                  <li key={part.key} className={`rounded-xl border p-2.5 ${toneBg}`}>
                    <div className="mb-1.5 flex items-center justify-between font-black">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[12.5px] ${labelColor}`}>
                          {part.code} · {PART_NAMES[n - 1]}
                        </span>
                        {weak && (
                          <span className="rounded bg-rose-200/90 px-1.5 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                            Yếu nhất
                          </span>
                        )}
                      </div>
                      <span className="tabular-nums text-[12px] font-bold">
                        {part.lost} câu <span className="opacity-75">({Math.round(part.accuracy)}%)</span>
                      </span>
                    </div>
                    <div className={`h-2.5 overflow-hidden rounded-full border ${toneTrack}`}>
                      <div className={`h-full rounded-full transition-all duration-300 ${toneBar}`} style={{ width: `${Math.round(part.accuracy)}%` }} />
                    </div>
                  </li>
                );
              })}

              {perfectParts.length > 0 && (
                <li className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-[11.5px] font-extrabold text-emerald-700 dark:border-slate-800 dark:text-emerald-400">
                  <span>✓ Part làm trọn vẹn 100%:</span>
                  <div className="flex flex-wrap gap-1">
                    {perfectParts.map(part => (
                      <span key={part.key} className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-black text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {part.code}
                      </span>
                    ))}
                  </div>
                </li>
              )}
            </ol>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              🎉 Xuất sắc! Bạn làm đúng 100% tất cả các Part trong lần thi này.
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>{data.attempt ? 'Lượt này chưa có chi tiết Part.' : 'Chưa nhập kết quả của đề này.'}</p>
            {data.attempt && onEditSession ? (
              <button type="button" onClick={() => onEditSession(data.attempt!)} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Bổ sung chi tiết</button>
            ) : !data.attempt && onOpenSessionLogger && (
              <button type="button" onClick={() => onOpenSessionLogger({ sessionType: 'FULL_TEST' })} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Nhập kết quả</button>
            )}
          </div>
        )}
      </section>

      {/* 4. Nút hành động luyện tập trong luồng cuộn (không che khuất nội dung hay navigation) */}
      {onNavigateToTimer && weakPart !== null && (
        <button
          type="button"
          onClick={() => onNavigateToTimer(weakPart < 5 ? 'POMODORO' : `PART_${weakPart}` as ReadingPartType)}
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-emerald-400 text-xs font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] transition-all hover:bg-emerald-300 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-200 dark:bg-emerald-400 dark:text-slate-950 dark:shadow-none"
        >
          <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {weakPart < 5
              ? `Phiên tập trung · ${data.weakest!.code} còn ${data.weakest!.lost} câu`
              : `Luyện tốc độ ${data.weakest!.code} ngay · còn ${data.weakest!.lost} câu`}
          </span>
        </button>
      )}

      {pickerOpen && <Sheet title="Chọn đề và lần làm" onClose={() => setPickerOpen(false)}>
        <div className="space-y-4 pb-2">{scopePickers}</div>
      </Sheet>}
    </div>;
  }

  const lostRows = [...data.parts].sort((a, b) => b.lost - a.lost || a.accuracy - b.accuracy);
  const mostLost = Math.max(1, lostRows[0]?.lost ?? 0);
  const perfect = data.parts.filter(part => part.lost === 0).map(part => part.code);


  return <div className="analytics-view mx-auto w-full max-w-6xl space-y-4 pb-6 text-slate-800 dark:text-slate-200">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {scopePickers}
      </div>
      {data.attempt && (
        <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-slate-100/90 px-4 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
          <span>Tổng điểm: <strong className="text-sm font-black tabular-nums text-slate-950 dark:text-white">{data.attempt.totalScore !== undefined ? number(data.attempt.totalScore) : '—'}</strong><span className="text-slate-400">/990</span></span>
          {data.parts.length > 0 && (
            <>
              <span className="h-3.5 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
              <span>Sai <strong className="tabular-nums text-slate-900 dark:text-white">{data.parts.reduce((s, p) => s + p.lost, 0)}/{data.parts.reduce((s, p) => s + p.max, 0)}</strong> câu</span>
            </>
          )}
        </div>
      )}
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-labelledby="analytics-parts-heading" className={`${CARD} analytics-panel flex flex-col !px-5 !py-4`}>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="analytics-parts-heading" className="text-lg font-black text-slate-950 dark:text-white">Mất điểm ở đâu</h2>
          {data.parts.length > 0 && perfect.length > 0 && (
            perfect.length === 7 ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-xs font-bold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✓ Cả 7 Part đạt 100% trong lượt này
              </span>
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-xs font-bold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                ✓ {perfect.join(', ')}: đúng hết
              </span>
            )
          )}
        </div>
        {data.parts.length ? <>
          <ol className="space-y-2" aria-label={`Tỷ lệ đúng theo Part, ${chartLabel}`}>
            {lostRows.filter(part => part.lost > 0).map(part => {
              const n = Number(part.key.slice(4)), weak = part.key === data.weakest?.key;
              return <li key={part.key} className={'flex items-center gap-3 rounded-xl px-2 py-1 ' + (weak ? 'bg-rose-50 dark:bg-rose-950/40' : '')} title={`Part ${n}: ${PART_NAMES[n - 1]}`}>
                <div className="flex w-[136px] min-w-0 shrink-0 items-center gap-2.5">
                  <span className={'flex h-7 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white ' + (weak ? 'bg-rose-600' : n <= 4 ? 'bg-indigo-600' : 'bg-teal-600')}>{part.code}</span>
                  <span className={'truncate text-xs font-semibold ' + (weak ? 'font-bold text-rose-950 dark:text-rose-200' : 'text-slate-700 dark:text-slate-300')}>{PART_NAMES[n - 1]}</span>
                </div>
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
          {perfect.length === 7 && (
            <div className="my-auto flex flex-col items-center justify-center py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <span className="text-xl">🎉</span>
              </div>
              <p className="mt-2.5 text-sm font-black text-slate-900 dark:text-white">Xuất sắc! Đạt điểm tuyệt đối mọi Part</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Tất cả 7 phần thi đều đúng 100% trong lượt làm này.</p>
            </div>
          )}
        </> : <div className="my-auto flex flex-col items-center justify-center gap-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>{data.attempt ? 'Lượt này chưa có chi tiết Part.' : 'Chưa nhập kết quả của đề này.'}</p>
          {data.attempt && onEditSession ? <button type="button" onClick={() => onEditSession(data.attempt!)} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Bổ sung chi tiết</button>
            : !data.attempt && onOpenSessionLogger && <button type="button" onClick={() => onOpenSessionLogger({ sessionType: 'FULL_TEST' })} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Nhập kết quả</button>}
        </div>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3.5 text-sm dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            {([['Listening', data.listening, 'text-indigo-600 dark:text-indigo-400', 'bg-indigo-600 dark:bg-indigo-400'], ['Reading', data.reading, 'text-teal-600 dark:text-teal-400', 'bg-teal-600 dark:bg-teal-400']] as const).map(([label, section, textClass, dotClass]) =>
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden="true" />{label}: <strong className={`font-bold tabular-nums ${textClass}`}>{section.value === null ? 'Chưa ghi' : `${number(section.value)}/495`}</strong>
              </span>)}
          </div>
          {onNavigateToTimer && data.weakest && (
            <button
              type="button"
              className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-slate-900 bg-amber-50 px-3.5 py-1.5 text-xs font-extrabold text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-amber-100 dark:border-slate-300 dark:bg-amber-950/40 dark:text-white"
              onClick={() => onNavigateToTimer(Number(data.weakest!.key.slice(4)) < 5 ? 'POMODORO' : `PART_${data.weakest!.key.slice(4)}` as ReadingPartType)}
            >
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              {Number(data.weakest.key.slice(4)) < 5 ? 'Phiên tập trung' : `Bấm giờ ${data.weakest.code}`}
            </button>
          )}
        </div>
      </section>
      <section aria-labelledby="analytics-errors-heading" className={`${CARD} analytics-panel flex flex-col !px-5 !py-4`}>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="analytics-errors-heading" className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">
            <BookOpen className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            Lỗi đã ghi của đề
          </h2>
          <p id="analytics-errors-scope" className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Gồm các lần làm của đề
          </p>
        </div>
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
        </div> : <div className="my-auto rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-800/40">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Chưa có lỗi nào được gắn với đề này.</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">Lưu câu sai vào Sổ tay để phân tích nhóm bẫy bạn hay gặp nhất trong đề này.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />Bẫy từ vựng</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />Ngữ pháp</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />Nối âm</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />Thiếu giờ</span>
          </div>
        </div>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3.5 text-sm dark:border-slate-700">
          <div>
            {!data.parts.length && commonError ? (
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Sổ tay ghi nhiều lỗi nhất ở nhóm {commonError}.
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {data.notes.length} lỗi đã lưu trong Sổ tay
              </span>
            )}
          </div>
          {onNavigateToMistakes && (
            <button
              type="button"
              className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-slate-900 bg-blue-600 px-4 py-1.5 text-xs font-extrabold text-white shadow-[2px_2px_0px_#0f172a] hover:bg-blue-700 dark:border-slate-300"
              onClick={() => onNavigateToMistakes(data.notebookSources)}
            >
              Mở Sổ tay của đề<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
    </div>
  </div>;
}
