import type { ReactNode } from 'react';
import { Headphones, BookOpen, Trophy } from 'lucide-react';
import type { StudySession } from '@/shared/types';
import { getConcordanceByToeic } from '@/shared/domain/etsScoring';
import { triggerHaptic } from '@/shared/lib/haptics';

export const formatShortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const CEFR_STYLES: Record<string, string> = {
  C1: 'bg-purple-100 text-purple-950 dark:bg-purple-950/60 dark:text-purple-200',
  B2: 'bg-indigo-100 text-indigo-950 dark:bg-indigo-950/60 dark:text-indigo-200',
  B1: 'bg-blue-100 text-blue-950 dark:bg-blue-950/60 dark:text-blue-200',
  A2: 'bg-teal-100 text-teal-950 dark:bg-teal-950/60 dark:text-teal-200',
  A1: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
};

interface ScoreReportProps {
  latestTest: StudySession;
  latestTotal: number;
  previousTotal?: number;
  listeningScore?: number;
  readingScore?: number;
  targetScore: number;
  /** Marks the latest test as a new record (only meaningful from the second test on) */
  newRecord: boolean;
  /** Computer: a roomier card, about the height of the old latest-test card */
  roomy?: boolean;
  /** Grid placement on the computer overview. */
  className?: string;
  children?: ReactNode;
  onOpenListening?: () => void;
  onOpenReading?: () => void;
}

/**
 * The latest Full Test laid out like a TOEIC score report: the total, a Listening | Reading band
 * in their section colours, then the goal. Phones add record, average and progress as a footer;
 * computers show those in the tiles above, so they add only the link to the Part breakdown.
 */
