import type { ReactNode } from 'react';
import { Headphones, BookOpen, Calendar } from 'lucide-react';
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
export function ScoreReportCard({ latestTest, latestTotal, previousTotal, listeningScore, readingScore, targetScore,
  newRecord, roomy, children }: ScoreReportProps) {
  const remaining = Math.max(0, targetScore - latestTotal);
  const percent = targetScore > 0 ? Math.min(100, Math.round((latestTotal / targetScore) * 100)) : 100;
  const change = previousTotal !== undefined ? latestTotal - previousTotal : undefined;
  const hasSections = listeningScore !== undefined || readingScore !== undefined;

  return (
    <section aria-labelledby="score-report-title" className={'relative overflow-hidden rounded-[20px] border-2 border-slate-900 bg-[#FFFDF7] shadow-[4px_4px_0_0_#0f172a] dark:border-slate-200 dark:bg-[#111A2C] dark:shadow-[4px_4px_0_0_#cbd5e1] '}>
      <div className={roomy ? 'px-5 pt-4 pb-3.5' : 'px-[18px] pt-3.5 pb-3'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="score-report-title" className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-400">Kết quả gần nhất</h2>
            <p className="mt-0.5 truncate text-[15.5px] font-black text-slate-900 dark:text-white">{latestTest.testName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {newRecord && (
              <span className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                🏆 Kỷ lục mới
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-slate-600 shadow-2xs dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300">
              <Calendar className="h-3 w-3 text-slate-400" aria-hidden="true" />
              <span>{formatShortDate(latestTest.date)}</span>
            </span>
          </div>
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
              <p className={
                'inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-semibold ' +
                (change > 0
                  ? 'border-emerald-200/90 bg-emerald-50 text-slate-600 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-slate-300'
                  : 'border-rose-200/90 bg-rose-50 text-slate-600 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-slate-300')
              }>
                <span className={'font-extrabold tabular-nums ' + (change > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                  {change > 0 ? '▲' : '▼'} {Math.abs(change)}
                </span>
                <span>so với lần trước</span>
              </p>
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
        ? <dl className={(roomy ? 'px-5 ' : 'px-[18px] ') + 'grid grid-cols-2 gap-2.5'}>
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
    ? 'rounded-2xl border border-indigo-200/90 bg-indigo-50/80 text-indigo-950 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-100'
    : 'rounded-2xl border border-teal-200/90 bg-teal-50/80 text-teal-950 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-100';
  const labelClass = isListening ? 'text-indigo-800 dark:text-indigo-200' : 'text-teal-800 dark:text-teal-200';
  const dotClass = isListening ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-teal-600 dark:bg-teal-400';
  const badgeClass = isListening
    ? 'whitespace-nowrap rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-[10.5px] font-extrabold tabular-nums text-indigo-700 shrink-0 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300'
    : 'whitespace-nowrap rounded-lg border border-teal-200 bg-white px-2 py-0.5 text-[10.5px] font-extrabold tabular-nums text-teal-700 shrink-0 dark:border-teal-700 dark:bg-slate-900 dark:text-teal-300';

  return (
    <div className={'flex flex-col justify-between ' + (roomy ? 'gap-2 px-3.5 py-3 ' : 'gap-1.5 px-3 py-2.5 ') + cardClass}>
      <div className="flex items-center justify-between gap-2">
        <dt className={'flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider ' + labelClass}>
          <span className={'h-1.5 w-1.5 rounded-full ' + dotClass} aria-hidden="true" />
          {label}
        </dt>
        <Icon className={'h-4 w-4 shrink-0 ' + (isListening ? 'text-indigo-400 dark:text-indigo-400' : 'text-teal-400 dark:text-teal-400')} strokeWidth={2.2} aria-hidden="true" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <dd className={'font-black tabular-nums leading-none ' + (roomy ? 'text-[28px]' : 'text-2xl')}>{score ?? '—'}</dd>
        {raw !== undefined && (
          <dd className={badgeClass}>
            {raw}/100 câu
          </dd>
        )}
      </div>
    </div>
  );
}
