import type { ReactNode } from 'react';
import { Headphones, BookOpen } from 'lucide-react';
import type { StudySession } from '@/shared/types';

export const formatShortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
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
  children?: ReactNode;
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
  children
}: ScoreReportProps) {
  const remaining = Math.max(0, targetScore - latestTotal);
  const percent = targetScore > 0 ? Math.min(100, Math.round((latestTotal / targetScore) * 100)) : 100;
  const change = previousTotal !== undefined ? latestTotal - previousTotal : undefined;
  const hasSections = listeningScore !== undefined || readingScore !== undefined;

  return (
    <section
      aria-labelledby="score-report-title"
      className="relative overflow-hidden rounded-[22px] border-[1.5px] border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-[#111A2C] dark:shadow-none"
    >
      <div className={roomy ? 'px-5 pt-4 pb-3.5' : 'px-[18px] pt-3.5 pb-3'}>
        {/* Header phân tầng: Metadata (Ngày + Kỷ lục) ở trên, Tên đề rộng rãi 100% ở dưới */}
        <div className="mb-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="score-report-title" className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              <span>Kết quả gần nhất</span>
              <span className="text-slate-300 dark:text-slate-600 font-normal">·</span>
              <span className="normal-case font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                {formatShortDate(latestTest.date)}
              </span>
            </h2>
            {newRecord && (
              <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[10.5px] font-black text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300 shrink-0">
                🏆 Kỷ lục mới
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[16px] font-black text-slate-900 dark:text-white tracking-tight truncate">
            {latestTest.testName}
          </p>
        </div>

        <div className={roomy ? 'mt-3' : 'mt-2'}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-baseline gap-2">
              <span className={'font-black leading-none tracking-[-0.03em] tabular-nums text-slate-950 dark:text-white ' + (roomy ? 'text-[46px]' : 'text-[40px]')}>
                {latestTotal}
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-400">/ 990</span>
            </p>
            {change !== undefined && change !== 0 && (
              <span
                className={
                  'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-bold ' +
                  (change > 0
                    ? 'border-emerald-200/90 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : 'border-rose-200/90 bg-rose-50 text-rose-600 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400')
                }
              >
                <span className="tabular-nums">
                  {change > 0 ? '▲' : '▼'} {Math.abs(change)}
                </span>
                <span className="hidden sm:inline font-normal text-slate-500 dark:text-slate-400">so với bài trước</span>
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800">
          <p data-latest-goal className="flex justify-between gap-3 text-[13px] font-bold text-slate-800 dark:text-slate-200">
            <span>Mục tiêu {targetScore}</span>
            {remaining === 0
              ? <span className="text-emerald-700 dark:text-emerald-400">Đã đạt mục tiêu</span>
              : <span className="text-amber-700 dark:text-amber-400">còn {remaining} điểm</span>}
          </p>
          <div className={(roomy ? 'mt-2 h-2.5 ' : 'mt-1.5 h-2 ') + 'overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800'} aria-hidden="true">
            <div data-goal-bar className={'h-full rounded-full ' + (remaining === 0 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-blue-600 dark:bg-blue-500')} style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      {hasSections
        ? <dl className={(roomy ? 'px-5 ' : 'px-[18px] ') + 'grid grid-cols-2 gap-2.5 pb-1'}>
            <Section label="Listening" score={listeningScore} raw={latestTest.rawListening} roomy={roomy} kind="listening" />
            <Section label="Reading" score={readingScore} raw={latestTest.rawReading} roomy={roomy} kind="reading" />
          </dl>
        : <p className={(roomy ? 'px-5 pb-4 ' : 'px-[18px] pb-3 ') + 'text-[13px] text-slate-500 dark:text-slate-400'}>Bài gần nhất chỉ có tổng điểm; chưa ghi điểm Listening/Reading.</p>}

      {children}
    </section>
  );
}

function Section({ label, score, raw, roomy, kind }: { label: string; score?: number; raw?: number; roomy?: boolean; kind: 'listening' | 'reading' }) {
  const Icon = kind === 'listening' ? Headphones : BookOpen;
  const isListening = kind === 'listening';
  const cardClass = isListening
    ? 'rounded-2xl border border-indigo-200/90 bg-indigo-50/70 text-indigo-950 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-100 shadow-2xs'
    : 'rounded-2xl border border-teal-200/90 bg-teal-50/70 text-teal-950 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100 shadow-2xs';
  const labelClass = isListening ? 'text-indigo-700 dark:text-indigo-200' : 'text-teal-700 dark:text-teal-200';
  const iconColor = isListening ? 'text-indigo-600 dark:text-indigo-400' : 'text-teal-600 dark:text-teal-400';
  const badgeClass = isListening
    ? 'whitespace-nowrap rounded-md border border-indigo-200/80 bg-white/90 px-1.5 py-0.5 text-[10.5px] font-black tabular-nums shrink-0 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300 shadow-2xs'
    : 'whitespace-nowrap rounded-md border border-teal-200/80 bg-white/90 px-1.5 py-0.5 text-[10.5px] font-black tabular-nums shrink-0 dark:border-teal-700 dark:bg-slate-900 dark:text-teal-300 shadow-2xs';

  return (
    <div className={'flex min-w-0 overflow-hidden flex-col justify-between ' + (roomy ? 'gap-2 px-3 py-2.5 ' : 'gap-1.5 px-3 py-2.5 ') + cardClass}>
      <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide">
        <dt className={'flex items-center gap-1.5 ' + labelClass}>
          <Icon className={'h-3.5 w-3.5 shrink-0 ' + iconColor} strokeWidth={2.5} aria-hidden="true" />
          <span>{label}</span>
        </dt>
      </div>
      <div className="flex items-end justify-between gap-1">
        <dd className={'font-black tabular-nums leading-none text-slate-900 dark:text-white tracking-tight ' + (roomy ? 'text-[26px]' : 'text-[24px]')}>{score ?? '—'}</dd>
        {raw !== undefined && (
          <dd className={badgeClass}>
            {raw}/100 câu
          </dd>
        )}
      </div>
    </div>
  );
}
