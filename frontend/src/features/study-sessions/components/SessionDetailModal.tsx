import { useRef } from 'react';
import { X, Pencil, ArrowRight, Trash2 } from 'lucide-react';
import { ContainerScrollCue } from '@/shared/components/ScrollCue';
import { PHONE_SHEET_BACKDROP, PHONE_SHEET_FOOTER, PHONE_SHEET_PANEL } from '@/shared/ui/surfaces';
import { createPortal } from 'react-dom';
import type { MistakeEntry, PacingRun, SessionAttemptMeta, StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { getPracticeParts, PART_MAX_QUESTIONS } from '@/shared/domain/etsScoring';
import { normalizeTestName } from '@/shared/domain/testNames';
import { historyDate, historyDuration, sourceMistakes } from '@/features/study-sessions/lib/history';
import { scoreSourceLabel } from '@/features/study-sessions/lib/fullTestScore';
import { ScoreComparison, historyPrimary } from '@/features/study-sessions/components/HistoryResult';

interface Props {
  session: StudySession;
  pacingRun?: PacingRun;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  attempt?: SessionAttemptMeta;
  previous?: StudySession;
  onClose: () => void;
  onEdit: (session: StudySession) => void;
  onDelete?: () => void;
  onNavigateToMistakes?: (names: string[]) => void;
}

export function SessionDetailModal({ session, pacingRun, sessions, mistakes, attempt, previous, onClose, onEdit, onDelete, onNavigateToMistakes }: Props) {
  const detailBodyRef = useRef<HTMLDivElement>(null);
  const ref = useModalA11y(true, onClose);
  const full = session.sessionType === 'FULL_TEST';
  const practice = getPracticeParts(session);
  const correct = practice.reduce((sum, part) => sum + part.correct, 0), total = practice.reduce((sum, part) => sum + part.total, 0);
  const pairedTotal = !full && !total && pacingRun && Number.isInteger(pacingRun.totalQuestions) && pacingRun.totalQuestions! > 0 ? pacingRun.totalQuestions! : 0;
  const pairedCorrect = pairedTotal && Number.isInteger(pacingRun?.correctAnswers) && pacingRun!.correctAnswers! >= 0 && pacingRun!.correctAnswers! <= pairedTotal ? pacingRun!.correctAnswers : undefined;
  const resultTotal = total || pairedTotal, resultCorrect = total ? correct : pairedCorrect;
  const rows = full && session.partScores ? (Object.keys(PART_MAX_QUESTIONS) as Array<keyof typeof PART_MAX_QUESTIONS>).map(key => ({ part: Number(key.slice(4)), correct: session.partScores![key], total: PART_MAX_QUESTIONS[key] })) : full ? [] : practice;
  const notes = sourceMistakes(session, sessions, mistakes);
  const source = normalizeTestName(session.testName);
  const first = attempt?.firstSession;
  const canCompareFirst = full && first && first.id !== session.id && (first.attemptNumber ?? 1) === 1;
  const score = (value: number | undefined) => value ?? 'Chưa ghi';
  const comparison = (oldScore: number | undefined, newScore: number | undefined) => oldScore === undefined || newScore === undefined ? 'Chưa đủ điểm' : `${oldScore} → ${newScore} (${newScore - oldScore > 0 ? '+' : ''}${newScore - oldScore}đ)`;
  const scores = full ? [
    ['Tổng điểm', score(session.totalScore), 'text-slate-900 dark:text-white'],
    ['Listening', score(session.scaledListening), 'text-indigo-600 dark:text-indigo-300'],
    ['Reading', score(session.scaledReading), 'text-teal-700 dark:text-teal-300']
  ] : [['Đúng', resultCorrect !== undefined && resultTotal ? `${resultCorrect}/${resultTotal}` : 'Chưa ghi', 'text-slate-900 dark:text-white'],
    ['Chính xác', resultCorrect !== undefined && resultTotal ? `${(resultCorrect / resultTotal * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` : 'Chưa ghi', 'text-teal-700 dark:text-teal-300'],
    ['Thời gian', `${historyDuration(session.durationMinutes)}`, 'text-slate-900 dark:text-white']];

  return createPortal(<div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 ${PHONE_SHEET_BACKDROP}`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="session-detail-title" className={`flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-slate-900 bg-white text-slate-900 shadow-[4px_4px_0px_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-slate-100 dark:shadow-[4px_4px_0px_#cbd5e1] ${PHONE_SHEET_PANEL}`}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5 dark:border-slate-700"><div className="min-w-0"><h3 id="session-detail-title" className="break-words text-lg font-black">{session.testName || 'Chưa đặt tên đề'}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{historyDate(session.date)} · {full ? `Lần ${attempt?.attemptNumber ?? 1}` : 'Luyện Part'} · {historyDuration(session.durationMinutes)}</p></div>
        <button type="button" onClick={onClose} aria-label="Đóng chi tiết" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>
      <div className="relative min-h-0 flex-1 flex flex-col">
        <div ref={detailBodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] sm:px-5">
        <div className="grid grid-cols-3 gap-2 border-b border-slate-200 pb-4 dark:border-slate-700">{scores.map(([label, value, color]) => <div key={label} className="min-w-0"><span className="text-xs text-slate-500 dark:text-slate-400">{label}</span><strong className={`mt-1 block break-words font-extrabold tabular-nums ${typeof value === 'string' && value === 'Chưa ghi' ? 'text-sm' : 'text-xl sm:text-2xl'} ${color}`}>{value}</strong></div>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span>{full ? scoreSourceLabel(session) : 'Kết quả luyện Part'}</span>{full && <span><ScoreComparison session={session} previous={previous} />{previous && ' so với bài trước'}</span>}</div>
        <section aria-label="Số câu đúng từng Part"><h4 className="mb-2 text-sm font-extrabold">Số câu đúng từng Part</h4>{rows.length ? <div className="grid gap-x-6 sm:grid-cols-2">{rows.map(part => <div key={part.part} className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 text-sm dark:border-slate-700"><span>Part {part.part}</span><span className="whitespace-nowrap tabular-nums">{part.correct === undefined ? 'Chưa ghi' : <><strong className="font-semibold">{part.correct}/{part.total}</strong> <span className="text-xs text-slate-500 dark:text-slate-400">· {part.total ? Math.round(part.correct / part.total * 100) : 0}%</span></>}</span></div>)}</div>
          : <p className="text-sm text-slate-500 dark:text-slate-400">Chưa ghi chi tiết Part.</p>}</section>
        {canCompareFirst && <details><summary className="cursor-pointer text-sm font-bold">So với lần đầu của cùng đề</summary><dl className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">{([['Tổng', 'totalScore'], ['Listening', 'scaledListening'], ['Reading', 'scaledReading']] as const).map(([label, key]) => <div key={key} className="flex flex-wrap justify-between gap-2"><dt>{label}</dt><dd className="tabular-nums">{comparison(first[key], session[key])}</dd></div>)}</dl></details>}
        {session.notes && <details><summary className="cursor-pointer text-sm font-bold">Ghi chú</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">{session.notes}</p></details>}
        <div className="rounded-xl bg-amber-50 px-3 py-3 dark:bg-amber-950/25"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{notes.length} lỗi đã ghi {source ? 'của đề này' : 'của bản ghi này'}</strong>{source && onNavigateToMistakes && <button type="button" className="inline-flex min-h-10 cursor-pointer items-center gap-1 text-sm font-bold text-blue-600 dark:text-blue-400" onClick={() => { onClose(); onNavigateToMistakes([source]); }}>Mở Sổ tay<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}</div><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{source ? 'Gom lỗi theo tên đề, qua mọi lần làm.' : 'Chỉ tính lỗi còn liên kết với bản ghi chưa có tên đề.'}</p></div>
        </div>
        <ContainerScrollCue containerRef={detailBodyRef} />
      </div>
      <footer className={`flex shrink-0 justify-end gap-3 border-t border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-700 ${PHONE_SHEET_FOOTER}`}>{onDelete && <button type="button" onClick={onDelete} className="mr-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" aria-hidden="true" />Xóa</button>}<button type="button" onClick={onClose} className="max-md:hidden min-h-11 cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold dark:border-slate-600">Đóng</button><button type="button" className={historyPrimary} onClick={() => { onClose(); onEdit(session); }}><Pencil className="h-4 w-4" aria-hidden="true" />Sửa kết quả</button></footer>
    </div>
  </div>, document.body);
}
