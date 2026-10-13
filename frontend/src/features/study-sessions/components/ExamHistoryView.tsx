import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, History, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import type { MistakeEntry, PacingRun, StudySession } from '@/shared/types';
import { computeSessionAttemptMap } from '@/shared/data/storage';
import { getPracticeParts } from '@/shared/domain/etsScoring';
import { testNameKey } from '@/shared/domain/testNames';
import { compareSessionDate, historyDate, historyDuration, previousScoreMap } from '@/features/study-sessions/lib/history';
import { SessionDetailModal } from '@/features/study-sessions/components/SessionDetailModal';
import { ScoreComparison, historyPrimary } from '@/features/study-sessions/components/HistoryResult';
import './history.css';

export interface ExamHistoryViewProps {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  pacingRuns?: PacingRun[];
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
/** Phones load the list in steps of this many rows instead of paging. */
const PHONE_HISTORY_STEP = 10;
function PracticeResult({ session, pacingRun }: { session: StudySession; pacingRun?: PacingRun }) {
  const parts = getPracticeParts(session), correct = parts.reduce((sum, part) => sum + part.correct, 0), total = parts.reduce((sum, part) => sum + part.total, 0);
  if (!total && pacingRun && Number.isInteger(pacingRun.totalQuestions) && pacingRun.totalQuestions! > 0) {
    const answered = pacingRun.correctAnswers, count = pacingRun.totalQuestions!;
    return typeof answered !== 'number' || !Number.isInteger(answered) || answered < 0 || answered > count ? <span className="text-sm text-slate-500 dark:text-slate-400">Chưa chấm · {count} câu</span>
      : <span className="text-sm">Đúng <strong>{answered}/{count}</strong> câu · <strong className="text-teal-700 dark:text-teal-300">{(answered / count * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</strong></span>;
  }
  return total ? <span className="text-sm">Đúng <strong>{correct}/{total}</strong> câu · <strong className="text-teal-700 dark:text-teal-300">{(correct / total * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</strong></span>
    : <span className="text-sm text-slate-500 dark:text-slate-400">Chưa ghi số câu</span>;
}

export function ExamHistoryView({ sessions, mistakes, pacingRuns = [], onDeleteSession, onEditSession, onOpenSessionLogger, onNavigateToMistakes }: ExamHistoryViewProps) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<Kind>('ALL');
  const [attempt, setAttempt] = useState<Attempt>('ALL');
  const [sort, setSort] = useState<SortField>('date');
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Phones: month-grouped rows that open the detail; search and the attempt filter sit behind one button.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false);
  const [phoneShown, setPhoneShown] = useState(PHONE_HISTORY_STEP);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const active = useMemo(() => sessions.filter(session => !session.deletedAt), [sessions]);
  const pairedRuns = useMemo(() => new Map(pacingRuns.filter(run => !run.deletedAt && run.id.startsWith('pacing-v2-')).map(run => [run.id, run])), [pacingRuns]);
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
  const meta = (session: StudySession) => `${session.sessionType === 'FULL_TEST' ? `Lần ${attempts[session.id]?.attemptNumber ?? 1}` : `Luyện ${getPracticeParts(session).map(part => `P${part.part}`).join(' & ') || pairedRuns.get(session.id)?.presetName || 'Part'}`} · ${historyDuration(session.durationMinutes)}`;
  const actions = (session: StudySession) => <div className="flex items-center justify-center gap-1">
    <button type="button" onClick={() => onEditSession(session)} aria-label={`Sửa bản ghi ${session.testName}`} title="Sửa kết quả"
      className="flex min-h-10 min-w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
    <button type="button" onClick={() => { if (window.confirm(`Xóa bản ghi “${session.testName}” ngày ${historyDate(session.date)}?`)) { setPage(currentPage); onDeleteSession(session.id); } }} aria-label={`Xóa bản ghi ${session.testName}`} title="Xóa bản ghi"
      className="flex min-h-10 min-w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950 dark:hover:text-rose-400"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
  </div>;
  const nameButton = (session: StudySession) => <button type="button" aria-label={`Xem chi tiết ${session.testName}, ${historyDate(session.date)}`}
    className="history-name cursor-pointer text-left text-base font-semibold leading-snug text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
    onClick={() => setDetailId(session.id)}>{session.testName || 'Chưa đặt tên đề'}</button>;
  const sortHeader = (field: SortField, label: string, centered = true) => <th scope="col" aria-sort={sort === field ? descending ? 'descending' : 'ascending' : 'none'} className={centered ? 'text-center' : 'text-left'}>
    <button type="button" className={`history-sort inline-flex min-h-8 cursor-pointer items-center gap-1 ${centered ? 'history-sort-centered' : ''}`} aria-label={`Sắp xếp theo ${label}`} onClick={() => changeSort(field)}>
      <span>{label}</span><span className="history-sort-icon">{sort === field ? descending ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />}</span>
    </button></th>;

  const pill = (on: boolean) => 'inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 text-[13.5px] font-bold '
    + (on ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-stone-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200');
  const renderPhoneFilters = () => <div className="px-4 pb-1">
    <div className="flex items-center gap-2">
      <div role="group" aria-label="Loại bài làm" className="flex min-w-0 gap-1.5 overflow-x-auto">
        {([['ALL', 'Tất cả'], ['FULL_TEST', 'Full Test'], ['PART_PRACTICE', 'Luyện Part']] as const).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setAttempt('ALL'); setPhoneShown(PHONE_HISTORY_STEP); }} className={pill(kind === value)}>
            {label}<span className="text-[12px] opacity-70 tabular-nums">{value === 'ALL' ? active.length : active.filter(session => session.sessionType === value).length}</span>
          </button>)}
      </div>
      <button type="button" aria-label="Tìm và lọc" aria-expanded={phoneFiltersOpen} onClick={() => setPhoneFiltersOpen(value => !value)}
        className={'ml-auto flex h-[38px] w-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] '
          + (phoneFiltersOpen || search || attempt !== 'ALL' ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-stone-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300')}>
        <SlidersHorizontal className="h-[17px] w-[17px]" aria-hidden="true" />
      </button>
    </div>
    {phoneFiltersOpen && <div className="mt-2 flex gap-2">
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" aria-label="Tìm tên đề hoặc ghi chú" value={search} onChange={event => { setSearch(event.target.value); setPhoneShown(PHONE_HISTORY_STEP); }} placeholder="Tìm tên đề, ghi chú…"
          className="h-11 w-full rounded-xl border-[1.5px] border-stone-300 bg-white pl-9 pr-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></div>
      {kind !== 'PART_PRACTICE' && <select aria-label="Lọc lượt thi" value={attempt} onChange={event => { setAttempt(event.target.value as Attempt); setPhoneShown(PHONE_HISTORY_STEP); }}
        className="h-11 rounded-xl border-[1.5px] border-stone-300 bg-white px-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><option value="ALL">Mọi lần làm</option><option value="FIRST_ONLY">Lần đầu</option><option value="RETEST_ONLY">Làm lại</option></select>}
    </div>}
  </div>;

  const practiceSummary = (session: StudySession) => {
    const parts = getPracticeParts(session);
    let correct = parts.reduce((sum, part) => sum + part.correct, 0), total = parts.reduce((sum, part) => sum + part.total, 0);
    const run = pairedRuns.get(session.id);
    if (!total && run && Number.isInteger(run.totalQuestions) && run.totalQuestions! > 0 && typeof run.correctAnswers === 'number') { correct = run.correctAnswers; total = run.totalQuestions!; }
    return total ? { percent: `${Math.round(correct / total * 100)}%`, detail: `${correct}/${total} câu` } : null;
  };
  const renderPhoneList = () => {
    // Phones always read newest first, grouped by month.
    const rows = [...sorted].sort((a, b) => -compareSessionDate(a, b)).slice(0, phoneShown);
    const months: Array<{ key: string; label: string; items: StudySession[] }> = [];
    for (const session of rows) {
      const [year, month] = session.date.split('-');
      const key = `${year}-${month}`;
      if (months[months.length - 1]?.key !== key) months.push({ key, label: `Tháng ${Number(month)} · ${year}`, items: [] });
      months[months.length - 1].items.push(session);
    }
    if (!rows.length) return <div className="space-y-2 px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400"><p>{active.length ? 'Không có bài làm khớp bộ lọc.' : 'Chưa có bài làm nào. Bấm nút ＋ ở dưới để ghi điểm.'}</p>
      {active.length > 0 && <button type="button" className="min-h-11 cursor-pointer font-bold text-blue-600 dark:text-blue-400" onClick={() => { setSearch(''); setKind('ALL'); setAttempt('ALL'); }}>Đặt lại bộ lọc</button>}</div>;
    return <div>
      {months.map(group => <section key={group.key} aria-label={group.label}>
        <h3 className="px-4 pb-1.5 pt-4 text-[12px] font-black uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">{group.label}</h3>
        <ul className="divide-y divide-stone-200 border-y border-stone-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#111A2C]">
          {group.items.map(session => {
            const [, month, day] = session.date.split('-');
            const full = session.sessionType === 'FULL_TEST';
            const attemptNumber = attempts[session.id]?.attemptNumber ?? 1;
            const practice = full ? null : practiceSummary(session);
            return <li key={session.id}>
              <button type="button" onClick={() => setDetailId(session.id)} aria-label={`Xem chi tiết ${session.testName}, ${historyDate(session.date)}`}
                className="flex min-h-[64px] w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left">
                <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-stone-100 leading-none dark:bg-slate-800">
                  <span className="text-[17px] font-black tabular-nums text-slate-900 dark:text-white">{day}</span>
                  <span className="mt-0.5 text-[10.5px] font-bold text-slate-500 dark:text-slate-400">T{Number(month)}</span>
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{session.testName || 'Chưa đặt tên đề'}</span>
                  {full && attemptNumber > 1 && <span className="shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-black text-violet-700 dark:bg-violet-950 dark:text-violet-300">Lần {attemptNumber}</span>}
                </span>
                <span className="shrink-0 text-right">
                  {full
                    ? <><span className="block text-[20px] font-black leading-tight tabular-nums text-slate-950 dark:text-white">{session.totalScore ?? '—'}</span><ScoreComparison session={session} previous={previous.get(session.id)} /></>
                    : <><span className="block text-[17px] font-black leading-tight tabular-nums text-teal-700 dark:text-teal-300">{practice?.percent ?? '—'}</span><span className="text-[12px] font-bold text-slate-500 dark:text-slate-400">{practice?.detail ?? 'Chưa chấm'}</span></>}
                </span>
              </button>
            </li>;
          })}
        </ul>
      </section>)}
      {sorted.length > phoneShown && <button type="button" onClick={() => setPhoneShown(value => value + PHONE_HISTORY_STEP)}
        className="mx-4 mt-3 flex min-h-11 w-[calc(100%-2rem)] cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-stone-300 bg-white text-[14px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        Xem thêm {Math.min(PHONE_HISTORY_STEP, sorted.length - phoneShown)} bài
      </button>}
    </div>;
  };

  return <div className="history-view space-y-5 pb-16 sm:pb-20 text-slate-800 dark:text-slate-200">
    <section className="overflow-hidden rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0px_#cbd5e1] max-md:-mx-4 max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none max-md:dark:bg-transparent" aria-label="Lịch sử luyện đề">
      <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-3 sm:px-5 max-md:hidden"><h2 className="flex items-center gap-2 text-base font-black text-slate-900 sm:text-lg dark:text-white"><History className="h-5 w-5 shrink-0" aria-hidden="true" />Lịch sử luyện đề</h2><button type="button" onClick={onOpenSessionLogger} className={historyPrimary}><Plus className="h-4 w-4" aria-hidden="true" />Ghi điểm</button></div>
      {isPhone ? renderPhoneFilters() : <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 pb-3 sm:px-5 dark:border-slate-700">
        <div role="group" aria-label="Loại bài làm" className="history-kind-filter inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold sm:text-sm dark:border-slate-700 dark:bg-[#111A2C]">{([['ALL', 'Tất cả'], ['FULL_TEST', 'Full Test'], ['PART_PRACTICE', 'Luyện Part']] as const).map(([value, label]) =>
          <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setAttempt('ALL'); setPage(1); }} className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 ${kind === value ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-400 dark:text-slate-950 dark:hover:bg-blue-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            {label}{' '}<span className={`inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums ${kind === value ? 'bg-white/20 text-white dark:bg-slate-950/10 dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{value === 'ALL' ? active.length : active.filter(session => session.sessionType === value).length}</span>
          </button>)}</div>
        <div className="history-filters flex min-w-0 flex-wrap items-center gap-2"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><input type="search" aria-label="Tìm tên đề hoặc ghi chú" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm tên đề, ghi chú…" className="history-search w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" /></div>
          {kind !== 'PART_PRACTICE' && <select aria-label="Lọc lượt thi" value={attempt} onChange={event => { setAttempt(event.target.value as Attempt); setPage(1); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"><option value="ALL">Mọi lần làm</option><option value="FIRST_ONLY">Lần đầu</option><option value="RETEST_ONLY">Làm lại</option></select>}
        </div>
      </div>}
      {isPhone ? renderPhoneList() : <>
      <table className="history-table w-full table-fixed border-collapse text-sm"><colgroup><col style={{ width: '13%' }} /><col style={{ width: '30%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '11%' }} /><col style={{ width: '16%' }} /><col style={{ width: '10%' }} /></colgroup><thead className="bg-slate-50 text-sm font-semibold text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"><tr>{sortHeader('date', 'Ngày')}{sortHeader('testName', 'Tên đề', false)}{sortHeader('scaledListening', 'Listening')}{sortHeader('scaledReading', 'Reading')}{sortHeader('totalScore', 'Tổng')}<th scope="col" className="text-center">So với bài trước</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{visible.map(session => <tr key={session.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50"><td className="whitespace-nowrap text-center text-sm tabular-nums text-slate-600 dark:text-slate-300">{historyDate(session.date)}</td><td>{nameButton(session)}<p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{meta(session)}</p></td>
          {session.sessionType === 'FULL_TEST' ? <><td className="text-center text-base font-semibold tabular-nums text-indigo-600 dark:text-indigo-300">{session.scaledListening ?? '—'}</td><td className="text-center text-base font-semibold tabular-nums text-teal-700 dark:text-teal-300">{session.scaledReading ?? '—'}</td><td className="text-center text-xl font-extrabold tabular-nums">{session.totalScore ?? '—'}</td></> : <td colSpan={3} className="text-center"><PracticeResult session={session} pacingRun={pairedRuns.get(session.id)} /></td>}
          <td className="text-center"><ScoreComparison session={session} previous={previous.get(session.id)} /></td><td>{actions(session)}</td></tr>)}</tbody>
      </table>
      <div className="history-mobile divide-y divide-slate-200 dark:divide-slate-700">{visible.map(session => <article key={session.id} className="px-3 py-3"><div className="mb-1 flex items-center justify-between gap-2"><span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{historyDate(session.date)}</span>{actions(session)}</div>{nameButton(session)}<p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{meta(session)}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">{session.sessionType === 'FULL_TEST' ? <><div className="flex flex-wrap items-center gap-3 tabular-nums"><strong className="text-xl">{session.totalScore === undefined ? 'Chưa ghi điểm' : `${session.totalScore}đ`}</strong><span className="text-base font-semibold text-indigo-600 dark:text-indigo-300">L {session.scaledListening ?? '—'}</span><span className="text-base font-semibold text-teal-700 dark:text-teal-300">R {session.scaledReading ?? '—'}</span></div><ScoreComparison session={session} previous={previous.get(session.id)} /></> : <PracticeResult session={session} pacingRun={pairedRuns.get(session.id)} />}</div></article>)}</div>
      {!visible.length && <div className="space-y-2 px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400"><p>{active.length ? 'Không có bài làm khớp bộ lọc.' : 'Chưa có bài làm nào.'}</p>{active.length ? <button type="button" className="min-h-10 cursor-pointer font-bold text-blue-600 dark:text-blue-400" onClick={() => { setSearch(''); setKind('ALL'); setAttempt('ALL'); setPage(1); }}>Đặt lại bộ lọc</button> : <button type="button" className={historyPrimary} onClick={onOpenSessionLogger}>Ghi điểm đầu tiên</button>}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:px-5 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"><span role="status" className="tabular-nums">
        {pages > 1 ? <><strong className="font-semibold">{(currentPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(currentPage * HISTORY_PAGE_SIZE, sorted.length)}</strong>{' / '}</> : null}<strong className="font-semibold">{sorted.length}</strong>{' bài làm'}
      </span>
        {pages > 1 ? <nav aria-label="Trang lịch sử" className="flex items-center gap-2">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="min-h-10 cursor-pointer rounded-lg border border-blue-200 bg-white px-2 font-semibold text-blue-700 transition-colors duration-150 hover:bg-blue-50 disabled:cursor-default disabled:border-slate-200 disabled:bg-transparent disabled:text-slate-400 disabled:hover:bg-transparent motion-reduce:transition-none dark:border-blue-800 dark:bg-[#111A2C] dark:text-blue-300 dark:hover:bg-blue-950/40 dark:disabled:border-slate-700 dark:disabled:bg-transparent dark:disabled:text-slate-500 dark:disabled:hover:bg-transparent">Trước</button>
          <span className="whitespace-nowrap tabular-nums"><strong className="font-bold text-blue-700 dark:text-blue-300">{currentPage}</strong>{' / '}{pages}</span>
          <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="min-h-10 cursor-pointer rounded-lg border border-blue-200 bg-white px-2 font-semibold text-blue-700 transition-colors duration-150 hover:bg-blue-50 disabled:cursor-default disabled:border-slate-200 disabled:bg-transparent disabled:text-slate-400 disabled:hover:bg-transparent motion-reduce:transition-none dark:border-blue-800 dark:bg-[#111A2C] dark:text-blue-300 dark:hover:bg-blue-950/40 dark:disabled:border-slate-700 dark:disabled:bg-transparent dark:disabled:text-slate-500 dark:disabled:hover:bg-transparent">Sau</button>
        </nav> : <span>{sort === 'date' ? descending ? 'Ngày mới nhất trước' : 'Ngày cũ nhất trước' : 'Đang sắp xếp theo cột'}</span>}
      </div>
      </>}
    </section>
    {detail && <SessionDetailModal session={detail} pacingRun={pairedRuns.get(detail.id)} sessions={active} mistakes={mistakes} attempt={attempts[detail.id]} previous={previous.get(detail.id)} onClose={closeDetail} onEdit={onEditSession} onNavigateToMistakes={onNavigateToMistakes}
      onDelete={() => { if (window.confirm(`Xóa bản ghi “${detail.testName}” ngày ${historyDate(detail.date)}?`)) { closeDetail(); onDeleteSession(detail.id); } }} />}
  </div>;
}
