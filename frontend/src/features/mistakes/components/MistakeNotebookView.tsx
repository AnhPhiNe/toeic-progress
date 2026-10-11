import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Brain, Plus, Search, SlidersHorizontal, BookOpen, X, AlertCircle } from 'lucide-react';
import type { MistakeEntry, ErrorCategory, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { MistakeCard } from '@/features/mistakes/components/MistakeCard';
import { MistakeEntryModal } from '@/features/mistakes/components/MistakeEntryModal';
import { isDueForReview, canReview } from '@/features/mistakes/lib/spacedRepetition';
import { loadMistakes } from '@/shared/data/storage';
import { mistakeTestName, testNameKey, uniqueTestNames } from '@/features/mistakes/lib/sourceTests';
import { collectTestNames } from '@/shared/domain/testNames';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import './notebook.css';

const NOTEBOOK_PAGE_SIZE = 5;
const STATUS_FILTER_STYLE = {
  ALL: {
    active: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-400 dark:text-slate-950 dark:hover:bg-blue-300',
    inactive: 'text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40',
    activeCount: 'bg-white/20 text-white dark:bg-slate-950/10 dark:text-slate-950',
    inactiveCount: 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200'
  },
  DUE: {
    active: 'bg-amber-300 text-amber-950 hover:bg-amber-400 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300',
    inactive: 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40',
    activeCount: 'bg-white/40 text-amber-950 dark:bg-amber-950/10 dark:text-amber-950',
    inactiveCount: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
  },
  MASTERED: {
    active: 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300',
    inactive: 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40',
    activeCount: 'bg-white/20 text-white dark:bg-emerald-950/10 dark:text-emerald-950',
    inactiveCount: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
  }
} as const;

interface MistakeNotebookViewProps {
  mistakes: MistakeEntry[];
  sessions?: StudySession[];
  initialSourceNames?: string[];
  dueCount: number;
  onStartReview: (ids?: string[]) => void;
  onAddMistake: (entry: MistakeEntry) => void;
  onMarkMastered: (id: string) => void;
  onReopenCards: (ids: string[]) => void;
  onDeleteMistake: (id: string) => void;
  onUpdateMistake: (entry: MistakeEntry, original: MistakeEntry) => void;
}

export function MistakeNotebookView({ mistakes, sessions = [], initialSourceNames, dueCount, onStartReview, onAddMistake,
  onMarkMastered, onReopenCards, onDeleteMistake, onUpdateMistake }: MistakeNotebookViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState<number | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'DUE' | 'MASTERED'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | 'ALL'>('ALL');
  const [selectedTest, setSelectedTest] = useState(() => initialSourceNames === undefined ? 'ALL'
    : initialSourceNames.length === 1 ? initialSourceNames[0] ? `test:${testNameKey(initialSourceNames[0])}` : 'NONE' : 'SCOPE');
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [entry, setEntry] = useState<MistakeEntry | null | undefined>();
  const [reusedReading, setReusedReading] = useState<{ text: string; sourceName: string; sourceImageIds?: string[] } | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [feedback, setFeedback] = useState<{ id: number; message: string; error: boolean } | null>(null);
  const feedbackSequence = useRef(0);
  const notify = useCallback((message: string, error = false) => { setFeedback({ id: ++feedbackSequence.current, message, error }); }, []);
  const savedFeedback = useCallback((message: string) => notify(message), [notify]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), feedback.error ? 7000 : 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  const markMastered = (id: string) => {
    try {
      onMarkMastered(id);
      const saved = loadMistakes().find(mistake => mistake.id === id);
      if (saved?.status === 'MASTERED' && canReview(saved)) notify('Đã đánh dấu Thông suốt');
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa lưu được trạng thái thẻ.', true); }
  };
  const closeEntry = useCallback(() => { setEntry(undefined); setReusedReading(null); }, []);
  const openCreate = () => { setReusedReading(null); setEntry(null); };
  const openEdit = (value: MistakeEntry) => { setReusedReading(null); setEntry(value); };
  const sessionNames = useMemo(() => new Map(sessions.filter(s => !s.deletedAt).map(s => [s.id, s.testName])), [sessions]);
  const sourcedMistakes = useMemo(() => mistakes.map(m => ({ ...m, sourceTestName: mistakeTestName(m, sessionNames) })), [mistakes, sessionNames]);
  const sourceNames = useMemo(() => uniqueTestNames(sourcedMistakes.map(m => m.sourceTestName)), [sourcedMistakes]);
  const scopeKeys = useMemo(() => new Set((initialSourceNames ?? []).map(testNameKey)), [initialSourceNames]);
  const filterSourceNames = useMemo(() => uniqueTestNames([...sourceNames, ...(initialSourceNames ?? [])]), [sourceNames, initialSourceNames]);
  const sourceSuggestions = useMemo(() => collectTestNames(sessions, mistakes), [sessions, mistakes]);
  const matchingMistakes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sourcedMistakes.filter(m => (!term || [m.questionContext, m.userMistake, m.userReason ?? '', m.correctAnswer, m.trapTip ?? '', m.sourceTestName, ...m.tags]
      .some(value => value.toLowerCase().includes(term))) && (selectedPart === 'ALL' || m.part === selectedPart)
      && (selectedTest === 'ALL' || (selectedTest === 'SCOPE' ? scopeKeys.has(testNameKey(m.sourceTestName))
        : selectedTest === 'NONE' ? !m.sourceTestName : `test:${testNameKey(m.sourceTestName)}` === selectedTest))
      && (selectedCategory === 'ALL' || m.category === selectedCategory));
  }, [sourcedMistakes, searchTerm, selectedPart, selectedTest, selectedCategory, scopeKeys]);
  const stats = useMemo(() => ({ total: matchingMistakes.length, due: matchingMistakes.filter(m => isDueForReview(m)).length,
    mastered: matchingMistakes.filter(m => m.status === 'MASTERED' && canReview(m)).length }), [matchingMistakes]);
  const filteredMistakes = useMemo(() => matchingMistakes.filter(m => selectedStatus === 'ALL' ||
    (selectedStatus === 'DUE' ? isDueForReview(m) : m.status === 'MASTERED' && canReview(m))), [matchingMistakes, selectedStatus]);
  const pageCount = Math.max(1, Math.ceil(filteredMistakes.length / NOTEBOOK_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleMistakes = filteredMistakes.slice((currentPage - 1) * NOTEBOOK_PAGE_SIZE, currentPage * NOTEBOOK_PAGE_SIZE);
  useEffect(() => { setPage(current => Math.min(current, pageCount)); }, [pageCount]);
  const activeFilterCount = Number(selectedTest !== 'ALL') + Number(selectedPart !== 'ALL') + Number(selectedCategory !== 'ALL') + Number(Boolean(searchTerm.trim()));
  const reviewCount = activeFilterCount ? stats.due : dueCount;
  const defaultSourceName = filterSourceNames.find(name => `test:${testNameKey(name)}` === selectedTest) ?? '';
  const resetFilters = () => { setPage(1); setSearchTerm(''); setSelectedTest('ALL'); setSelectedPart('ALL'); setSelectedStatus('ALL'); setSelectedCategory('ALL'); };
  const toggleRow = (id: string) => setExpandedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [filterOpen]);

  return (
    <div className="notebook-view animate-fade-in pb-10">
      <section aria-labelledby="notebook-heading" className="rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-[#121A2B] dark:shadow-[3px_3px_0px_#cbd5e1]">
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3 pt-4 sm:px-5">
        <h2 id="notebook-heading" className="flex items-center gap-2 text-base font-black text-slate-900 sm:text-lg dark:text-white"><BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />Sổ tay bắt bẫy</h2>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex">
          <button
            type="button"
            onClick={() => onStartReview(activeFilterCount ? matchingMistakes.filter(m => isDueForReview(m)).map(m => m.id) : undefined)}
            disabled={reviewCount === 0}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition-all ${
              reviewCount > 0
                ? 'cursor-pointer border-2 border-slate-900 bg-emerald-400 text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] hover:bg-emerald-300 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                : 'cursor-not-allowed border-2 border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
            {reviewCount > 0
              ? <span>Ôn {reviewCount} thẻ</span>
              : <span>Chưa có thẻ<span className="hidden sm:inline"> đến hạn</span></span>}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-yellow-300 px-4 py-2 text-sm font-extrabold text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] transition-all hover:bg-yellow-200 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
            <span>Ghi Chú Bẫy</span>
          </button>
        </div>
      </header>
      {mistakes.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 pb-4 sm:px-5 dark:border-slate-700">
          <div className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold sm:text-sm dark:border-slate-700 dark:bg-[#121A2B]" role="group" aria-label="Lọc theo trạng thái">
            {([['ALL', 'Tất cả', stats.total], ['DUE', 'Đến hạn', stats.due], ['MASTERED', 'Thông suốt', stats.mastered]] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={selectedStatus === value}
                onClick={() => { setSelectedStatus(value); setPage(1); }}
                className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 ${
                  selectedStatus === value
                    ? STATUS_FILTER_STYLE[value].active
                    : STATUS_FILTER_STYLE[value].inactive
                }`}
              >
                {label}{' '}<span className={`inline-flex min-w-5 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums ${selectedStatus === value ? STATUS_FILTER_STYLE[value].activeCount : STATUS_FILTER_STYLE[value].inactiveCount}`}>{count}</span>
              </button>
            ))}
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Tìm câu hỏi, mẹo…"
                aria-label="Tìm trong sổ tay"
                className="min-h-11 w-full rounded-lg border-2 border-slate-300 bg-white py-1.5 pl-8 pr-3 text-base sm:w-56 sm:text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div ref={filterRef} className="relative">
              <button
                type="button"
                onClick={() => setFilterOpen(value => !value)}
                aria-expanded={filterOpen}
                aria-label="Bộ lọc"
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-[13px] font-semibold ${
                  activeFilterCount > 0
                    ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
                    : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Lọc</span>
                {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
              </button>
              {filterOpen && (
                <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border-2 border-slate-900 bg-white p-3 shadow-[3px_3px_0px_#0f172a] dark:border-slate-600 dark:bg-[#121A2B]">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Đề
                    <select aria-label="Đề" value={selectedTest} onChange={e => { setSelectedTest(e.target.value); setPage(1); }}
                      className="mt-1 block w-full rounded-lg border-2 border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <option value="ALL">Tất cả đề</option><option value="NONE">Chưa gắn đề</option>
                      {initialSourceNames !== undefined && initialSourceNames.length !== 1 && <option value="SCOPE">Các đề trong phạm vi chọn</option>}
                      {filterSourceNames.map(name => <option key={testNameKey(name)} value={`test:${testNameKey(name)}`}>{name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Part
                    <select
                      aria-label="Part"
                      value={selectedPart}
                      onChange={e => { setSelectedPart(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)); setPage(1); }}
                      className="mt-1 block w-full rounded-lg border-2 border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="ALL">Mọi Part</option>
                      {[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>Part {p}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nguyên nhân
                    <select
                      aria-label="Nguyên nhân"
                      value={selectedCategory}
                      onChange={e => { setSelectedCategory(e.target.value as ErrorCategory | 'ALL'); setPage(1); }}
                      className="mt-1 block w-full rounded-lg border-2 border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="ALL">Mọi nguyên nhân</option>
                      {Object.entries(ERROR_CATEGORY_LABELS).map(([cat, val]) => <option key={cat} value={cat}>{val.label}</option>)}
                    </select>
                  </label>
                  {activeFilterCount > 0 && (
                    <button type="button" onClick={resetFilters} className="cursor-pointer text-xs font-semibold text-blue-600 dark:text-blue-400">
                      Đặt lại bộ lọc
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mistakes.length === 0 ? (
        <div className="space-y-2 px-4 py-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">Chưa có lỗi sai nào</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Bấm “Ghi Chú Bẫy”, dán câu bạn làm sai và AI sẽ soạn ghi chú.</p>
        </div>
      ) : (
        <div className="notebook-list divide-y divide-slate-200 dark:divide-slate-800">
          {visibleMistakes.map(mistake => (
            <MistakeCard
              key={mistake.id}
              mistake={mistake}
              expanded={expandedIds.has(mistake.id)}
              onToggle={() => toggleRow(mistake.id)}
              onReview={() => onStartReview([mistake.id])}
              onEdit={() => openEdit(mistakes.find(value => value.id === mistake.id) ?? mistake)}
              onReuseReading={mistake.part === 7 && typeof mistake.question === 'string' && (mistake.context?.trim() || mistake.sourceImageIds?.length) ? () => {
                setReusedReading({ text: mistake.context ?? '', sourceName: mistake.sourceTestName ?? '', sourceImageIds: mistake.sourceImageIds }); setEntry(null);
              } : undefined}
              onDelete={() => { if (window.confirm('Xóa lỗi này khỏi sổ tay?')) onDeleteMistake(mistake.id); }}
              onMarkMastered={() => markMastered(mistake.id)}
              onReopen={() => onReopenCards([mistake.id])}
            />
          ))}
          {filteredMistakes.length === 0 && (
            <div className="space-y-2 px-4 py-10 text-center text-sm">
              <p className="text-slate-600 dark:text-slate-400">Không có thẻ nào khớp bộ lọc.</p>
              <button type="button" onClick={resetFilters} className="cursor-pointer font-semibold text-blue-600 dark:text-blue-400">Đặt lại bộ lọc</button>
            </div>
          )}
          {filteredMistakes.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-2xl bg-slate-50 px-3.5 py-3 text-sm sm:px-5 dark:bg-slate-900/40">
              <span role="status" className="tabular-nums text-slate-600 dark:text-slate-300">
                <strong className="font-semibold">{(currentPage - 1) * NOTEBOOK_PAGE_SIZE + 1}–{Math.min(currentPage * NOTEBOOK_PAGE_SIZE, filteredMistakes.length)}</strong>{' / '}<strong className="font-semibold">{filteredMistakes.length}</strong>{' thẻ'}
              </span>
              {pageCount > 1 && <nav aria-label="Trang Sổ tay" className="flex items-center gap-2">
                <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}
                  className="notebook-page-button">Trước</button>
                <span className="whitespace-nowrap tabular-nums"><strong className="font-bold text-blue-700 dark:text-blue-300">{currentPage}</strong>{' / '}{pageCount}</span>
                <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}
                  className="notebook-page-button">Sau</button>
              </nav>}
            </div>
          )}
        </div>
      )}

      </section>

      <div role="status" aria-live="polite" className="notebook-feedback-region">
        {feedback && <div key={feedback.id} className={`notebook-feedback ${feedback.error ? 'is-error' : ''}`}>
          {feedback.error ? <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" /> : <SuccessMark />}
          <p className="min-w-0 flex-1 text-sm font-semibold">{feedback.message}</p>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setFeedback(null)} className="flex min-h-9 min-w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>}
      </div>

      {entry !== undefined && <MistakeEntryModal key={`${entry?.id ?? 'new'}:${editorVersion}`} original={entry}
        sourceSuggestions={sourceSuggestions} initialSourceName={entry ? mistakeTestName(entry, sessionNames) : reusedReading?.sourceName ?? defaultSourceName}
        initialReading={reusedReading?.text}
        initialSourceImageIds={reusedReading?.sourceImageIds}
        onAdd={onAddMistake} onUpdate={onUpdateMistake} onClose={closeEntry} onSaved={savedFeedback}
        onReload={() => { setEntry(loadMistakes().find(value => value.id === entry?.id)); setEditorVersion(value => value + 1); }} />}
    </div>
  );
}