export function ScoreReportCard({
  latestTest,
  latestTotal,
  previousTotal,
  listeningScore,
  readingScore,
  targetScore,
  newRecord,
  roomy,
  className = '',
  children,
  onOpenListening,
  onOpenReading
}: ScoreReportProps) {
  const remaining = Math.max(0, targetScore - latestTotal);
  const percent = targetScore > 0 ? Math.min(100, Math.round((latestTotal / targetScore) * 100)) : 100;
  const change = previousTotal !== undefined ? latestTotal - previousTotal : undefined;
  const hasSections = listeningScore !== undefined || readingScore !== undefined;

  const cefrTier = (listeningScore !== undefined && readingScore !== undefined)
    ? getConcordanceByToeic(listeningScore, readingScore)
    : null;
  const cefrName = cefrTier?.cefr;

  return (
    <section
      aria-labelledby="score-report-title"
      className={`relative flex flex-col overflow-hidden rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1] ${className}`}
    >
      <div className={roomy ? 'px-5 pt-4 pb-3' : 'px-4 sm:px-5 pt-4 pb-3.5'}>
        {/* Header phân tầng: Metadata (Ngày + Kỷ lục) ở trên, Tên đề rộng rãi 100% ở dưới */}
        <div className="mb-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="score-report-title" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <span>Kết quả gần nhất</span>
              <span className="text-slate-300 dark:text-slate-600 font-normal">·</span>
              <span className="normal-case font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                {formatShortDate(latestTest.date)}
              </span>
            </h2>
            {newRecord ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/90 bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-950 shrink-0 dark:border-amber-700/80 dark:bg-amber-950/70 dark:text-amber-200">
                <Trophy className="h-3 w-3 stroke-[2.5] text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>Kỷ lục mới</span>
              </span>
            ) : cefrName ? (
              <span
                title={`Khung tham chiếu trình độ CEFR: ${cefrName}`}
                className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 px-2.5 py-0.5 text-[11px] font-extrabold shrink-0 dark:border-slate-700/80 ${
                  CEFR_STYLES[cefrName] ?? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" aria-hidden="true" />
                <span>Trình độ {cefrName}</span>
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[16px] font-black text-slate-900 dark:text-white tracking-tight truncate">
            {latestTest.testName}
          </p>
        </div>

        <div className={roomy ? 'mt-3.5' : 'mt-2.5'}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-baseline gap-2">
              <span className={'font-black leading-none tracking-[-0.03em] tabular-nums text-slate-950 dark:text-white ' + (roomy ? 'text-[46px]' : 'text-[40px]')}>
                {latestTotal}
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-600 dark:text-slate-300">/ 990</span>
            </p>
            {change !== undefined && change !== 0 && (
              <span
                className={
                  'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-black ' +
                  (change > 0
                    ? 'border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'border-rose-200/80 bg-rose-50 text-rose-800 dark:border-rose-800/80 dark:bg-rose-950/60 dark:text-rose-300')
                }
              >
                <span className="tabular-nums">
                  {change > 0 ? '▲' : '▼'} {Math.abs(change)}
                </span>
                <span className="hidden sm:inline font-bold">so với bài trước</span>
              </span>
            )}
          </div>
        </div>

        <div className={(roomy ? 'mt-3 pt-2.5 ' : 'mt-4 pt-3.5 ') + 'border-t border-slate-200/80 dark:border-slate-800'}>
          <p data-latest-goal className="flex justify-between gap-3 text-[13px] font-bold text-slate-800 dark:text-slate-200">
            <span>Mục tiêu {targetScore}</span>
            {remaining === 0
              ? <span className="text-emerald-700 dark:text-emerald-400">Đã đạt mục tiêu</span>
              : <span className="text-amber-700 dark:text-amber-400">còn {remaining} điểm</span>}
          </p>
          <div className={(roomy ? 'mt-2.5 h-2.5 ' : 'mt-2 h-2 ') + 'overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800'} aria-hidden="true">
            <div data-goal-bar className={'h-full rounded-full transition-all duration-700 ease-out ' + (remaining === 0 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-blue-600 dark:bg-blue-500')} style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {hasSections
        ? <div className={(roomy ? 'px-5 pb-3 ' : 'px-4 sm:px-5 pb-2.5 ') + 'grid grid-cols-2 gap-3'}>
            <Section
              label="Listening"
              score={listeningScore}
              raw={latestTest.rawListening}
              roomy={roomy}
              kind="listening"
              onClick={onOpenListening}
            />
            <Section
              label="Reading"
              score={readingScore}
              raw={latestTest.rawReading}
              roomy={roomy}
              kind="reading"
              onClick={onOpenReading}
            />
          </div>
        : <p className={(roomy ? 'px-5 pb-4 ' : 'px-[18px] pb-3 ') + 'text-[13px] text-slate-500 dark:text-slate-400'}>Bài gần nhất chỉ có tổng điểm; chưa ghi điểm Listening/Reading.</p>}

      {children}
    </section>
  );
}

function Section({
  label,
  score,
  raw,
  roomy,
  kind,
  onClick
}: {
  label: string;
  score?: number;
  raw?: number;
  roomy?: boolean;
  kind: 'listening' | 'reading';
  onClick?: () => void;
}) {
  const Icon = kind === 'listening' ? Headphones : BookOpen;
  const isListening = kind === 'listening';
  const cardClass = isListening
    ? 'rounded-xl border border-indigo-200/80 bg-indigo-50/70 hover:bg-indigo-100/80 text-indigo-950 dark:border-indigo-800/80 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-100'
    : 'rounded-xl border border-teal-200/80 bg-teal-50/70 hover:bg-teal-100/80 text-teal-950 dark:border-teal-800/80 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 dark:text-teal-100';
  const labelClass = isListening ? 'text-indigo-800 dark:text-indigo-200' : 'text-teal-800 dark:text-teal-200';
  const iconColor = isListening ? 'text-indigo-600 dark:text-indigo-400' : 'text-teal-600 dark:text-teal-400';
  const chevronColor = isListening ? 'text-indigo-400 group-hover:text-indigo-900 dark:text-indigo-400 dark:group-hover:text-white' : 'text-teal-400 group-hover:text-teal-900 dark:text-teal-400 dark:group-hover:text-white';
  const badgeClass = isListening
    ? 'whitespace-nowrap rounded-lg border border-slate-200/80 bg-white/90 px-2 py-0.5 text-[11px] font-black tabular-nums text-indigo-800 shrink-0 dark:border-slate-700/80 dark:bg-slate-900 dark:text-indigo-300'
    : 'whitespace-nowrap rounded-lg border border-slate-200/80 bg-white/90 px-2 py-0.5 text-[11px] font-black tabular-nums text-teal-800 shrink-0 dark:border-slate-700/80 dark:bg-slate-900 dark:text-teal-300';

  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic(8);
        onClick?.();
      }}
      aria-label={`Xem chi tiết ${label}: ${score ?? 'chưa có điểm'}`}
      className={'group flex min-w-0 flex-col justify-between text-left cursor-pointer hover:brightness-[0.98] active:scale-[0.99] transition-all duration-150 ' + (roomy ? 'gap-1.5 p-3 ' : 'gap-1.5 p-3 sm:p-3.5 ') + cardClass}
    >
      <div className="flex items-center justify-between w-full">
        <span className={'flex items-center gap-1.5 text-xs font-black uppercase tracking-wider ' + labelClass}>
          <Icon className={'h-3.5 w-3.5 shrink-0 ' + iconColor} strokeWidth={2.5} aria-hidden="true" />
          <span>{label}</span>
        </span>
        <span className={'text-sm font-black transition-transform group-hover:translate-x-0.5 ' + chevronColor} aria-hidden="true">
          ›
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2 w-full">
        <span className="whitespace-nowrap font-black tabular-nums leading-none text-slate-950 dark:text-white tracking-tight text-[28px]">
          {score ?? '—'}
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">/ 495</span>
        </span>
        {roomy && raw !== undefined && (
          <span className={badgeClass}>
            {raw}/100 câu
          </span>
        )}
      </div>
    </button>
  );
}
