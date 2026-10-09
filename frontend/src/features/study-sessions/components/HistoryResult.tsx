import type { StudySession } from '@/shared/types';
import { historyDate } from '@/features/study-sessions/lib/history';

export const historyPrimary = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-blue-600 px-3 py-2 text-sm font-extrabold text-white shadow-[2px_2px_0px_#0f172a] hover:bg-blue-700 dark:border-slate-300 dark:shadow-[2px_2px_0px_#cbd5e1]';

export function ScoreComparison({ session, previous }: { session: StudySession; previous?: StudySession }) {
  if (session.sessionType !== 'FULL_TEST' || session.totalScore === undefined) return <span className="history-comparison text-slate-400">—</span>;
  if (!previous) return <span className="history-comparison text-xs text-slate-500 dark:text-slate-400">Mốc đầu</span>;
  const diff = session.totalScore - previous.totalScore!;
  const context = `So với ${previous.testName} · ${historyDate(previous.date)} · ${previous.totalScore} điểm`;
  return <span title={context} aria-label={`${diff > 0 ? '+' : ''}${diff} điểm. ${context}`}
    className={`history-comparison text-xs font-bold tabular-nums ${diff > 0 ? 'text-emerald-700 dark:text-emerald-400' : diff < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>{diff > 0 ? '+' : ''}{diff}đ</span>;
}
