import { Plus } from 'lucide-react';
import type { StudySession } from '@/shared/types';

const formatShortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

interface SummaryProps {
  latestTest: StudySession | null;
  latestTotal: number;
  previousTotal?: number;
  listeningScore?: number;
  readingScore?: number;
  targetScore: number;
  highestScore: number;
  bestTestDate?: string;
  /** The latest test is also the record, so the record column says so instead of a date */
  latestIsBest?: boolean;
  avgScore?: number;
  totalTests: number;
  diff: number;
  hasDiff: boolean;
  firstTotal?: number;
  onOpenSessionLogger: () => void;
}

/**
 * Phones (<768px): the latest score is the one number a learner opens the app for,
 * so it leads with Listening/Reading beside it; record, average and progress follow
 * as one row of columns inside the same card rather than three separate tiles.
 */
export function PhoneSummary({ latestTest, latestTotal, previousTotal, listeningScore, readingScore, targetScore, highestScore,
  bestTestDate, latestIsBest, avgScore, totalTests, diff, hasDiff, firstTotal, onOpenSessionLogger }: SummaryProps) {
  if (!latestTest) {
    return (
      <section className="rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-200 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
        <h2 className="text-base font-black text-slate-950 dark:text-white">Chưa có bài thi nào</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Ghi điểm đề Full Test đầu tiên để thấy tiến bộ và khoảng cách tới mục tiêu {targetScore}.</p>
        <button type="button" onClick={onOpenSessionLogger}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-blue-600 text-sm font-black text-white shadow-[2px_2px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 cursor-pointer">
          <Plus size={18} aria-hidden="true" />Ghi điểm đề đầu tiên
        </button>
      </section>
    );
  }

  const remaining = Math.max(0, targetScore - latestTotal);
  const percent = Math.min(100, Math.round((latestTotal / targetScore) * 100));
  const change = previousTotal !== undefined ? latestTotal - previousTotal : undefined;
  const diffColor = !hasDiff ? 'text-slate-400 dark:text-slate-500' : diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

  const hasSections = listeningScore !== undefined || readingScore !== undefined;
  const recordHint = latestIsBest ? 'Bài này' : bestTestDate ? `Ngày ${formatShortDate(bestTestDate)}` : '—';

  return (
    <section aria-label="Bài thi gần nhất" className="rounded-2xl border-2 border-slate-900 bg-white px-4 pb-3.5 pt-3.5 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-200 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
      <p className="truncate text-[13px] font-semibold text-slate-500 dark:text-slate-400">
        {latestTest.testName} · <span className="tabular-nums">{formatShortDate(latestTest.date)}</span>
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-1.5">
            <span className="text-[52px] font-black leading-[0.95] tracking-tight tabular-nums text-slate-950 dark:text-white">{latestTotal}</span>
            <span className="text-base font-bold text-slate-400">/ 990</span>
          </p>
          {change !== undefined && change !== 0 && (
            <p className="mt-2 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
              <span className={'font-black tabular-nums ' + (change > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {change > 0 ? '+' : '−'}{Math.abs(change)}
              </span> so với lần trước
            </p>
          )}
        </div>
        {hasSections && (
          <dl className="flex shrink-0 flex-col gap-1.5 text-right">
            {listeningScore !== undefined && <div><dt className="text-[11.5px] font-bold text-slate-500 dark:text-slate-400">Listening</dt>
              <dd className="text-xl font-black leading-tight tabular-nums text-indigo-600 dark:text-indigo-400">{listeningScore}</dd></div>}
            {readingScore !== undefined && <div><dt className="text-[11.5px] font-bold text-slate-500 dark:text-slate-400">Reading</dt>
              <dd className="text-xl font-black leading-tight tabular-nums text-teal-700 dark:text-teal-400">{readingScore}</dd></div>}
          </dl>
        )}
      </div>
      {!hasSections && <p className="mt-2 text-[13px] text-slate-500 dark:text-slate-400">Bài gần nhất chỉ có tổng điểm; chưa ghi điểm Listening/Reading.</p>}

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-300">{remaining === 0
          ? <>Đã đạt mục tiêu <strong className="text-emerald-700 dark:text-emerald-400">{targetScore}</strong></>
          : <>Còn <strong className="text-amber-700 dark:text-amber-400">{remaining} điểm</strong> tới mục tiêu {targetScore}</>}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
          <div data-goal-bar className={'h-full rounded-full ' + (remaining === 0 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-blue-600 dark:bg-blue-500')} style={{ width: `${percent}%` }} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Stat label="Kỷ lục" value={highestScore} color="text-amber-600 dark:text-amber-400" hint={recordHint} />
        <Stat label="Trung bình" value={avgScore ?? '—'} color="text-blue-600 dark:text-blue-400" hint={`${totalTests} đề`} />
        <Stat label="Từ bài đầu" value={hasDiff ? `${diff > 0 ? '+' : ''}${diff}` : '—'} color={diffColor}
          hint={hasDiff && firstTotal !== undefined ? `${firstTotal} → ${latestTotal}` : 'Cần từ 2 đề'} />
      </dl>
    </section>
  );
}

function Stat({ label, value, color, hint }: { label: string; value: number | string; color: string; hint: string }) {
  return (
    <div className="min-w-0 border-slate-100 pl-3 first:pl-0 [&+&]:border-l dark:border-slate-800">
      <dt className="text-[11.5px] font-bold text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-xl font-black leading-tight tracking-tight tabular-nums ${color}`}>{value}</dd>
      <dd className="truncate text-[11.5px] font-semibold text-slate-500 dark:text-slate-400" title={hint}>{hint}</dd>
    </div>
  );
}
