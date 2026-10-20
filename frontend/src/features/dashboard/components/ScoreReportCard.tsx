import type { ReactNode } from 'react';
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
  children?: ReactNode;
}

/**
 * The latest Full Test laid out like a TOEIC score report: the total, a Listening | Reading band
 * in their section colours, then the goal. Phones add record, average and progress as a footer;
 * computers show those in the tiles above, so they add only the link to the Part breakdown.
 */
export function ScoreReportCard({ latestTest, latestTotal, previousTotal, listeningScore, readingScore, targetScore,
  newRecord, children }: ScoreReportProps) {
  const remaining = Math.max(0, targetScore - latestTotal);
  const percent = Math.min(100, Math.round((latestTotal / targetScore) * 100));
  const change = previousTotal !== undefined ? latestTotal - previousTotal : undefined;
  const hasSections = listeningScore !== undefined || readingScore !== undefined;

  return (
    <section aria-labelledby="score-report-title" className="relative overflow-hidden rounded-[20px] border-2 border-slate-900 bg-[#FFFDF7] shadow-[4px_4px_0_0_#0f172a] dark:border-slate-200 dark:bg-[#111A2C] dark:shadow-[4px_4px_0_0_#cbd5e1]">
      <div className="px-[18px] pb-3.5 pt-4">
        <h2 id="score-report-title" className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Kết quả gần nhất</h2>
        <p className={'mt-0.5 truncate text-[15px] font-extrabold text-slate-900 dark:text-white ' + (newRecord ? 'pr-20' : '')}>
          {latestTest.testName} <span className="font-bold tabular-nums text-slate-400">· {formatShortDate(latestTest.date)}</span>
        </p>
        {newRecord && (
          <p className="absolute right-4 top-3.5 rotate-[8deg] rounded-xl border-[2.5px] border-amber-600 px-2 py-1 text-center text-xs font-extrabold leading-tight text-amber-600 dark:border-amber-400 dark:text-amber-400">
            KỶ LỤC<br /><span className="text-[10px]">mới</span>
          </p>
        )}
        <div className="mt-2.5">
          <p className="flex items-baseline gap-2">
            <span className={'font-extrabold leading-none tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white ' + 'text-[58px]'}>{latestTotal}</span>
            <span className="text-base font-bold text-slate-400">/ 990</span>
          </p>
          {change !== undefined && change !== 0 && (
            <p className="mt-1.5 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
              <span className={'font-extrabold tabular-nums ' + (change > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {change > 0 ? '▲' : '▼'} {Math.abs(change)}
              </span> so với lần trước
            </p>
          )}
        </div>
      </div>

      {hasSections
        ? <dl className="grid grid-cols-2 border-y-2 border-slate-900 text-white dark:border-slate-200">
            <Section label="Listening" score={listeningScore} raw={latestTest.rawListening} className="bg-indigo-600" />
            <Section label="Reading" score={readingScore} raw={latestTest.rawReading} className="border-l-2 border-slate-900 bg-teal-600 dark:border-slate-200" />
          </dl>
        : <p className="border-t border-slate-200 px-[18px] pt-3 text-[13px] text-slate-500 dark:border-slate-700 dark:text-slate-400">Bài gần nhất chỉ có tổng điểm; chưa ghi điểm Listening/Reading.</p>}

      <div className="px-[18px] py-3">
        <p data-latest-goal className="flex justify-between gap-3 text-[13.5px] font-bold text-slate-800 dark:text-slate-200">
          <span>Mục tiêu {targetScore}</span>
          {remaining === 0
            ? <span className="text-emerald-700 dark:text-emerald-400">Đã đạt mục tiêu</span>
            : <span className="text-amber-700 dark:text-amber-400">còn {remaining} điểm</span>}
        </p>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
          <div data-goal-bar className={'h-full rounded-full ' + (remaining === 0 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-blue-600 dark:bg-blue-500')} style={{ width: `${percent}%` }} />
        </div>
      </div>
      {children}
    </section>
  );
}

function Section({ label, score, raw, className }: { label: string; score?: number; raw?: number; className: string }) {
  return (
    <div className={'px-4 py-2.5 ' + className}>
      <dt className="text-[11.5px] font-bold uppercase opacity-85">{label}</dt>
      <dd className="text-2xl font-extrabold tabular-nums">{score ?? '—'}</dd>
      {raw !== undefined && <dd className="text-[11.5px] font-semibold tabular-nums opacity-85">{raw}/100 câu đúng</dd>}
    </div>
  );
}
