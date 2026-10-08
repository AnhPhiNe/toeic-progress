import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, History, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { computeSessionAttemptMap } from '@/shared/data/storage';
import { getPracticeParts } from '@/shared/domain/etsScoring';
import { testNameKey } from '@/shared/domain/testNames';
import { compareSessionDate, historyDate, previousScoreMap } from '@/features/study-sessions/lib/history';
import { SessionDetailModal } from '@/features/study-sessions/components/SessionDetailModal';
import { ScoreComparison, historyPrimary } from '@/features/study-sessions/components/HistoryResult';
import './history.css';

export interface ExamHistoryViewProps {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  theme?: 'light' | 'dark';
  onDeleteSession: (sessionId: string) => void;
  onEditSession: (session: StudySession) => void;
  onOpenSessionLogger: () => void;
  onNavigateToMistakes?: (names: string[]) => void;
}
type SortField = 'date' | 'testName' | 'scaledListening' | 'scaledReading' | 'totalScore';
type Kind = 'ALL' | 'FULL_TEST' | 'PART_PRACTICE';
type Attempt = 'ALL' | 'FIRST_ONLY' | 'RETEST_ONLY';
const HISTORY_PAGE_SIZE = 5;
function PracticeResult({ session }: { session: StudySession }) {
  const parts = getPracticeParts(session), correct = parts.reduce((sum, part) => sum + part.correct, 0), total = parts.reduce((sum, part) => sum + part.total, 0);
  return total ? <span className="text-sm">Đúng <strong>{correct}/{total}</strong> câu · <strong className="text-teal-700 dark:text-teal-300">{(correct / total * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</strong></span>
    : <span className="text-sm text-slate-500 dark:text-slate-400">Chưa ghi số câu</span>;
}

export function ExamHistoryView({ sessions, mistakes, onDeleteSession, onEditSession, onOpenSessionLogger, onNavigateToMistakes }: ExamHistoryViewProps) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<Kind>('ALL');
  const [attempt, setAttempt] = useState<Attempt>('ALL');
  const [sort, setSort] = useState<SortField>('date');
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const active = useMemo(() => sessions.filter(session => !session.deletedAt), [sessions]);
  const attempts = useMemo(() => computeSessionAttemptMap(active), [active]);
  const previous = useMemo(() => previousScoreMap(active), [active]);
  const sorted = useMemo(() => {
    const term = testNameKey(search);
    return active.filter(session => (kind === 'ALL' || session.sessionType === kind)
      && (!term || [session.testName, session.notes ?? ''].some(value => testNameKey(value).includes(term)))
      && (kind === 'PART_PRACTICE' || attempt === 'ALL' || (session.sessionType === 'FULL_TEST'
        && (attempt === 'FIRST_ONLY' ? !attempts[session.id]?.isRetest : attempts[session.id]?.isRetest))))
      .sort((a, b) => {
        if (sort === 'date') return (descending ? -1 : 1) * compareSessionDate(a, b);
        if (sort === 'testName') return (descending ? -1 : 1) * a.testName.localeCompare(b.testName, 'vi', { numeric: true }) || -compareSessionDate(a, b);
        const av = a.sessionType === 'FULL_TEST' ? a[sort] : undefined, bv = b.sessionType === 'FULL_TEST' ? b[sort] : undefined;
        // Missing scores stay last in either direction; they are not zero scores.
        if (av === undefined && bv !== undefined) return 1;
        if (av !== undefined && bv === undefined) return -1;
        return (descending ? -1 : 1) * ((av ?? 0) - (bv ?? 0)) || -compareSessionDate(a, b);
      });
  }, [active, search, kind, attempt, attempts, sort, descending]);
  const pages = Math.max(1, Math.ceil(sorted.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = sorted.slice((currentPage - 1) * HISTORY_PAGE_SIZE, currentPage * HISTORY_PAGE_SIZE);
  const detail = active.find(session => session.id === detailId);
  const changeSort = (field: SortField) => { setDescending(sort === field ? !descending : field !== 'testName'); setSort(field); setPage(1); };
  const meta = (session: StudySession) => `${session.sessionType === 'FULL_TEST' ? `Lần ${attempts[session.id]?.attemptNumber ?? 1}` : `Luyện ${getPracticeParts(session).map(part => `P${part.part}`).join(' & ') || 'Part'}`} · ${session.durationMinutes} phút`;
  const actions = (session: StudySession) => <div className="flex items-center justify-end gap-1">
    <button type="button" onClick={() => onEditSession(session)} aria-label={`Sửa bản ghi ${session.testName}`} title="Sửa kết quả"
      className="flex min-h-10 min-w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
    <button type="button" onClick={() => { if (window.confirm(`Xóa bản ghi “${session.testName}” ngày ${historyDate(session.date)}?`)) { setPage(currentPage); onDeleteSession(session.id); } }} aria-label={`Xóa bản ghi ${session.testName}`} title="Xóa bản ghi"
      className="flex min-h-10 min-w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950 dark:hover:text-rose-400"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
  </div>;
  const nameButton = (session: StudySession) => <button type="button" aria-label={`Xem chi tiết ${session.testName}, ${historyDate(session.date)}`}
    className="history-name cursor-pointer text-left text-sm font-extrabold leading-snug text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
    onClick={() => setDetailId(session.id)}>{session.testName || 'Chưa đặt tên đề'}</button>;
  const sortHeader = (field: SortField, label: string, alignRight = false) => <th scope="col" aria-sort={sort === field ? descending ? 'descending' : 'ascending' : 'none'} className={alignRight ? 'text-right' : 'text-left'}>
    <button type="button" className={`inline-flex min-h-9 cursor-pointer items-center gap-1 ${alignRight ? 'justify-end' : ''}`} aria-label={`Sắp xếp theo ${label}`} onClick={() => changeSort(field)}>
      {label}{sort === field ? descending ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />}
    </button></th>;

  return <div className="history-view space-y-5 pb-10 text-slate-800 dark:text-slate-200">
    <section className="overflow-hidden rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0px_#cbd5e1]" aria-label="Lịch sử luyện đề">
      <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-4 sm:px-5"><h2 className="flex items-center gap-2 text-base font-black text-slate-900 sm:text-lg dark:text-white"><History className="h-5 w-5 shrink-0" aria-hidden="true" />Lịch sử luyện đề</h2><button type="button" onClick={onOpenSessionLogger} className={historyPrimary}><Plus className="h-4 w-4" aria-hidden="true" />Ghi điểm</button></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 pb-4 sm:px-5 dark:border-slate-700">
        <div role="group" aria-label="Loại bài làm" className="flex flex-wrap gap-1 text-xs font-bold sm:text-sm">{([['ALL', 'Tất cả'], ['FULL_TEST', 'Full Test'], ['PART_PRACTICE', 'Luyện Part']] as const).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setAttempt('ALL'); setPage(1); }} className={`min-h-10 cursor-pointer rounded-lg px-2.5 py-1.5 ${kind === value ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>{label} {value === 'ALL' ? active.length : active.filter(session => session.sessionType === value).length}</button>)}</div>
        <div className="history-filters flex min-w-0 flex-wrap items-center gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><input type="search" aria-label="Tìm tên đề hoặc ghi chú" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm tên đề, ghi chú…" className="history-search w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" /></div>
          {kind !== 'PART_PRACTICE' && <select aria-label="Lọc lượt thi" value={attempt} onChange={event => { setAttempt(event.target.value as Attempt); setPage(1); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"><option value="ALL">Mọi lần làm</option><option value="FIRST_ONLY">Lần đầu</option><option value="RETEST_ONLY">Làm lại</option></select>}
        </div>
      </div>
      <table className="history-table w-full table-fixed border-collapse text-sm"><colgroup><col style={{ width: '13%' }} /><col style={{ width: '30%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '11%' }} /><col style={{ width: '16%' }} /><col style={{ width: '10%' }} /></colgroup><thead className="bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-900/40 dark:text-slate-400"><tr>{sortHeader('date', 'Ngày')}{sortHeader('testName', 'Tên đề')}{sortHeader('scaledListening', 'Listening', true)}{sortHeader('scaledReading', 'Reading', true)}{sortHeader('totalScore', 'Tổng', true)}<th scope="col" className="text-center">So với bài trước</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visible.map(session => <tr key={session.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50"><td className="whitespace-nowrap text-xs tabular-nums text-slate-500 dark:text-slate-400">{historyDate(session.date)}</td><td>{nameButton(session)}<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta(session)}</p></td>
          {session.sessionType === 'FULL_TEST' ? <><td className="text-right font-bold tabular-nums text-indigo-600 dark:text-indigo-300">{session.scaledListening ?? '—'}</td><td className="text-right font-bold tabular-nums text-teal-700 dark:text-teal-300">{session.scaledReading ?? '—'}</td><td className="text-right text-base font-extrabold tabular-nums">{session.totalScore ?? '—'}</td></> : <td colSpan={3} className="text-center"><PracticeResult session={session} /></td>}
          <td className="text-center"><ScoreComparison session={session} previous={previous.get(session.id)} /></td><td>{actions(session)}</td></tr>)}</tbody>
      </table>
      <div className="history-mobile divide-y divide-slate-200 dark:divide-slate-700">{visible.map(session => <article key={session.id} className="px-3 py-3"><div className="mb-1 flex items-center justify-between gap-2"><span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{historyDate(session.date)}</span>{actions(session)}</div>{nameButton(session)}<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta(session)}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">{session.sessionType === 'FULL_TEST' ? <><div className="flex flex-wrap items-center gap-3 tabular-nums"><strong className="text-base">{session.totalScore === undefined ? 'Chưa ghi điểm' : `${session.totalScore}đ`}</strong><span className="text-indigo-600 dark:text-indigo-300">L {session.scaledListening ?? '—'}</span><span className="text-teal-700 dark:text-teal-300">R {session.scaledReading ?? '—'}</span></div><ScoreComparison session={session} previous={previous.get(session.id)} /></> : <PracticeResult session={session} />}</div></article>)}</div>
      {!visible.length && <div className="space-y-2 px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400"><p>{active.length ? 'Không có bài làm khớp bộ lọc.' : 'Chưa có bài làm nào.'}</p>{active.length ? <button type="button" className="min-h-10 cursor-pointer font-bold text-blue-600 dark:text-blue-400" onClick={() => { setSearch(''); setKind('ALL'); setAttempt('ALL'); setPage(1); }}>Đặt lại bộ lọc</button> : <button type="button" className={historyPrimary} onClick={onOpenSessionLogger}>Ghi điểm đầu tiên</button>}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-3 text-xs text-slate-500 sm:px-5 dark:border-slate-700 dark:text-slate-400"><span role="status">{pages > 1 ? `${(currentPage - 1) * HISTORY_PAGE_SIZE + 1}–${Math.min(currentPage * HISTORY_PAGE_SIZE, sorted.length)} / ${sorted.length} bài làm` : `${sorted.length} bài làm`}</span>
        {pages > 1 ? <div className="flex items-center gap-2"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="min-h-10 cursor-pointer px-2 font-semibold disabled:cursor-default disabled:opacity-40">Trước</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="min-h-10 cursor-pointer px-2 font-semibold disabled:cursor-default disabled:opacity-40">Sau</button></div> : <span>{sort === 'date' ? descending ? 'Ngày mới nhất trước' : 'Ngày cũ nhất trước' : 'Đang sắp xếp theo cột'}</span>}
      </div>
    </section>
    {detail && <SessionDetailModal session={detail} sessions={active} mistakes={mistakes} attempt={attempts[detail.id]} previous={previous.get(detail.id)} onClose={closeDetail} onEdit={onEditSession} onNavigateToMistakes={onNavigateToMistakes} />}
  </div>;
}
