import { Plus } from 'lucide-react';
import type { StudySession } from '@/shared/types';
import { formatShortDate, ScoreReportCard } from './ScoreReportCard';

interface SummaryProps {
  latestTest: StudySession | null;
  latestTotal: number;
  previousTotal?: number;
  listeningScore?: number;
  readingScore?: number;
  targetScore: number;
  highestScore: number;
  bestTestDate?: string;
  /** The latest test is also the record, so the card shows the record stamp */
  latestIsBest?: boolean;
  avgScore?: number;
  totalTests: number;
  diff: number;
  hasDiff: boolean;
  firstTotal?: number;
  onOpenSessionLogger: () => void;
}

/**
 * Phones (<768px): the latest score is the one number a learner opens the app for, so the
 * score report leads, with record, average and progress as its footer instead of separate tiles.
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

  const diffColor = !hasDiff ? 'text-slate-400 dark:text-slate-500' : diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

  return (
    // One test is trivially its own record, so the stamp waits for a second one.
    <ScoreReportCard latestTest={latestTest} latestTotal={latestTotal} previousTotal={previousTotal} listeningScore={listeningScore}
      readingScore={readingScore} targetScore={targetScore} newRecord={Boolean(latestIsBest) && totalTests > 1}>
      <dl className="grid grid-cols-3 border-t-[1.5px] border-dashed border-slate-300 px-[18px] pb-3.5 pt-2.5 dark:border-slate-700">
        <Stat label="Kỷ lục" value={highestScore} color="text-amber-600 dark:text-amber-400" hint={bestTestDate ? `Ngày ${formatShortDate(bestTestDate)}` : '—'} />
        <Stat label="Trung bình" value={avgScore ?? '—'} color="text-blue-600 dark:text-blue-400" hint={`${totalTests} đề`} />
        <Stat label="Từ bài đầu" value={hasDiff ? `${diff > 0 ? '+' : ''}${diff}` : '—'} color={diffColor}
          hint={hasDiff && firstTotal !== undefined ? `từ ${firstTotal}` : 'Cần từ 2 đề'} />
      </dl>
    </ScoreReportCard>
  );
}

function Stat({ label, value, color, hint }: { label: string; value: number | string; color: string; hint: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-bold text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`text-[19px] font-extrabold leading-tight tabular-nums ${color}`}>{value}</dd>
      <dd className="truncate text-[11px] font-semibold text-slate-400 dark:text-slate-500" title={hint}>{hint}</dd>
    </div>
  );
}
