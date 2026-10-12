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
  avgScore?: number;
  totalTests: number;
  diff: number;
  hasDiff: boolean;
  firstTotal?: number;
  onOpenSessionLogger: () => void;
}

/**
 * Phones (<768px): the latest score is the one number a learner opens the app for,
 * so it leads; record, average and progress follow as three small tiles in one row.
 */
export function PhoneSummary({ latestTest, latestTotal, previousTotal, listeningScore, readingScore, targetScore, highestScore,
  bestTestDate, avgScore, totalTests, diff, hasDiff, firstTotal, onOpenSessionLogger }: SummaryProps) {
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

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Bài thi gần nhất" className="rounded-2xl border-2 border-slate-900 bg-white px-4 py-3.5 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-200 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
        <div className="flex items-baseline justify-between gap-3 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="min-w-0 truncate">{latestTest.testName}</span>
          <span className="shrink-0 tabular-nums">{formatShortDate(latestTest.date)}</span>
        </div>
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-[44px] font-black leading-none tracking-tight tabular-nums text-slate-950 dark:text-white">{latestTotal}</span>
          <span className="text-[15px] font-bold text-slate-400">/ 990</span>
          {change !== undefined && change !== 0 && (
            <span className={'ml-1 text-[15px] font-black tabular-nums ' + (change > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}
              title="So với bài Full Test trước">
              {change > 0 ? '+' : ''}{change}
            </span>
          )}
        </p>
        {listeningScore === undefined && readingScore === undefined
          ? <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">Bài gần nhất chỉ có tổng điểm; chưa ghi điểm Listening/Reading.</p>
          : <p className="mt-1.5 flex gap-3 text-[13.5px] font-black tabular-nums">
              {listeningScore !== undefined && <span className="text-indigo-600 dark:text-indigo-400">L {listeningScore}</span>}
              {readingScore !== undefined && <span className="text-teal-700 dark:text-teal-400">R {readingScore}</span>}
            </p>}
        <p className="mt-3 text-[13.5px] font-semibold text-slate-700 dark:text-slate-300">{remaining === 0
          ? <>Đã đạt mục tiêu <strong className="text-emerald-700 dark:text-emerald-400">{targetScore}</strong></>
          : <>Còn <strong className="text-amber-700 dark:text-amber-400">{remaining} điểm</strong> tới {targetScore}</>}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
          <div className="h-full rounded-full bg-slate-900 dark:bg-slate-200" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="Kỷ lục" value={highestScore} color="text-amber-600 dark:text-amber-400" hint={bestTestDate ? `Ngày ${formatShortDate(bestTestDate)}` : '—'} />
        <Tile label="Trung bình" value={avgScore ?? '—'} color="text-blue-600 dark:text-blue-400" hint={`${totalTests} đề`} />
        <Tile label="Từ bài đầu" value={hasDiff ? `${diff > 0 ? '+' : ''}${diff}` : '—'} color={diffColor}
          hint={hasDiff && firstTotal !== undefined ? `${firstTotal} → ${latestTotal}` : 'Cần từ 2 đề'} />
      </div>
    </div>
  );
}

function Tile({ label, value, color, hint }: { label: string; value: number | string; color: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-2.5 py-2.5 dark:border-slate-700 dark:bg-[#111A2C]">
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-[22px] font-black leading-tight tracking-tight tabular-nums ${color}`}>{value}</p>
      <p className="truncate text-[11.5px] font-semibold text-slate-500 dark:text-slate-400" title={hint}>{hint}</p>
    </div>
  );
}
