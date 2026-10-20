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
 * so it leads, laid out like a TOEIC score report: the total, a Listening | Reading band
 * in their section colours, the goal, then record, average and progress as the footer.
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
  // One test is trivially its own record, so the stamp waits for a second one.
  const newRecord = Boolean(latestIsBest) && totalTests > 1;

  return (
    <section aria-label="Bài thi gần nhất" className="relative overflow-hidden rounded-[20px] border-2 border-slate-900 bg-[#FFFDF7] shadow-[4px_4px_0_0_#0f172a] dark:border-slate-200 dark:bg-[#111A2C] dark:shadow-[4px_4px_0_0_#cbd5e1]">
      <div className="px-[18px] pb-3.5 pt-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Kết quả gần nhất</p>
        <p className={'mt-0.5 truncate text-[15px] font-extrabold text-slate-900 dark:text-white ' + (newRecord ? 'pr-20' : '')}>
          {latestTest.testName} <span className="font-bold tabular-nums text-slate-400">· {formatShortDate(latestTest.date)}</span>
        </p>
        {newRecord && (
          <p className="absolute right-4 top-3.5 rotate-[8deg] rounded-xl border-[2.5px] border-amber-600 px-2 py-1 text-center text-xs font-extrabold leading-tight text-amber-600 dark:border-amber-400 dark:text-amber-400">
            KỶ LỤC<br /><span className="text-[10px]">mới</span>
          </p>
        )}
        <p className="mt-2.5 flex items-baseline gap-2">
          <span className="text-[58px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white">{latestTotal}</span>
          <span className="text-base font-bold text-slate-400">/ 990</span>
          {change !== undefined && change !== 0 && (
            <span className={'ml-1 text-sm font-extrabold tabular-nums ' + (change > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}
              title="So với bài Full Test trước">
              {change > 0 ? '▲' : '▼'} {Math.abs(change)}
            </span>
          )}
        </p>
      </div>

      {hasSections
        ? <dl className="grid grid-cols-2 border-y-2 border-slate-900 text-white dark:border-slate-200">
            <div className="bg-indigo-600 px-4 py-2.5">
              <dt className="text-[11.5px] font-bold uppercase opacity-85">Listening</dt>
              <dd className="text-2xl font-extrabold tabular-nums">{listeningScore ?? '—'}</dd>
            </div>
            <div className="border-l-2 border-slate-900 bg-teal-600 px-4 py-2.5 dark:border-slate-200">
              <dt className="text-[11.5px] font-bold uppercase opacity-85">Reading</dt>
              <dd className="text-2xl font-extrabold tabular-nums">{readingScore ?? '—'}</dd>
            </div>
          </dl>
        : <p className="border-t border-slate-200 px-[18px] pt-3 text-[13px] text-slate-500 dark:border-slate-700 dark:text-slate-400">Bài gần nhất chỉ có tổng điểm; chưa ghi điểm Listening/Reading.</p>}

      <div className="px-[18px] py-3">
        <p className="flex justify-between gap-3 text-[13.5px] font-bold text-slate-800 dark:text-slate-200">
          <span>Mục tiêu {targetScore}</span>
          {remaining === 0
            ? <span className="text-emerald-700 dark:text-emerald-400">Đã đạt mục tiêu</span>
            : <span className="text-amber-700 dark:text-amber-400">còn {remaining} điểm</span>}
        </p>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
          <div data-goal-bar className={'h-full rounded-full ' + (remaining === 0 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-blue-600 dark:bg-blue-500')} style={{ width: `${percent}%` }} />
        </div>
      </div>

      <dl className="grid grid-cols-3 border-t-[1.5px] border-dashed border-slate-300 px-[18px] pb-3.5 pt-2.5 dark:border-slate-700">
        <Stat label="Kỷ lục" value={highestScore} color="text-amber-600 dark:text-amber-400" hint={bestTestDate ? `Ngày ${formatShortDate(bestTestDate)}` : '—'} />
        <Stat label="Trung bình" value={avgScore ?? '—'} color="text-blue-600 dark:text-blue-400" hint={`${totalTests} đề`} />
        <Stat label="Từ bài đầu" value={hasDiff ? `${diff > 0 ? '+' : ''}${diff}` : '—'} color={diffColor}
          hint={hasDiff && firstTotal !== undefined ? `từ ${firstTotal}` : 'Cần từ 2 đề'} />
      </dl>
    </section>
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
