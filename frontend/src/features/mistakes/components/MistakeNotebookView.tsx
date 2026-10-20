import { useState, useMemo, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { Brain, ChevronDown, Plus, Search, SlidersHorizontal, BookOpen, X, AlertCircle } from 'lucide-react';
import type { MistakeEntry, ErrorCategory, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { MistakeCard } from '@/features/mistakes/components/MistakeCard';
import { MistakeDetailFlow } from '@/features/mistakes/components/MistakeDetailFlow';
import { DesktopDetailFlow } from '@/features/mistakes/components/DesktopDetailFlow';
import { needsSupplement, sessionDrafts } from '@/features/mistakes/lib/mistakeDrafts';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { inputText, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { mergeExplanation } from '@/features/mistakes/lib/explanationMerge';
import { canRetryFree, explanationsVersion, isExplaining, retryExplanation, subscribeExplanations } from '@/features/mistakes/services/explanationQueue';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { MistakeEntryModal } from '@/features/mistakes/components/MistakeEntryModal';
import { isDueForReview, canReview } from '@/features/mistakes/lib/spacedRepetition';
import { loadMistakes } from '@/shared/data/storage';
import { mistakeTestName, testNameKey, uniqueTestNames } from '@/features/mistakes/lib/sourceTests';
import { collectTestNames } from '@/shared/domain/testNames';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import './notebook.css';

const NOTEBOOK_PAGE_SIZE = 5;
/** Phones list each status group in steps of this many rows. */
const PHONE_GROUP_STEP = 10;
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
  /** Opens the note form for a test, or with `detailSessionId` the detail flow for that test's draft cards. */
  createRequest?: { sourceName?: string; sessionId?: string; detailSessionId?: string };
  dueCount: number;
  onStartReview: (ids?: string[]) => void;
  onAddMistake: (entry: MistakeEntry) => void;
  onMarkMastered: (id: string) => void;
  onReopenCards: (ids: string[]) => void;
  onDeleteMistake: (id: string) => void;
  onUpdateMistake: (entry: MistakeEntry, original: MistakeEntry) => void;
}

/** A wrong question created by logging a test, as opposed to a card the learner wrote in the notebook. */
const fromLoggedTest = (mistake: MistakeEntry) => Boolean(mistake.sessionId) && mistake.questionNumber !== undefined;

export function MistakeNotebookView({ mistakes, sessions = [], initialSourceNames, createRequest, dueCount, onStartReview, onAddMistake,
  onMarkMastered, onReopenCards, onDeleteMistake, onUpdateMistake }: MistakeNotebookViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState<number | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'DUE' | 'MASTERED'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | 'ALL'>('ALL');
  const [selectedTest, setSelectedTest] = useState(() => initialSourceNames === undefined ? 'ALL'
    : initialSourceNames.length === 1 ? initialSourceNames[0] ? `test:${testNameKey(initialSourceNames[0])}` : 'NONE' : 'SCOPE');
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  // Phones: the list is grouped by status instead of the Tất cả / Đến hạn / Thông suốt filter.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, number>>({ pending: PHONE_GROUP_STEP, due: PHONE_GROUP_STEP });
  const filterRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [entry, setEntry] = useState<MistakeEntry | null | undefined>(createRequest && !createRequest.detailSessionId ? null : undefined);
  // Cards being filled in one after another (the "Ghi chi tiết câu sai" flow), kept as ids so saves show the latest version.
  const [detailIds, setDetailIds] = useState<string[] | null>(() => {
    const ids = createRequest?.detailSessionId ? sessionDrafts(createRequest.detailSessionId, mistakes).map(mistake => mistake.id) : [];
    return ids.length ? ids : null;
  });
  const [sessionSource, setSessionSource] = useState(createRequest);
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
  const closeEntry = useCallback(() => { setEntry(undefined); setReusedReading(null); setSessionSource(undefined); }, []);
  const openCreate = () => { setReusedReading(null); setSessionSource(undefined); setEntry(null); };
  const openEdit = (value: MistakeEntry) => { setReusedReading(null); setSessionSource(undefined); setEntry(value); };
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
  // Computers list a logged test's wrong questions still to be filled in as one row per test above the list.
  const filteredMistakes = useMemo(() => matchingMistakes.filter(m => (isPhone || !(needsSupplement(m) && fromLoggedTest(m))) && (selectedStatus === 'ALL' ||
    (selectedStatus === 'DUE' ? isDueForReview(m) : m.status === 'MASTERED' && canReview(m)))), [matchingMistakes, selectedStatus, isPhone]);
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

  // Cards read from a screenshot have no explanation yet; the learner asks for one on the card (one AI use).
  const [explainingId, setExplainingId] = useState('');
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const explain = async (card: MistakeEntry) => {
    if (explainingId) return;
    const sourceAnswer = card.answerSource === 'PROVIDED' ? optionLetter(card.correctAnswer) : '';
    const input: MistakeInput = { question: card.question ?? '', options: card.options ?? [], context: card.context ?? '', part: card.part,
      userChoiceState: card.userChoiceState ?? 'UNKNOWN', userChoice: card.userChoiceState === 'CHOSEN' ? card.userChoice ?? '' : '',
      userReason: card.userReason ?? '', sourceAnswer, ...(card.category !== 'OTHER' ? { errorCategory: card.category } : {}) };
    setExplainingId(card.id);
    try {
      const { draft } = await aiService.extractMistakeWithAI(inputText(input), getToken, input);
      const latest = loadMistakes().find(value => value.id === card.id) ?? card;
      onUpdateMistake(mergeExplanation(latest, draft), latest);
      notify('Đã thêm giải thích');
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa giải thích được. Hãy thử lại.', true); }
    finally { setExplainingId(''); removeCaptcha(); }
  };

  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  const cardProps = (mistake: (typeof sourcedMistakes)[number]) => ({
    mistake,
    expanded: expandedIds.has(mistake.id),
    onToggle: () => toggleRow(mistake.id),
    onReview: () => onStartReview([mistake.id]),
    onEdit: () => openEdit(mistakes.find(value => value.id === mistake.id) ?? mistake),
    onReuseReading: mistake.part === 7 && typeof mistake.question === 'string' && (mistake.context?.trim() || mistake.sourceImageIds?.length) ? () => {
      setReusedReading({ text: mistake.context ?? '', sourceName: mistake.sourceTestName ?? '', sourceImageIds: mistake.sourceImageIds }); setEntry(null);
    } : undefined,
    onDelete: () => { if (window.confirm('Xóa lỗi này khỏi sổ tay?')) onDeleteMistake(mistake.id); },
    onMarkMastered: () => markMastered(mistake.id),
    onReopen: () => onReopenCards([mistake.id]),
    // A card read from a screenshot asks again with its ticket (no new AI use); otherwise one AI use.
    onExplain: () => {
      if (canRetryFree(mistake.id)) { if (retryExplanation(mistake.id)) notify('Đang viết lời giải…'); return; }
      void explain(mistakes.find(value => value.id === mistake.id) ?? mistake);
    },
    explainLabel: canRetryFree(mistake.id) ? 'Viết lời giải' : 'Giải thích với AI',
    explaining: explainingId === mistake.id || isExplaining(mistake.id)
  });

  const pendingCards = useMemo(() => matchingMistakes.filter(needsSupplement).sort((a, b) =>
    (a.sourceTestName ?? '').localeCompare(b.sourceTestName ?? '', 'vi', { numeric: true }) || (a.questionNumber ?? 999) - (b.questionNumber ?? 999)
      || a.createdAt.localeCompare(b.createdAt)), [matchingMistakes]);
  const desktopPending = useMemo(() => pendingCards.filter(fromLoggedTest), [pendingCards]);
  /** Opens the detail flow for one test's pending cards (all pending cards when no test is given). */
  const startDetail = (test?: string) => {
    const ids = pendingCards.filter(card => test === undefined || (card.sourceTestName ?? '') === test).map(card => card.id);
    if (ids.length) setDetailIds(ids);
  };
  const detailCards = detailIds?.map(id => mistakes.find(mistake => mistake.id === id)).filter((card): card is MistakeEntry => Boolean(card)) ?? [];

  // One row per test instead of one per question: a test with 50 wrong answers stays one line.
  const renderPendingTests = (items: MistakeEntry[]) => {
    const tests = new Map<string, number>();
    for (const card of items) tests.set(card.sourceTestName ?? '', (tests.get(card.sourceTestName ?? '') ?? 0) + 1);
    return [...tests].map(([test, count]) => (
      <button key={test || 'none'} type="button" onClick={() => startDetail(test)} aria-label={`Ghi chi tiết ${count} câu, ${test || 'chưa ghi đề'}`}
        className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 bg-white px-4 text-left dark:bg-[#111A2C]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold text-slate-900 dark:text-slate-100">{test || 'Chưa ghi đề'}</span>
          <span className="block text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">{count} câu sai</span>
        </span>
        <span className="shrink-0 text-[13px] font-black text-blue-700 dark:text-blue-300">Ghi chi tiết ›</span>
      </button>
    ));
  };

  const renderPhoneGroups = () => {
    const groups = [
      { id: 'pending', label: 'Chưa ghi chi tiết', dot: 'bg-amber-500', items: pendingCards, showStatus: false },
      { id: 'due', label: 'Cần ôn', dot: 'bg-orange-600', items: matchingMistakes.filter(m => isDueForReview(m)), showStatus: false },
      { id: 'later', label: 'Chưa đến hạn', dot: 'bg-slate-400', items: matchingMistakes.filter(m => !isDueForReview(m) && !needsSupplement(m) && !(m.status === 'MASTERED' && canReview(m))), showStatus: true },
      { id: 'mastered', label: 'Đã thuộc', dot: 'bg-emerald-600', items: matchingMistakes.filter(m => m.status === 'MASTERED' && canReview(m)), showStatus: false }
    ].filter(group => group.items.length > 0);
    if (!groups.length) return (
      <div className="space-y-2 px-4 py-10 text-center text-sm">
        <p className="text-slate-600 dark:text-slate-400">Không có thẻ nào khớp tìm kiếm.</p>
        <button type="button" onClick={resetFilters} className="min-h-11 cursor-pointer font-semibold text-blue-600 dark:text-blue-400">Đặt lại bộ lọc</button>
      </div>
    );
    return <div className="notebook-list">{groups.map((group, index) => {
      const shown = openGroups[group.id] ?? 0;
      return (
        <section key={group.id} aria-label={`${group.label} · ${group.items.length}`}>
          <div className="flex min-h-11 items-center justify-between px-4 pb-1.5 pt-3">
            <h3 className="flex items-center gap-2 whitespace-nowrap text-[12.5px] font-black uppercase tracking-[0.05em] text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${group.dot}`} aria-hidden="true" />{group.label} · {group.items.length}
            </h3>
            {index === 0 && <button type="button" aria-label={phoneSearchOpen ? 'Ẩn tìm kiếm' : 'Tìm trong sổ tay'} aria-pressed={phoneSearchOpen}
              onClick={() => setPhoneSearchOpen(value => !value)}
              className={'flex h-10 w-10 items-center justify-center rounded-full cursor-pointer ' + (phoneSearchOpen || activeFilterCount ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400')}>
              <Search className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>}
          </div>
          {shown > 0 ? <>
            <div className="divide-y divide-stone-200 border-y border-stone-200 dark:divide-slate-800 dark:border-slate-800">
              {group.id === 'pending' ? renderPendingTests(group.items)
                : group.items.slice(0, shown).map(mistake => <MistakeCard key={mistake.id} {...cardProps(mistake)} compact showStatus={group.showStatus} />)}
            </div>
            {group.id !== 'pending' && group.items.length > shown && <button type="button" onClick={() => setOpenGroups(value => ({ ...value, [group.id]: shown + PHONE_GROUP_STEP }))}
              className="mx-4 mt-3 flex min-h-11 w-[calc(100%-2rem)] items-center justify-center rounded-xl border-[1.5px] border-stone-300 bg-white text-[14px] font-bold text-slate-700 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              Xem thêm {Math.min(PHONE_GROUP_STEP, group.items.length - shown)} câu
            </button>}
          </> : <button type="button" onClick={() => setOpenGroups(value => ({ ...value, [group.id]: PHONE_GROUP_STEP }))}
            className="flex min-h-[52px] w-full items-center justify-between border-y border-stone-200 bg-white px-4 text-left text-[14.5px] font-bold text-slate-800 cursor-pointer dark:border-slate-800 dark:bg-[#111A2C] dark:text-slate-100">
            Xem {group.items.length} câu {group.label.toLowerCase()}<ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </button>}
        </section>
      );
    })}</div>;
  };

  return (
    <div className={'notebook-view animate-fade-in pb-10 ' + (isPhone && reviewCount > 0 ? 'pb-24' : '')}>
      <section aria-labelledby="notebook-heading" className="rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-[#121A2B] dark:shadow-[3px_3px_0px_#cbd5e1] max-md:-mx-4 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none max-md:dark:bg-transparent">
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3 pt-4 sm:px-5 max-md:p-0">
        <h2 id="notebook-heading" className="max-md:sr-only flex items-center gap-2 text-base font-black text-slate-900 sm:text-lg dark:text-white"><BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />Sổ tay bắt bẫy</h2>
        {/* Phones: the review button lives in a bar above the bottom navigation, within thumb reach. */}
        <div className={'grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex max-md:grid-cols-1 ' + (isPhone && reviewCount > 0 ? 'fixed inset-x-0 bottom-[calc(4rem+2px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7] to-transparent px-4 pb-3 pt-6 dark:from-[#070C16] dark:via-[#070C16]' : isPhone ? 'hidden' : '')}>
          <button
            type="button"
            onClick={() => onStartReview(activeFilterCount ? matchingMistakes.filter(m => isDueForReview(m)).map(m => m.id) : undefined)}
            disabled={reviewCount === 0}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-extrabold transition-all max-md:min-h-[54px] max-md:rounded-2xl max-md:text-base ${
              reviewCount > 0
                ? 'cursor-pointer border-2 border-slate-900 bg-emerald-400 text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] hover:bg-emerald-300 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                : 'cursor-not-allowed border-2 border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
            {reviewCount > 0
              ? <span>{isPhone ? `Ôn ${reviewCount} câu đến hạn` : `Ôn ${reviewCount} thẻ`}</span>
              : <span>Chưa có thẻ<span className="hidden sm:inline"> đến hạn</span></span>}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="max-md:hidden flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-yellow-300 px-4 py-2 text-sm font-extrabold text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] transition-all hover:bg-yellow-200 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
            <span>Ghi Chú Bẫy</span>
          </button>
        </div>
      </header>
      {mistakes.length > 0 && (!isPhone || phoneSearchOpen) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 pb-4 sm:px-5 dark:border-slate-700 max-md:border-0 max-md:px-4 max-md:pb-2">
          <div className="max-md:hidden inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold sm:text-sm dark:border-slate-700 dark:bg-[#121A2B]" role="group" aria-label="Lọc theo trạng thái">
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
          <p className="text-sm text-slate-500 dark:text-slate-400">{isPhone ? 'Bấm nút ＋ ở dưới, chọn “Câu sai”, dán câu bạn làm sai và AI sẽ soạn ghi chú.' : 'Bấm “Ghi Chú Bẫy”, dán câu bạn làm sai và AI sẽ soạn ghi chú.'}</p>
        </div>
      ) : isPhone ? renderPhoneGroups() : (
        <div className="notebook-list divide-y divide-slate-200 dark:divide-slate-800">
          {selectedStatus === 'ALL' && desktopPending.length > 0 && (
            <section aria-label={`Chưa ghi chi tiết · ${desktopPending.length}`} className="[&>button]:px-5">
              <h3 className="flex items-center gap-2 px-5 pb-1 pt-3 text-[12px] font-black uppercase tracking-[0.05em] text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />Chưa ghi chi tiết
              </h3>
              {renderPendingTests(desktopPending)}
            </section>
          )}
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
          {filteredMistakes.length === 0 && !(selectedStatus === 'ALL' && desktopPending.length > 0) && (
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

      <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />
      {detailCards.length > 0 && (() => {
        // Phones go through the questions one at a time; computers get the whole test as one list.
        const Flow = isPhone ? MistakeDetailFlow : DesktopDetailFlow;
        return <Flow cards={detailCards} onSave={onUpdateMistake}
          onOpenFull={card => { setDetailIds(null); openEdit(card); }}
          onClose={saved => { setDetailIds(null); if (saved) notify(`Đã ghi chi tiết ${saved} câu`); }} />;
      })()}
      {entry !== undefined && <MistakeEntryModal key={`${entry?.id ?? 'new'}:${editorVersion}`} original={entry}
        sourceSuggestions={sourceSuggestions} initialSourceName={entry ? mistakeTestName(entry, sessionNames) : reusedReading?.sourceName ?? sessionSource?.sourceName ?? defaultSourceName}
        initialSessionId={sessionSource?.sessionId}
        initialReading={reusedReading?.text}
        initialSourceImageIds={reusedReading?.sourceImageIds}
        onAdd={onAddMistake} onUpdate={onUpdateMistake} onClose={closeEntry} onSaved={savedFeedback}
        onReload={() => { setEntry(loadMistakes().find(value => value.id === entry?.id)); setEditorVersion(value => value + 1); }} />}
    </div>
  );
}
