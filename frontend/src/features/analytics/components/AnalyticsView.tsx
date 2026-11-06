import { useEffect, useId, useMemo, useState } from 'react';
import { BookOpen, ArrowRight, Timer, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { triggerHaptic } from '@/shared/lib/haptics';
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
import { AttemptAdvicePanel } from './AttemptAdvicePanel';
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
  onAddMistakeForSession?: (session: StudySession) => void;
  onNavigateToTimer?: (part?: ReadingPartType) => void;
  onNavigateToPlan?: () => void;
}

export function AnalyticsView({ sessions, mistakes, onOpenSessionLogger, onEditSession, onNavigateToMistakes, onAddMistakeForSession, onNavigateToTimer, onNavigateToPlan }: AnalyticsViewProps) {
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [attemptChoice, setAttemptChoice] = useState<{ source: string; id: string } | null>(null);
  const [activeError, setActiveError] = useState<ErrorCategory | null>(null);
  const attemptPickerId = useId();
  // Phones: horizontal Part bars, one-line mistake summary, the practice button above the bottom bar.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (!isPhone && pickerOpen) setPickerOpen(false);
  }, [isPhone, pickerOpen]);
  const donutMotion = useChartMotion(600);
  const data = useMemo(() => analyticsScopeData(sessions, mistakes, sourceKey,
    attemptChoice?.source === sourceKey ? attemptChoice?.id : undefined), [sessions, mistakes, sourceKey, attemptChoice]);
  const resultStatus = data.attempt ? analyticsAttemptLabel(data.attemptNumber!, data.attempt.date) : 'Chưa nhập kết quả';
  // Recharts 2 interpolates sectors by index. Keep category identities fixed across filters.
  const donutData = useMemo(() => (Object.keys(ERROR_NAMES) as ErrorCategory[]).map(category =>
    data.errors.find(row => row.category === category) ?? { category, count: 0, percent: 0 }), [data.errors]);
  const advicePanel = <AttemptAdvicePanel attempt={data.attempt} mistakes={mistakes}
    ambiguousCount={data.notes.filter(note => !note.sessionId).length}
    onNavigateToMistakes={onNavigateToMistakes} onNavigateToTimer={onNavigateToTimer} onNavigateToPlan={onNavigateToPlan} />;





  const scopePickers = <>
    <div role="group" aria-label="Đề" className="min-w-0 max-w-full space-y-1.5 md:space-y-0">
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 md:sr-only">Đề</p>
      <AnalyticsScopePicker value={data.sourceKey} onChange={key => { setSourceKey(key); setAttemptChoice(null); }} names={data.names} />
    </div>
    <div className="min-w-0 max-w-full space-y-1.5 md:space-y-0">
      <label htmlFor={attemptPickerId} className="block text-xs font-semibold text-slate-600 dark:text-slate-300 md:sr-only">Lần làm</label>
      <select id={attemptPickerId} value={data.attempt?.id ?? ''} disabled={!data.attempts.length} onChange={event => { setSourceKey(data.sourceKey); setAttemptChoice({ source: data.sourceKey, id: event.target.value }); }} className="min-h-10 max-w-full cursor-pointer rounded-full border border-slate-300 bg-white pl-6 pr-9 py-2 text-sm font-bold text-slate-900 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-default disabled:opacity-60 dark:border-slate-600 dark:bg-[#111A2C] dark:text-white dark:hover:border-slate-500 transition-colors">
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
    const mostLost = Math.max(1, ...partsWithLoss.map(part => part.lost));

    return <div className="analytics-view space-y-3 pb-20 text-slate-800 dark:text-slate-200">
      {/* 1. Bộ chọn đề & lần làm */}
      <button type="button" onClick={() => setPickerOpen(true)} aria-haspopup="dialog" aria-label={`Chọn đề và lần làm: ${sourceName}, ${resultStatus}`}
        className="flex min-h-[50px] w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-white px-4 text-left shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[2px_2px_0_0_#cbd5e1]">
        <span className="min-w-0 flex-1 py-2">
          <span className="block truncate text-[15px] font-black text-slate-950 dark:text-white">{sourceName}</span>
          <span className="block text-[13px] font-semibold text-slate-500 dark:text-slate-400">{resultStatus}</span>
        </span>
        <ChevronDown className="h-[18px] w-[18px] shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      </button>

      {/* 2. Thẻ Sổ tay câu sai được đẩy lên trên - Phân biệt rõ số câu sai với Thẻ ôn tập */}
      <div className="flex w-full items-center justify-between gap-2.5 sm:gap-3 rounded-2xl border-2 border-slate-900 bg-white p-2.5 sm:p-3 text-left shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[2px_2px_0_0_#cbd5e1]">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
            <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13px] sm:text-[13.5px] font-black leading-tight text-slate-950 dark:text-white">
              {data.notes.length
                ? `${data.notes.length} thẻ câu sai đã lưu`
                : data.sourceKey
                  ? 'Chưa lưu thẻ ôn tập'
                  : 'Chưa có đề để phân tích'}
            </span>
            {errorLine ? (
              <span className="mt-0.5 block truncate text-[11px] sm:text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">
                {errorLine}
              </span>
            ) : (
              <span className="mt-0.5 block truncate text-[11px] sm:text-[11.5px] font-semibold text-slate-400 dark:text-slate-500">
                {data.sourceKey
                  ? totalLost > 0
                    ? `Đề sai ${totalLost} câu · Lưu để ôn bẫy`
                    : 'Lưu câu sai vào Sổ tay để ôn lại'
                  : 'Mở Sổ tay để xem tất cả câu đã lưu'}
              </span>
            )}
          </div>
        </div>

        {data.notes.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic(6);
              onNavigateToMistakes?.(data.notebookSources.length ? data.notebookSources : undefined);
            }}
            disabled={!onNavigateToMistakes}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 transition-colors cursor-pointer"
          >
            <span>Sổ tay</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : data.attempt && onAddMistakeForSession ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              onAddMistakeForSession(data.attempt!);
            }}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border-2 border-slate-900 bg-blue-600 px-2.5 py-1.5 text-xs font-black text-white shadow-[1.5px_1.5px_0_0_#0f172a] hover:bg-blue-500 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all dark:border-slate-300 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
            <span>Thêm câu sai</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              triggerHaptic(6);
              onNavigateToMistakes?.(undefined);
            }}
            disabled={!onNavigateToMistakes}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <span>Sổ tay</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 3. Tháp Điểm Yếu: Tập trung các Part bị mất điểm (Đề xuất 1: Bỏ viền hộp, dòng thoáng, co giãn linh hoạt) */}
      <section aria-labelledby="analytics-parts-heading" className="analytics-panel space-y-3 rounded-2xl border-2 border-slate-900 bg-white p-3.5 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
        <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
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
            <ol className="space-y-2.5 text-xs" aria-label={`Số câu sai theo Part, ${partsWithLoss.map(part => `${part.code}: ${part.lost} câu sai, đúng ${Math.round(part.accuracy)}%`).join(', ')}`}>
              {partsWithLoss.map(part => {
                const n = Number(part.key.slice(4));
                const weak = part.key === data.weakest?.key;
                const toneBar = weak
                  ? 'bg-rose-600 dark:bg-rose-500'
                  : n <= 4
                  ? 'bg-indigo-600 dark:bg-indigo-500'
                  : 'bg-teal-600 dark:bg-teal-500';
                const labelColor = weak
                  ? 'text-rose-700 dark:text-rose-400'
                  : n <= 4
                  ? 'text-indigo-700 dark:text-indigo-400'
                  : 'text-teal-700 dark:text-teal-400';

                return (
                  <li
                    key={part.key}
                    className={
                      weak
                        ? 'rounded-xl bg-rose-50/80 p-2.5 border border-rose-200 dark:border-rose-900 dark:bg-rose-950/40'
                        : 'px-2 py-1.5'
                    }
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2 font-black">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`truncate text-[12.5px] ${labelColor}`}>
                          {part.code} · {PART_NAMES[n - 1]}
                        </span>
                        {weak && (
                          <span className="shrink-0 rounded bg-rose-200/90 px-1.5 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                            Yếu nhất
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-right tabular-nums text-[12px] font-bold text-slate-900 dark:text-white">
                        {part.lost} câu sai <span className="block font-semibold text-slate-500 dark:text-slate-400">đúng {Math.round(part.accuracy)}%</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${toneBar}`}
                        style={{ width: `${part.lost / mostLost * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}

              {perfectParts.length > 0 && (
                <li className="flex flex-wrap items-center justify-start gap-2 border-t border-slate-100 px-1 pt-2.5 text-[11.5px] font-extrabold text-emerald-700 dark:border-slate-800 dark:text-emerald-400">
                  <span>✓ Part làm trọn vẹn 100%:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {perfectParts.map(part => (
                      <span
                        key={part.key}
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-black text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      >
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

      {advicePanel}
      {pickerOpen && <Sheet title="Chọn đề và lần làm" onClose={() => setPickerOpen(false)}>
        <div className="space-y-4 pb-2">{scopePickers}</div>
      </Sheet>}
    </div>;
  }

  const listeningParts = data.parts.filter(part => Number(part.key.slice(4)) <= 4);
  const readingParts = data.parts.filter(part => Number(part.key.slice(4)) >= 5);
  const totalCorrect = data.parts.reduce((sum, p) => sum + p.correct, 0);
  const totalQuestions = data.parts.reduce((sum, p) => sum + p.max, 0);
  const totalLost = data.parts.reduce((sum, p) => sum + p.lost, 0);
  const listeningLost = listeningParts.reduce((sum, p) => sum + p.lost, 0);
  const readingLost = readingParts.reduce((sum, p) => sum + p.lost, 0);

  return <div className="analytics-view mx-auto w-full max-w-6xl space-y-4 pb-6 text-slate-800 dark:text-slate-200">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {scopePickers}
      </div>
      {data.attempt && (
        <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-slate-100/90 px-4 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
          <span>Tổng: <strong className="text-sm font-black tabular-nums text-slate-950 dark:text-white">{typeof data.attempt.totalScore === 'number' && Number.isFinite(data.attempt.totalScore) ? number(data.attempt.totalScore) : '—'}</strong><span className="text-slate-400">/990</span></span>
          <span className="h-3.5 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
          <span className="text-indigo-600 dark:text-indigo-400">Listening: <strong className="font-bold tabular-nums">{data.listening.value === null ? '—' : number(data.listening.value)}</strong></span>
          <span className="text-teal-600 dark:text-teal-400">Reading: <strong className="font-bold tabular-nums">{data.reading.value === null ? '—' : number(data.reading.value)}</strong></span>
          {data.parts.length > 0 && (
            <>
              <span className="h-3.5 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
              <span>Sai <strong className="tabular-nums text-slate-900 dark:text-white">{totalLost}/{totalQuestions}</strong></span>
            </>
          )}
        </div>
      )}
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-labelledby="analytics-parts-heading" className={`${CARD} analytics-panel flex flex-col !px-5 !py-4`}>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="analytics-parts-heading" className="text-base sm:text-lg font-black text-slate-950 dark:text-white">Độ chính xác 7 Part</h2>
          {data.parts.length > 0 && (
            <span className="text-xs sm:text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">
              Đúng <strong className="font-black text-slate-950 dark:text-white">{totalCorrect} / {totalQuestions}</strong> câu
            </span>
          )}
        </div>

        {data.parts.length ? (
          <div className="flex-1 space-y-4">
            {/* Nhóm Listening: màu Indigo chuẩn hệ thống */}
            <div>
              <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" aria-hidden="true" />
                  Listening {data.listening.value !== null ? `· ${number(data.listening.value)}/495` : ''} <span className="font-semibold text-slate-500 lowercase">({listeningLost > 0 ? `sai ${listeningLost} câu` : 'đúng 100%'})</span>
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Tỷ lệ đúng</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {listeningParts.map(part => {
                  const n = Number(part.key.slice(4));
                  const isWeak = part.key === data.weakest?.key;
                  const is100 = part.lost === 0;
                  const barColor = is100 ? 'bg-emerald-500 dark:bg-emerald-400' : isWeak ? 'bg-rose-500 dark:bg-rose-400' : 'bg-indigo-600 dark:bg-indigo-400';
                  const textColor = isWeak ? 'text-rose-600 dark:text-rose-400' : is100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white';

                  return (
                    <div key={part.key} className="flex items-center gap-3 py-2" title={`Part ${n}: ${PART_NAMES[n - 1]}`}>
                      <span className="w-16 shrink-0 text-xs font-black text-slate-800 dark:text-slate-200">Part {n}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.round(part.accuracy)}%` }} />
                      </div>
                      <div className="w-24 shrink-0 text-right text-xs">
                        <strong className={`font-black tabular-nums ${textColor}`}>{part.correct}/{part.max}</strong>{' '}
                        <span className="font-semibold tabular-nums text-slate-500 dark:text-slate-400">({Math.round(part.accuracy)}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Nhóm Reading: màu Teal chuẩn hệ thống */}
            <div>
              <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
                  <span className="h-2 w-2 rounded-full bg-teal-600 dark:bg-teal-400" aria-hidden="true" />
                  Reading {data.reading.value !== null ? `· ${number(data.reading.value)}/495` : ''} <span className="font-semibold text-slate-500 lowercase">({readingLost > 0 ? `sai ${readingLost} câu` : 'đúng 100%'})</span>
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {readingParts.map(part => {
                  const n = Number(part.key.slice(4));
                  const isWeak = part.key === data.weakest?.key;
                  const is100 = part.lost === 0;
                  const barColor = is100 ? 'bg-emerald-500 dark:bg-emerald-400' : isWeak ? 'bg-rose-500 dark:bg-rose-400' : 'bg-teal-600 dark:bg-teal-400';
                  const textColor = isWeak ? 'text-rose-600 dark:text-rose-400' : is100 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white';

                  return (
                    <div key={part.key} className="flex items-center gap-3 py-2" title={`Part ${n}: ${PART_NAMES[n - 1]}`}>
                      <span className="w-16 shrink-0 text-xs font-black text-slate-800 dark:text-slate-200">Part {n}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.round(part.accuracy)}%` }} />
                      </div>
                      <div className="w-24 shrink-0 text-right text-xs">
                        <strong className={`font-black tabular-nums ${textColor}`}>{part.correct}/{part.max}</strong>{' '}
                        <span className="font-semibold tabular-nums text-slate-500 dark:text-slate-400">({Math.round(part.accuracy)}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="my-auto flex flex-col items-center justify-center gap-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>{data.attempt ? 'Lượt này chưa có chi tiết Part.' : 'Chưa nhập kết quả của đề này.'}</p>
            {data.attempt && onEditSession ? (
              <button type="button" onClick={() => onEditSession(data.attempt!)} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Bổ sung chi tiết</button>
            ) : !data.attempt && onOpenSessionLogger && (
              <button type="button" onClick={() => onOpenSessionLogger({ sessionType: 'FULL_TEST' })} className="min-h-11 cursor-pointer px-3 text-sm font-bold text-blue-600 dark:text-blue-400">Nhập kết quả</button>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3.5 text-sm dark:border-slate-700">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {data.weakest && data.weakest.lost > 0 ? (
              <span>Cần gỡ điểm: <strong className="font-black text-rose-600 dark:text-rose-400">{data.weakest.code} (-{data.weakest.lost} câu)</strong></span>
            ) : (
              <span className="font-bold text-emerald-700 dark:text-emerald-400">✓ Cả 7 Part đạt kết quả tốt</span>
            )}
          </div>
          {onNavigateToTimer && data.weakest && (
            <button
              type="button"
              className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-slate-900 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-900 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all dark:border-slate-300 dark:bg-slate-800 dark:text-white"
              onClick={() => onNavigateToTimer(Number(data.weakest!.key.slice(4)) < 5 ? 'POMODORO' : `PART_${data.weakest!.key.slice(4)}` as ReadingPartType)}
            >
              <Timer className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
              <span>{Number(data.weakest.key.slice(4)) < 5 ? 'Phiên tập trung' : `Bấm giờ ${data.weakest.code}`}</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      <section aria-labelledby="analytics-errors-heading" className={`${CARD} analytics-panel flex flex-col !px-5 !py-4`}>
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="analytics-errors-heading" className="flex items-center gap-2 text-base sm:text-lg font-black text-slate-950 dark:text-white">
            <BookOpen className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            Nhóm bẫy mắc phải
          </h2>
          <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">
            {data.notes.length} câu trong Sổ tay
          </span>
        </div>

        {data.notes.length ? (
          <div className="flex-1 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 pt-2 pb-2" role="img" aria-describedby="analytics-errors-scope" aria-label={`${data.notes.length} lỗi đã ghi: ${data.errors.map(row => `${ERROR_NAMES[row.category]} ${row.count} lỗi`).join(', ')}`}>
              <div className="relative h-44 w-44 sm:h-48 sm:w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="count"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius="60%"
                      outerRadius="88%"
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={3}
                      stroke="none"
                      isAnimationActive={donutMotion.enabled}
                      onMouseEnter={row => setActiveError(row.category)}
                      onMouseLeave={() => setActiveError(null)}
                      onFocus={row => setActiveError(row.category)}
                      onBlur={() => setActiveError(null)}
                      animationBegin={0}
                      animationDuration={donutMotion.duration}
                      animationEasing="ease-out"
                      onAnimationEnd={donutMotion.finish}
                    >
                      {donutData.map(row => (
                        <Cell key={row.category} fill={ERROR_CATEGORY_LABELS[row.category].color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <strong className="text-3xl sm:text-4xl font-black tabular-nums text-slate-950 dark:text-white leading-none">
                    {data.notes.length}
                  </strong>
                  <span className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                    câu đã lưu
                  </span>
                </div>
              </div>

              <div className="flex flex-col justify-center gap-3 w-full sm:w-52 shrink-0">
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="block text-xs font-bold text-slate-500 dark:text-slate-400">Tổng câu sai đề này</span>
                  <strong className="text-lg font-black text-slate-950 dark:text-white tabular-nums">
                    {data.parts.length > 0 ? `${totalLost} câu` : (data.attempt ? '—' : 'Chưa có đề')}
                  </strong>
                </div>
                <div className="rounded-xl border border-blue-200/90 bg-blue-50/60 p-3.5 dark:border-blue-900/60 dark:bg-blue-950/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-400">Đã lưu vào Sổ tay</span>
                    <span className="text-xs font-black text-blue-700 dark:text-blue-300 tabular-nums">
                      {totalLost > 0 ? `${Math.round(data.notes.length / totalLost * 100)}%` : ''}
                    </span>
                  </div>
                  <strong className="text-lg font-black text-blue-700 dark:text-blue-300 tabular-nums mt-0.5 block">
                    {data.notes.length} câu
                  </strong>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-blue-200/60 dark:bg-blue-950/80 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-all duration-500" style={{ width: `${totalLost > 0 ? Math.min(100, Math.round(data.notes.length / totalLost * 100)) : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-800/60 pt-1">
              {data.errors.map(row => (
                <div key={row.category} className={`flex items-center justify-between py-2.5 text-xs font-semibold rounded-lg px-2 transition-colors ${activeError === row.category ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ERROR_CATEGORY_LABELS[row.category].color }} aria-hidden="true" />
                    <span className="truncate text-slate-900 dark:text-slate-100">{ERROR_NAMES[row.category]}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 tabular-nums text-right">
                    <div className="hidden sm:block w-24 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(row.percent)}%`, backgroundColor: ERROR_CATEGORY_LABELS[row.category].color }} />
                    </div>
                    <div>
                      <strong className="font-black text-slate-950 dark:text-white">{Math.round(row.percent)}%</strong>{' '}
                      <span className="font-medium text-slate-500 dark:text-slate-400">({row.count} câu)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="my-auto rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.sourceKey ? 'Chưa có lỗi nào được gắn với đề này.' : 'Chưa có đề để phân tích.'}</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{data.sourceKey ? 'Lưu câu sai vào Sổ tay để phân tích nhóm bẫy bạn hay gặp nhất trong đề này.' : 'Các câu chưa gắn đề vẫn được giữ trong Sổ tay.'}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />Bẫy từ vựng</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />Ngữ pháp</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />Nối âm</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />Thiếu giờ</span>
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3.5 text-sm dark:border-slate-700">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
            Hay sai nhất:{' '}
            <strong className="font-black text-slate-900 dark:text-white">
              {data.errors[0] ? ERROR_NAMES[data.errors[0].category] : 'Chưa có'}
            </strong>
          </div>
          {onNavigateToMistakes && (
            <button
              type="button"
              className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-slate-900 bg-white px-3.5 py-1.5 text-xs font-extrabold text-slate-950 shadow-[2px_2px_0px_#0f172a] hover:bg-slate-50 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all dark:border-slate-300 dark:bg-slate-800 dark:text-white"
              onClick={() => onNavigateToMistakes(data.notes.length ? data.notebookSources : undefined)}
            >
              <span>{data.sourceKey ? (data.notes.length ? 'Mở Sổ tay đề này' : 'Mở Sổ tay') : 'Mở toàn bộ Sổ tay'}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
    </div>
    {advicePanel}
  </div>;
}
