import type { StudySession } from '@/shared/types';
import { historyDate } from '@/features/study-sessions/lib/history';

export const historyPrimary = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-blue-600 px-3 py-2 text-sm font-extrabold text-white shadow-[2px_2px_0px_#0f172a] hover:bg-blue-700 dark:border-slate-300 dark:shadow-[2px_2px_0px_#cbd5e1]';

export function ScoreComparison({ session, previous }: { session: StudySession; previous?: StudySession }) {
  if (session.sessionType !== 'FULL_TEST' || session.totalScore === undefined) return <span className="history-comparison text-slate-400">—</span>;
  if (!previous) return <span className="history-comparison inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Mốc đầu</span>;
  const diff = session.totalScore - previous.totalScore!;
  const context = `So với ${previous.testName} · ${historyDate(previous.date)} · ${previous.totalScore} điểm`;
  return <span title={context} aria-label={`${diff > 0 ? '+' : ''}${diff} điểm. ${context}`}
    className={'history-comparison inline-flex items-center rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums ' + (diff > 0 ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300' : diff < 0 ? 'border border-rose-200/80 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>{diff > 0 ? '+' : ''}{diff}đ</span>;
}
