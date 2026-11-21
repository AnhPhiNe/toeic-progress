import { useState, useMemo, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { Brain, ChevronDown, ImagePlus, Plus, Search, SlidersHorizontal, BookOpen, X, AlertCircle, Inbox, Tag } from 'lucide-react';
import type { MistakeEntry, ErrorCategory, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { MistakeCard } from '@/features/mistakes/components/MistakeCard';
import { WrongDetailFlow } from '@/features/mistakes/components/wrong-detail/WrongDetailFlow';
import { DraftWaitRow } from '@/features/mistakes/components/wrong-detail/DraftWaitRow';
import { isBlankDraft, isRetiredDraft, needsSupplement } from '@/features/mistakes/lib/mistakeDrafts';
import { groupDetailAttempts } from '@/features/mistakes/lib/detailGroups';
import { waitingTests } from '@/features/mistakes/lib/wrongDetail';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { inputText, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { getUserChoice, optionLetter } from '@/features/mistakes/lib/userChoice';
import { matchesExplanationCard, mergeExplanation } from '@/features/mistakes/lib/explanationMerge';
import { canRetryFree, explanationsVersion, isExplaining, retryExplanation, subscribeExplanations } from '@/features/mistakes/services/explanationQueue';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { MistakeEntryModal } from '@/features/mistakes/components/MistakeEntryModal';
import { CaptureModal } from '@/features/mistakes/components/CaptureModal';
import { ManualQuestionModal } from '@/features/mistakes/components/ManualQuestionModal';
import { NotebookEmpty } from '@/features/mistakes/components/NotebookEmpty';
import { addFiles, captureState, closeCapture, openCapture, openReview, dismissBackgroundNotice, subscribeCapture } from '@/features/mistakes/services/captureSession';
import { isDueForReview, canReview } from '@/features/mistakes/lib/spacedRepetition';
import { loadMistakes } from '@/shared/data/storage';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { mistakeTestName, testNameKey, uniqueTestNames } from '@/features/mistakes/lib/sourceTests';
import { collectTestNames } from '@/shared/domain/testNames';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import { triggerHaptic } from '@/shared/lib/haptics';
import type { MistakeUndoAction } from '@/features/mistakes/lib/mistakeUndo';
import { PageTip } from '@/features/guide/PageTip';
import './notebook.css';
import './notebook-rd.css';
import './capture-rd.css';
import { MistakeDetail, categoryShort, reviewLabel } from './MistakeDetail';
import { Soc } from '@/shared/ui/soc/Soc';

const NOTEBOOK_PAGE_SIZE = 8;
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
  /** Opens the notebook already filtered to one Part (from a treasure chest in Hành trình điểm). */
  initialPart?: number;
  /** Opens the note form for a test, or with `detailSessionId` the detail flow for that test's draft cards. */
  createRequest?: { sourceName?: string; sessionId?: string; detailSessionId?: string };
  dueCount: number;
  onStartReview: (ids?: string[]) => void;
  onAddMistake: (entry: MistakeEntry) => void;
  onAddMistakes?: (entries: MistakeEntry[]) => void;
  onMarkMastered: (id: string) => void;
  onReopenCards: (ids: string[]) => void;
  onDeleteMistake: (id: string) => MistakeUndoAction | void;
  onUpdateMistake: (entry: MistakeEntry, original: MistakeEntry) => void;
  /** Empty notebook: log a Full Test, whose Reading wrong questions become cards */
  onOpenSessionLogger?: () => void;
}

/** A wrong question created by logging a test, as opposed to a card the learner wrote in the notebook. */
const fromLoggedTest = (mistake: MistakeEntry) => Boolean(mistake.sessionId) && mistake.questionNumber !== undefined;

export function MistakeNotebookView({ mistakes, sessions = [], initialSourceNames, initialPart, createRequest, dueCount, onStartReview, onAddMistake, onAddMistakes,
  onMarkMastered, onReopenCards, onDeleteMistake, onUpdateMistake, onOpenSessionLogger }: MistakeNotebookViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState<number | 'ALL'>(initialPart ?? 'ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'DUE' | 'MASTERED'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | 'ALL'>('ALL');
  const [selectedTest, setSelectedTest] = useState(() => initialSourceNames === undefined ? 'ALL'
    : initialSourceNames.length === 1 ? initialSourceNames[0] ? `test:${testNameKey(initialSourceNames[0])}` : 'NONE' : 'SCOPE');
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  // Phones: the list is grouped by status instead of the Tất cả / Cần ôn / Đã thuộc filter.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, number>>({ pending: PHONE_GROUP_STEP, due: PHONE_GROUP_STEP });
  const filterRef = useRef<HTMLDivElement>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [entry, setEntry] = useState<MistakeEntry | null | undefined>(createRequest && !createRequest.detailSessionId ? null : undefined);
  // The test whose wrong questions are being worked through (Gỡ câu sai); its cards are read live from `mistakes`.
  const [detailSessionId, setDetailSessionId] = useState<string | null>(createRequest?.detailSessionId ?? null);
  const [sessionSource, setSessionSource] = useState(createRequest);
  const [reusedReading, setReusedReading] = useState<{ text: string; sourceName: string; sourceImageIds?: string[]; cardId: string } | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  // Computers (2026-11 redesign): a list of rows; a row opens one detail card.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [nbTab, setNbTab] = useState<'mistakes' | 'words'>('mistakes');
  // Word cards do not exist yet: their tab stays hidden until there are some.
  const wordCards = 0;
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInitialRaw, setManualInitialRaw] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const capture = useSyncExternalStore(subscribeCapture, captureState);
  const [feedback, setFeedback] = useState<{ id: number; message: string; error: boolean; undo?: MistakeUndoAction; owner?: string | null } | null>(null);
  const feedbackSequence = useRef(0);
  const notify = useCallback((message: string, error = false) => { setFeedback({ id: ++feedbackSequence.current, message, error }); }, []);
  const savedFeedback = useCallback((message: string) => notify(message), [notify]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), feedback.undo ? 15000 : feedback.error ? 7000 : 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  const deleteCard = (id: string) => {
    if (!window.confirm('Xóa lỗi này khỏi sổ tay?')) return;
    try {
      const owner = getActiveAccountId();
      const undo = onDeleteMistake(id);
      setFeedback({ id: ++feedbackSequence.current, message: 'Đã xóa thẻ', error: false, ...(undo ? { undo, owner } : {}) });
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa xóa được thẻ.', true); }
  };
  const undoDelete = () => {
    if (!feedback?.undo) return;
    try {
      if (feedback.owner !== getActiveAccountId()) throw new Error('Tài khoản đã thay đổi. Không thể hoàn tác thẻ của tài khoản trước.');
      feedback.undo();
      notify('Đã khôi phục thẻ');
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa khôi phục được thẻ.', true); }
  };
  const markMastered = (id: string) => {
    try {
      onMarkMastered(id);
      const saved = loadMistakes().find(mistake => mistake.id === id);
      if (saved?.status === 'MASTERED' && canReview(saved)) notify('Đã chuyển sang Đã thuộc');
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa lưu được trạng thái thẻ.', true); }
  };
  const closeEntry = useCallback(() => { setEntry(undefined); setManualOpen(false); setManualInitialRaw(''); setReusedReading(null); setSessionSource(undefined); }, []);
  /** Computers: a new card starts from a screenshot (`entry === null` opens the capture dialog); phones keep the old form. */
  const openCreate = useCallback(() => { setReusedReading(null); setSessionSource(undefined); setManualOpen(false); setManualInitialRaw(''); setEntry(null); }, []);
  const openManual = useCallback((initialRaw?: string) => {
    closeCapture();
    setEntry(undefined);
    setManualInitialRaw(typeof initialRaw === 'string' ? initialRaw : '');
    setManualOpen(true);
  }, []);
  const openEdit = (value: MistakeEntry) => { setReusedReading(null); setSessionSource(undefined); setEntry(value); };

  // Zero-click desktop paste: Ctrl+V an image anywhere on Sổ tay immediately opens CaptureModal with the image staged.
  useEffect(() => {
    if (isPhone || detailId || entry !== undefined || manualOpen || detailSessionId) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (!files.length) return;
      event.preventDefault();
      addFiles(files, 'questions');
      openCreate();
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [isPhone, detailId, entry, manualOpen, detailSessionId, openCreate]);
  const sessionNames = useMemo(() => new Map(sessions.filter(s => !s.deletedAt).map(s => [s.id, s.testName])), [sessions]);
  const sourcedMistakes = useMemo(() => mistakes.filter(m => !isRetiredDraft(m)).map(m => ({ ...m, sourceTestName: mistakeTestName(m, sessionNames) })), [mistakes, sessionNames]);
  const sourceNames = useMemo(() => uniqueTestNames(sourcedMistakes.map(m => m.sourceTestName)), [sourcedMistakes]);
  const scopeKeys = useMemo(() => new Set((initialSourceNames ?? []).map(testNameKey)), [initialSourceNames]);
  const filterSourceNames = useMemo(() => uniqueTestNames([...sourceNames, ...(initialSourceNames ?? [])]), [sourceNames, initialSourceNames]);
  const sourceSuggestions = useMemo(() => collectTestNames(sessions, mistakes), [sessions, mistakes]);
  const matchingMistakes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sourcedMistakes.filter(m => (!term || [m.questionContext, m.userMistake, m.userReason, m.correctAnswer, m.trapTip, m.sourceTestName, ...(m.tags ?? [])]
      .some(value => typeof value === 'string' && value.toLowerCase().includes(term))) && (selectedPart === 'ALL' || m.part === selectedPart)
      && (selectedTest === 'ALL' || (selectedTest === 'SCOPE' ? scopeKeys.has(testNameKey(m.sourceTestName))
        : selectedTest === 'NONE' ? !m.sourceTestName : `test:${testNameKey(m.sourceTestName)}` === selectedTest))
      && (selectedCategory === 'ALL' || m.category === selectedCategory));
  }, [sourcedMistakes, searchTerm, selectedPart, selectedTest, selectedCategory, scopeKeys]);
  // Number-only drafts of a logged test are not cards yet: they wait in one row above the list (Gỡ câu sai), so the list
  // and its tab counts leave them out. A draft with any content is listed like any card.
  const listedMistakes = useMemo(() => matchingMistakes.filter(m => isPhone || !isBlankDraft(m)), [matchingMistakes, isPhone]);
  const waiting = useMemo(() => {
    const attempts = new Map(groupDetailAttempts(matchingMistakes.filter(isBlankDraft), sessions).map(group => [group.sessionId, group]));
    return waitingTests(matchingMistakes, id => ({ title: attempts.get(id)?.title ?? 'Chưa ghi đề', attempt: attempts.get(id)?.attempt ?? '' }));
  }, [matchingMistakes, sessions]);
  const stats = useMemo(() => ({ total: listedMistakes.length, due: listedMistakes.filter(m => isDueForReview(m)).length,
    mastered: listedMistakes.filter(m => m.status === 'MASTERED' && canReview(m)).length }), [listedMistakes]);
  const filteredMistakes = useMemo(() => listedMistakes.filter(m => selectedStatus === 'ALL' ||
    (selectedStatus === 'DUE' ? isDueForReview(m) : m.status === 'MASTERED' && canReview(m))), [listedMistakes, selectedStatus]);
  const pageCount = Math.max(1, Math.ceil(filteredMistakes.length / NOTEBOOK_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleMistakes = filteredMistakes.slice((currentPage - 1) * NOTEBOOK_PAGE_SIZE, currentPage * NOTEBOOK_PAGE_SIZE);
  useEffect(() => { setPage(current => Math.min(current, pageCount)); }, [pageCount]);
  const activeFilterCount = Number(selectedTest !== 'ALL') + Number(selectedPart !== 'ALL') + Number(selectedCategory !== 'ALL') + Number(Boolean(searchTerm.trim()));
  const reviewCount = activeFilterCount ? stats.due : dueCount;
  const defaultSourceName = filterSourceNames.find(name => `test:${testNameKey(name)}` === selectedTest) ?? (initialSourceNames?.[0] ?? '');
  const sourceHasNotes = Boolean(defaultSourceName) && sourcedMistakes.some(note => testNameKey(note.sourceTestName) === testNameKey(defaultSourceName));
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
  const explanationMounted = useRef(true);
  useEffect(() => {
    explanationMounted.current = true;
    return () => { explanationMounted.current = false; };
  }, []);
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const explain = async (card: MistakeEntry) => {
    if (explainingId) return;
    const owner = getActiveAccountId();
    const isCurrent = () => explanationMounted.current && getActiveAccountId() === owner;
    const sourceImageIds = [...(card.sourceImageIds ?? [])];
    const chosen = getUserChoice(card);
    const sourceAnswer = card.answerSource === 'PROVIDED' ? optionLetter(card.correctAnswer) : '';
    const input: MistakeInput = { question: card.question ?? card.questionContext, options: [...(card.options ?? [])], context: card.context ?? '', part: card.part,
      userChoiceState: card.userChoiceState ?? (chosen ? 'CHOSEN' : 'UNKNOWN'), userChoice: chosen,
      userReason: card.userReason ?? '', sourceAnswer, ...(card.category !== 'OTHER' ? { errorCategory: card.category } : {}) };
    setExplainingId(card.id);
    try {
      const { draft } = await aiService.extractMistakeWithAI(inputText(input), getToken, input, [], sourceImageIds, owner, isCurrent);
      if (!isCurrent()) return;
      const latest = loadMistakes().find(value => value.id === card.id);
      if (!latest || !matchesExplanationCard(latest, input)
        || JSON.stringify(latest.sourceImageIds ?? []) !== JSON.stringify(sourceImageIds)) {
        throw new Error('Nội dung thẻ đã thay đổi hoặc bị xóa. Chưa áp dụng lời giải; hãy mở lại thẻ để kiểm tra.');
      }
      if (latest.explanation || latest.trapTip?.trim()) throw new Error('Thẻ đã có lời giải mới. Giữ nguyên lời giải đang lưu.');
      onUpdateMistake(mergeExplanation(latest, draft), latest);
      notify('Đã thêm giải thích');
    } catch (reason) { if (isCurrent()) notify(reason instanceof Error ? reason.message : 'Chưa giải thích được. Hãy thử lại.', true); }
    finally { if (isCurrent()) { setExplainingId(''); removeCaptcha(); } }
  };

  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  const cardProps = (mistake: (typeof sourcedMistakes)[number]) => ({
    mistake,
    expanded: expandedIds.has(mistake.id),
    onToggle: () => toggleRow(mistake.id),
    onReview: () => onStartReview([mistake.id]),
    onEdit: () => openEdit(mistakes.find(value => value.id === mistake.id) ?? mistake),
    onReuseReading: mistake.part === 7 && typeof mistake.question === 'string' && (mistake.context?.trim() || mistake.sourceImageIds?.length) ? () => {
      setReusedReading({ text: mistake.context ?? '', sourceName: mistake.sourceTestName ?? '', sourceImageIds: mistake.sourceImageIds, cardId: mistake.id }); setEntry(null);
    } : undefined,
    onDelete: () => deleteCard(mistake.id),
    onMarkMastered: () => markMastered(mistake.id),
    onReopen: () => onReopenCards([mistake.id]),
    // A card read from a screenshot asks again with its ticket (no new AI use); otherwise one AI use.
    onExplain: () => {
      if (canRetryFree(mistake.id)) { if (retryExplanation(mistake.id)) notify('Đang viết lời giải…'); return; }
      void explain(mistakes.find(value => value.id === mistake.id) ?? mistake);
    },
    explainLabel: canRetryFree(mistake.id) ? 'Viết lời giải' : 'Giải thích với AI',
    explaining: explainingId === mistake.id || isExplaining(mistake.id),
    onResolveDoubt: (switchToAI: boolean) => {
      const latest = mistakes.find(value => value.id === mistake.id) ?? mistake;
      const option = latest.options?.find(value => optionLetter(value) === latest.answerDoubt);
      // Switching makes the learner the one who set the answer; keeping it just closes the question.
      onUpdateMistake({ ...latest, answerDoubt: undefined, ...(switchToAI && option ? { correctAnswer: option, answerSource: 'PROVIDED', answerProvidedBy: 'LEARNER' } : {}) }, latest);
      notify(switchToAI ? `Đã đổi đáp án sang ${latest.answerDoubt}` : 'Đã giữ đáp án trang đề');
    }
  });

  const pendingCards = useMemo(() => matchingMistakes.filter(needsSupplement).sort((a, b) =>
    (a.sourceTestName ?? '').localeCompare(b.sourceTestName ?? '', 'vi', { numeric: true }) || (a.questionNumber ?? 999) - (b.questionNumber ?? 999)
      || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')), [matchingMistakes]);
  const desktopPending = useMemo(() => pendingCards.filter(fromLoggedTest), [pendingCards]);
  /** One attempt owns one question-number namespace. Manual notes use their full editor. */
  const startDetail = (cards: MistakeEntry[]) => { if (cards[0]?.sessionId) setDetailSessionId(cards[0].sessionId); };
  const detailSession = detailSessionId ? sessions.find(session => session.id === detailSessionId && !session.deletedAt) : undefined;

  // One row per attempt: retakes of the same test must never share their numbered questions.
  const renderPendingTests = (items: MistakeEntry[]) => {
    const groups = groupDetailAttempts(items, sessions);
    return groups.map(group => {
      const count = group.cards.length, reading = group.cards.every(card => card.part >= 5);
      const repeated = groups.some(other => other.id !== group.id && testNameKey(other.title) === testNameKey(group.title));
      if (isPhone) {
        return (
          <button key={group.id} type="button" onClick={() => group.sessionId ? startDetail(group.cards) : openEdit(group.cards[0])}
            aria-label={`Ghi chi tiết ${count} câu, ${group.title === 'Chưa ghi đề' ? 'chưa ghi đề' : group.title}${repeated ? `, ${group.attempt}` : ''}`}
            className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 bg-white px-4 text-left dark:bg-[#111A2C]">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-slate-900 dark:text-slate-100">{group.title}</span>
              <span className="block text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">{group.attempt}</span>
              <span className="block text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">{count} câu {reading ? 'Reading ' : ''}sai</span>
            </span>
            <span className="shrink-0 text-[13px] font-black text-blue-700 dark:text-blue-300">Ghi chi tiết ›</span>
          </button>
        );
      }
      return (
        <button key={group.id} type="button" onClick={() => group.sessionId ? startDetail(group.cards) : openEdit(group.cards[0])}
          aria-label={`Ghi chi tiết ${count} câu, ${group.title === 'Chưa ghi đề' ? 'chưa ghi đề' : group.title}${repeated ? `, ${group.attempt}` : ''}`}
          className="flex min-h-[46px] w-full cursor-pointer items-center justify-between gap-3 px-5 py-2 text-left transition-colors hover:bg-amber-100/50 dark:hover:bg-amber-950/40">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />Chưa ghi chi tiết
            </span>
            <span className="truncate text-[13.5px] font-extrabold text-slate-900 dark:text-slate-100">{group.title}</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">· {group.attempt}</span>
            <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300">{count} câu {reading ? 'Reading ' : ''}sai</span>
          </span>
          <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-1 text-xs font-extrabold text-white shadow-sm">Ghi chi tiết ›</span>
        </button>
      );
    });
  };

  const renderPhoneGroups = () => {
    const groups = [
      { id: 'pending', label: 'Chưa ghi chi tiết', dot: 'bg-amber-500', items: pendingCards, showStatus: false },
      { id: 'due', label: 'Cần ôn', dot: 'bg-orange-600', items: matchingMistakes.filter(m => isDueForReview(m)), showStatus: false },
      { id: 'later', label: 'Chưa đến hạn', dot: 'bg-slate-400', items: matchingMistakes.filter(m => !isDueForReview(m) && !needsSupplement(m) && !(m.status === 'MASTERED' && canReview(m))), showStatus: true },
      { id: 'mastered', label: 'Đã thuộc', dot: 'bg-emerald-600', items: matchingMistakes.filter(m => m.status === 'MASTERED' && canReview(m)), showStatus: false }
    ].filter(group => group.items.length > 0);
    if (!groups.length) {
      const activeTestName = defaultSourceName || (selectedTest !== 'ALL' && selectedTest !== 'NONE' && selectedTest !== 'SCOPE' ? selectedTest.replace('test:', '') : '');
      return (
        <div className="mx-4 my-2.5 rounded-2xl border-2 border-slate-900 bg-white p-6 text-center space-y-3 shadow-[2.5px_2.5px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[2.5px_2.5px_0_0_#cbd5e1]">
          <div className="space-y-1">
            <Inbox className="h-8 w-8 mx-auto text-slate-400 mb-2 stroke-[1.5]" aria-hidden="true" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {activeTestName && !sourceHasNotes
                ? `Chưa có câu sai nào thuộc đề "${activeTestName}"`
                : 'Không có thẻ nào khớp bộ lọc hiện tại'}
            </h3>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              {mistakes.length > 0 && sourceHasNotes ? 'Thử thay đổi hoặc bỏ bộ lọc để xem các câu đã lưu.' : mistakes.length > 0 ? (
                <>Toàn bộ sổ tay của bạn đang có <strong className="font-bold text-slate-800 dark:text-slate-200">{mistakes.length} câu sai</strong> từ các đề khác.</>
              ) : (
                <>Bạn chưa lưu câu sai nào vào Sổ tay.</>
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2 max-w-xs mx-auto">
            {activeTestName && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(6);
                  openCreate();
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border-2 border-slate-900 bg-blue-600 text-white font-black text-xs shadow-[2px_2px_0_0_#0f172a] hover:bg-blue-500 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all dark:border-slate-300 cursor-pointer"
              >
                + Thêm câu sai cho đề này
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic(6);
                resetFilters();
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-700 font-bold text-xs hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 transition-colors cursor-pointer"
            >
              {mistakes.length > 0 ? `Xem tất cả ${mistakes.length} câu` : 'Đặt lại bộ lọc'}
            </button>
          </div>
        </div>
      );
    }
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

  const overlays = (<>
      <div role="status" aria-live="polite" className="notebook-feedback-region">
        {feedback && <div key={feedback.id} className={`notebook-feedback ${feedback.error ? 'is-error' : ''}`}>
          {feedback.error ? <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" /> : <SuccessMark />}
          <p className="min-w-0 flex-1 text-sm font-semibold">{feedback.message}</p>
          {feedback.undo && feedback.owner === getActiveAccountId() && <button type="button" onClick={undoDelete}
            className="min-h-11 shrink-0 cursor-pointer rounded-lg px-3 text-sm font-extrabold text-blue-700 underline dark:text-blue-300">Hoàn tác</button>}
          <button type="button" aria-label="Đóng thông báo" onClick={() => setFeedback(null)} className="flex min-h-9 min-w-9 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>}
      </div>

      <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />
      {detailSession && <WrongDetailFlow session={detailSession} mistakes={mistakes} phone={isPhone} onSave={onUpdateMistake} onAdd={onAddMistake}
        onReview={ids => onStartReview(ids)}
        onClose={saved => { setDetailSessionId(null); if (saved) notify(`Đã ghi chi tiết ${saved} câu`); }} />}
      {!isPhone && entry === null && <CaptureModal sessions={sessions} mistakes={mistakes} sourceSuggestions={sourceSuggestions}
        initialTestName={reusedReading?.sourceName ?? sessionSource?.sourceName ?? defaultSourceName} getToken={getToken}
        onClose={closeEntry} onManual={openManual} onAddBatch={onAddMistakes} onUpdate={onUpdateMistake} onSaved={savedFeedback} />}
      {!isPhone && manualOpen && <ManualQuestionModal sessions={sessions} mistakes={mistakes} sourceSuggestions={sourceSuggestions}
        initialTestName={sessionSource?.sourceName ?? defaultSourceName} initialRaw={manualInitialRaw} onClose={closeEntry} onAdd={onAddMistake} onAddBatch={onAddMistakes}
        onUpdate={onUpdateMistake} onExplain={card => void explain(card)} onSaved={savedFeedback} />}
      {entry !== undefined && (isPhone || entry !== null) && <MistakeEntryModal key={`${entry?.id ?? 'new'}:${editorVersion}`} original={entry}
        sourceSuggestions={sourceSuggestions} initialSourceName={entry ? mistakeTestName(entry, sessionNames) : reusedReading?.sourceName ?? sessionSource?.sourceName ?? defaultSourceName}
        initialSessionId={sessionSource?.sessionId}
        initialReading={reusedReading?.text}
        draftScope={reusedReading ? `reuse:${reusedReading.cardId}` : undefined}
        initialSourceImageIds={reusedReading?.sourceImageIds}
        onAdd={onAddMistake} onAddBatch={onAddMistakes} onUpdate={onUpdateMistake} onClose={closeEntry} onSaved={savedFeedback}
        onReload={() => { setEntry(loadMistakes().find(value => value.id === entry?.id)); setEditorVersion(value => value + 1); }} />}
      {!isPhone && entry !== null && !manualOpen && (capture.phase === 'reading' || capture.activeJobs > 0 || capture.finishedInBackground) && (() => {
        const busy = capture.phase === 'reading' || capture.activeJobs > 0;
        const openCaptureFromToast = () => {
          openCapture();
          if (!busy && capture.phase === 'input' && (capture.items.length || capture.failures.length)) openReview();
          setManualOpen(false);
          setEntry(null);
        };
        return (
          <div className="cap-toast" role="status" aria-live="polite">
            <Soc state={busy ? 'think' : 'hi'} size={46} />
            {busy
              ? <p>{capture.activeJobs > 0 ? `Sóc đang đọc nền ${capture.activeJobs} mẻ (${capture.queuedImagesCount} ảnh)…` : `Sóc đang đọc ${capture.images.length} ảnh…`}<small>Đã thấy {capture.items.length} câu sai</small></p>
              : <p>Sóc đọc xong rồi!<small>{capture.items.length ? `Tìm thấy ${capture.items.length} câu sai để soát` : capture.failures.length ? 'Có ảnh chưa đọc được, mở lại để thử lần nữa' : 'Chưa thấy câu sai nào trong ảnh'}</small></p>}
            <button type="button" className="rd-btn rd-btn--pink cap-sm" onClick={openCaptureFromToast}>{busy ? 'Xem' : 'Soát ngay'}</button>
            {!busy && <button type="button" className="cap-x" aria-label="Đóng thông báo" onClick={dismissBackgroundNotice}>×</button>}
          </div>
        );
      })()}
  </>);

  if (!isPhone) {
    const opened = detailId ? sourcedMistakes.find(m => m.id === detailId) : undefined;
    if (opened) {
      const p = cardProps(opened);
      return (
        <div className="rd nb-page">
          <MistakeDetail mistake={opened} testName={opened.sourceTestName ?? undefined} onBack={() => setDetailId(null)}
            actions={{ ...p, onDelete: () => { p.onDelete(); if (!loadMistakes().some(x => x.id === opened.id && !x.deletedAt)) setDetailId(null); } }} />
          {overlays}
        </div>
      );
    }
    const dueList = matchingMistakes.filter(m => isDueForReview(m) && !(needsSupplement(m) && fromLoggedTest(m)));
    const dueParts = [...new Set(dueList.map(m => m.part))].sort();
    const dueTests = uniqueTestNames(dueList.map(m => m.sourceTestName));
    const empty = mistakes.length === 0;
    const pickedFilters = Number(selectedTest !== 'ALL') + Number(selectedPart !== 'ALL') + Number(selectedCategory !== 'ALL');
    const partsPresent = [...new Set(sourcedMistakes.map(m => m.part))].sort();
    const statusTabs: Array<['ALL' | 'DUE' | 'MASTERED', string, number]> = [['ALL', 'Tất cả', stats.total], ['DUE', 'Cần ôn', stats.due], ['MASTERED', 'Đã thuộc', stats.mastered]];
    const hasFileDrag = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const canDropToCapture = entry === undefined && !manualOpen && !detailSessionId;
    return (
      <div
        className="rd nb-page"
        onDragEnter={event => {
          if (!canDropToCapture || !hasFileDrag(event)) return;
          dragDepth.current += 1;
          setDragOver(true);
        }}
        onDragOver={event => {
          if (!canDropToCapture || !hasFileDrag(event)) return;
          event.preventDefault();
        }}
        onDragLeave={event => {
          if (!canDropToCapture || !hasFileDrag(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        }}
        onDrop={event => {
          dragDepth.current = 0;
          setDragOver(false);
          if (!canDropToCapture) return;
          const files = [...(event.dataTransfer?.files ?? [])].filter(file => file.type.startsWith('image/'));
          if (!files.length) return;
          event.preventDefault();
          addFiles(files, 'questions');
          openCreate();
        }}
      >
        {dragOver && (
          <div className="nb-drop-mask" aria-hidden="true">
            <div className="nb-drop-card">
              <ImagePlus className="h-11 w-11 text-[#d64570]" />
              <b>Thả ảnh vào đây để Sóc đọc ngay</b>
              <span>Tự động nhận Part (1–7) và gom câu sai vào Sổ tay.</span>
            </div>
          </div>
        )}
        <div className="nb-top">
          <div><h1>Sổ tay</h1>{!empty && <p>Câu sai Sóc gom từ các trang chữa bài bạn chụp.</p>}</div>
          <div className="nb-topr">
            {wordCards > 0 && (
              <div className="nb-tabs" role="tablist" aria-label="Sổ tay">
                <button type="button" role="tab" aria-selected={nbTab === 'mistakes'} onClick={() => setNbTab('mistakes')}>Câu sai<em>{sourcedMistakes.length}</em></button>
                <button type="button" role="tab" aria-selected={nbTab === 'words'} onClick={() => setNbTab('words')}>Thẻ từ<em>{wordCards}</em></button>
              </div>
            )}
            <PageTip id="notebook" ready={!empty} />
            {!empty && <button type="button" className="rd-btn rd-btn--pink nb-cam" data-guide="notebook" onClick={openCreate}><span aria-hidden="true">📸</span> Chụp trang chữa bài</button>}
          </div>
        </div>

        {nbTab === 'words' ? (
          <section className="nb-hero is-empty">
            <Soc state="think" size={200} className="nb-hsoc" />
            <div><h2>Thẻ từ sắp có</h2><p>Mỗi thẻ sẽ là một từ làm bạn sai câu, kèm đúng câu gốc trong đề. Sóc đang học cách tách từ mới từ trang chữa bài.</p></div>
          </section>
        ) : empty ? (
          <NotebookEmpty onCapture={openCreate} onManual={() => openManual()} />
        ) : (
          <>
            <section className="nb-hero">
              <div>
                {reviewCount > 0 ? <>
                  <h2>{reviewCount} câu đến hạn ôn hôm nay</h2>
                  <p>{dueParts.length ? `Toàn câu ${dueParts.map(p => `Part ${p}`).join(' và ')}` : 'Các câu'}{dueTests.length === 1 ? ` từ đề ${dueTests[0]}` : ''}. Ôn xong là tính vào chuỗi ngày.</p>
                  <button type="button" className="rd-btn" onClick={() => onStartReview(activeFilterCount ? dueList.map(m => m.id) : undefined)}>Ôn {reviewCount} câu, khoảng {Math.max(1, Math.round(reviewCount * 0.8))} phút</button>
                </> : <>
                  <h2>Hôm nay không có câu nào đến hạn</h2>
                  <p>Sóc sẽ nhắc khi tới lúc ôn lại. Có trang chữa bài mới thì chụp vào đây nhé.</p>
                  <button type="button" className="rd-btn" onClick={openCreate}>Chụp trang chữa bài</button>
                </>}
              </div>
              <Soc state={reviewCount > 0 ? 'idle' : 'cheerC'} size={170} className="nb-hsoc" />
            </section>

            {waiting.length > 0 && (
              <div className="nb-pending">
                <DraftWaitRow tests={waiting} onOpen={setDetailSessionId} />
              </div>
            )}

            <div className="nb-tools">
              <div className="nb-seg" role="group" aria-label="Trạng thái">
                {statusTabs.map(([id, label, count]) => (
                  <button key={id} type="button" aria-pressed={selectedStatus === id} className={id === 'DUE' ? 'is-due' : undefined} onClick={() => { setSelectedStatus(id); setPage(1); }}>{label}<em>{count}</em></button>
                ))}
              </div>
              <span className="nb-sp" />
              <label className="nb-search">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M11 11 L14.5 14.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
                <input type="search" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} placeholder="Tìm câu hỏi, mẹo…" aria-label="Tìm trong Sổ tay" />
              </label>
              <div className="nb-fwrap" ref={filterRef}>
                <button type="button" className={'nb-fbtn' + (pickedFilters ? ' is-on' : '')} aria-expanded={filterOpen} onClick={() => setFilterOpen(o => !o)}>
                  <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true"><path d="M1 2 H15 M4 7 H12 M6.5 12 H9.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                  Lọc{pickedFilters > 0 && <b>{pickedFilters}</b>}
                </button>
                {filterOpen && (
                  <div className="nb-pop" role="dialog" aria-label="Bộ lọc">
                    <h5>ĐỀ</h5>
                    <div className="nb-cs">
                      <button type="button" aria-pressed={selectedTest === 'ALL'} onClick={() => { setSelectedTest('ALL'); setPage(1); }}>Tất cả</button>
                      {initialSourceNames && initialSourceNames.length > 1 && <button type="button" aria-pressed={selectedTest === 'SCOPE'} onClick={() => { setSelectedTest('SCOPE'); setPage(1); }}>Các đề đang xem</button>}
                      {filterSourceNames.map(name => { const v = `test:${testNameKey(name)}`; return <button key={name} type="button" aria-pressed={selectedTest === v} onClick={() => { setSelectedTest(v); setPage(1); }}>{name}</button>; })}
                      <button type="button" aria-pressed={selectedTest === 'NONE'} onClick={() => { setSelectedTest('NONE'); setPage(1); }}>Chưa gắn đề</button>
                    </div>
                    <h5>PART</h5>
                    <div className="nb-cs">
                      <button type="button" aria-pressed={selectedPart === 'ALL'} onClick={() => { setSelectedPart('ALL'); setPage(1); }}>Tất cả</button>
                      {partsPresent.map(n => <button key={n} type="button" aria-pressed={selectedPart === n} onClick={() => { setSelectedPart(n); setPage(1); }}>{n}</button>)}
                    </div>
                    <h5>LÝ DO SAI</h5>
                    <div className="nb-cs">
                      <button type="button" aria-pressed={selectedCategory === 'ALL'} onClick={() => { setSelectedCategory('ALL'); setPage(1); }}>Tất cả</button>
                      {(Object.keys(ERROR_CATEGORY_LABELS) as ErrorCategory[]).map(c => <button key={c} type="button" aria-pressed={selectedCategory === c} onClick={() => { setSelectedCategory(c); setPage(1); }}>{categoryShort(c)}</button>)}
                    </div>
                    <div className="nb-pft"><span>{filteredMistakes.length} câu khớp</span><button type="button" onClick={() => setFilterOpen(false)}>Xong</button></div>
                  </div>
                )}
              </div>
              <button type="button" className="nb-add" onClick={() => openManual()}><span aria-hidden="true">✏️</span> Tự gõ một câu</button>
            </div>
            {pickedFilters > 0 && (
              <div className="nb-chips">
                {selectedTest !== 'ALL' && <button type="button" onClick={() => { setSelectedTest('ALL'); setPage(1); }} aria-label="Bỏ lọc đề">Đề {selectedTest === 'NONE' ? 'chưa gắn' : selectedTest === 'SCOPE' ? 'đang xem' : defaultSourceName}<i>×</i></button>}
                {selectedPart !== 'ALL' && <button type="button" onClick={() => { setSelectedPart('ALL'); setPage(1); }} aria-label="Bỏ lọc Part">Part {selectedPart}<i>×</i></button>}
                {selectedCategory !== 'ALL' && <button type="button" onClick={() => { setSelectedCategory('ALL'); setPage(1); }} aria-label="Bỏ lọc lý do">{categoryShort(selectedCategory)}<i>×</i></button>}
                <button type="button" className="nb-clear" onClick={() => { setSelectedTest('ALL'); setSelectedPart('ALL'); setSelectedCategory('ALL'); setPage(1); }}>Bỏ lọc</button>
              </div>
            )}

            {visibleMistakes.length ? (
              <ul className="nb-rows">
                {visibleMistakes.map(m => {
                  const due = reviewLabel(m);
                  return (
                    <li key={m.id}>
                      <button type="button" className="nb-row" onClick={() => setDetailId(m.id)}>
                        <span className={'nb-part p' + m.part}>Part {m.part}</span>
                        <span className="nb-q"><b>{(m.question ?? m.questionContext ?? '').trim() || m.correctAnswer || 'Câu sai'}</b>
                          <small>{m.questionNumber ? `Câu ${m.questionNumber}` : 'Tự ghi'}{m.sourceTestName ? ` · ${m.sourceTestName}` : ''}</small></span>
                        <span className={'nb-cat c-' + m.category}>{categoryShort(m.category)}</span>
                        <span className={'nb-due' + (due.due ? ' is-due' : '')}>{due.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : !activeFilterCount && selectedStatus === 'ALL' && waiting.length ? (
              <p className="nb-hint">Câu chờ ghi chi tiết không nằm trong danh sách; ghi xong câu nào, câu đó hiện ở đây.</p>
            ) : (
              <div className="nb-none">
                <p>Không có câu nào khớp bộ lọc.</p>
                <button type="button" className="nb-ghost" onClick={resetFilters}>Bỏ lọc</button>
              </div>
            )}
            {pageCount > 1 && (
              <nav className="nb-pager" aria-label="Trang Sổ tay">
                <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹ Trước</button>
                <span>{currentPage} / {pageCount}</span>
                <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Sau ›</button>
              </nav>
            )}
          </>
        )}
        {overlays}
      </div>
    );
  }

  return (
    <div className={'notebook-view animate-fade-in ' + (isPhone && reviewCount > 0 ? 'pb-28' : 'pb-10')}>
      {/* Filter Chip Indicator when active filters exist */}
      {activeFilterCount > 0 && (
        <div className="w-full mb-2.5 flex items-center justify-between rounded-xl border-2 border-slate-900 bg-indigo-50/90 px-3.5 py-2 text-xs shadow-[1.5px_1.5px_0_0_#0f172a] dark:border-slate-300 dark:bg-indigo-950/40 dark:shadow-[1.5px_1.5px_0_0_#cbd5e1]">
          <span className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-200 min-w-0 truncate">
            <Tag className="h-3.5 w-3.5 text-indigo-700 dark:text-indigo-300 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {selectedTest !== 'ALL' && (
                <span>Đang lọc đề: <strong className="font-black text-indigo-950 dark:text-white">{defaultSourceName || (selectedTest === 'NONE' ? 'Chưa gắn đề' : 'Theo đề')}</strong></span>
              )}
              {selectedPart !== 'ALL' && <span> · Part {selectedPart}</span>}
              {selectedCategory !== 'ALL' && <span> · {ERROR_CATEGORY_LABELS[selectedCategory]?.label ?? selectedCategory}</span>}
              {searchTerm.trim() && <span> · "{searchTerm.trim()}"</span>}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(6);
              resetFilters();
            }}
            className="ml-2 shrink-0 rounded-lg bg-white border border-slate-900 px-2.5 py-1 text-[11.5px] font-black text-slate-800 hover:bg-slate-100 shadow-[1px_1px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-300 dark:bg-slate-900 dark:text-slate-100 transition-all cursor-pointer"
          >
            ✕ Bỏ lọc
          </button>
        </div>
      )}

      <section aria-labelledby="notebook-heading" className="rounded-2xl border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-[#121A2B] dark:shadow-[3px_3px_0px_#cbd5e1] max-md:-mx-4 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none max-md:dark:bg-transparent max-md:dark:shadow-none">
      <header className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3 pt-4 sm:px-5 max-md:p-0">
        <h2 id="notebook-heading" className="max-md:sr-only flex items-center gap-2 text-base font-black text-slate-900 sm:text-lg dark:text-white"><BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />Sổ tay</h2>
        {/* Desktop: review & create mistake buttons */}
        <div className={'hidden sm:flex items-center gap-2 ' + (mistakes.length === 0 ? '!hidden' : '')}>
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
              : <span>Chưa có thẻ đến hạn</span>}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-white px-4 py-2 text-sm font-extrabold text-slate-950 shadow-[2.5px_2.5px_0px_#0f172a] transition-all hover:bg-slate-50 dark:border-slate-300 dark:bg-slate-900 dark:text-white dark:shadow-none dark:hover:bg-slate-800 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
            <span>Thêm câu sai</span>
          </button>
        </div>
      </header>
      {mistakes.length > 0 && (!isPhone || phoneSearchOpen) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 pb-4 sm:px-5 dark:border-slate-700 max-md:border-0 max-md:px-4 max-md:pb-2">
          <div className="max-md:hidden inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold sm:text-sm dark:border-slate-700 dark:bg-[#121A2B]" role="group" aria-label="Lọc theo trạng thái">
            {([['ALL', 'Tất cả', stats.total], ['DUE', 'Cần ôn', stats.due], ['MASTERED', 'Đã thuộc', stats.mastered]] as const).map(([value, label, count]) => (
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
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-10 text-center max-md:pt-12">
          <EmptyCards />
          <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">Sổ tay đang trống</p>
          <p className="text-sm font-semibold leading-relaxed text-slate-500 dark:text-slate-400">Mỗi câu làm sai thành một thẻ ôn. Ghi điểm một đề Full Test, các câu Reading sai sẽ tự vào đây.</p>
          <div className="mt-3 flex w-full flex-col gap-2.5">
            {onOpenSessionLogger && <button type="button" onClick={onOpenSessionLogger}
              className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-blue-600 px-4 text-sm font-black text-white shadow-[3px_3px_0_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-200 dark:shadow-[3px_3px_0_0_#cbd5e1]">Ghi điểm đề Full Test</button>}
            <button type="button" onClick={openCreate}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-white px-4 text-sm font-black text-slate-900 dark:border-slate-300 dark:bg-slate-900 dark:text-white">Thêm câu sai</button>
          </div>
        </div>
      ) : isPhone ? renderPhoneGroups() : (
        <div className="notebook-list divide-y divide-slate-200 dark:divide-slate-800">
          {selectedStatus === 'ALL' && desktopPending.length > 0 && (
            <section aria-label={`Chưa ghi chi tiết · ${desktopPending.length}`} className="divide-y divide-amber-200/60 border-b border-amber-200/80 bg-amber-50/70 dark:divide-amber-800/40 dark:border-amber-800/50 dark:bg-amber-950/20">
              <h3 className="sr-only">Chưa ghi chi tiết</h3>


              {renderPendingTests(desktopPending)}
            </section>
          )}
          {visibleMistakes.map(mistake => (
            <MistakeCard key={mistake.id} {...cardProps(mistake)} />
          ))}
          {filteredMistakes.length === 0 && !(selectedStatus === 'ALL' && desktopPending.length > 0) && (
            <div className="m-6 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center space-y-3 dark:border-slate-700 dark:bg-slate-900/30">
              <Inbox className="h-8 w-8 mx-auto text-slate-400 mb-2 stroke-[1.5]" aria-hidden="true" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {defaultSourceName && !sourceHasNotes
                  ? `Chưa có thẻ câu sai nào thuộc đề "${defaultSourceName}"`
                  : 'Không có thẻ nào khớp bộ lọc hiện tại'}
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {mistakes.length > 0 && sourceHasNotes ? 'Thử thay đổi hoặc bỏ bộ lọc để xem các câu đã lưu.' : mistakes.length > 0 ? (
                  <>Toàn bộ sổ tay đang có <strong className="font-bold text-slate-800 dark:text-slate-200">{mistakes.length} câu sai</strong> từ các đề khác.</>
                ) : (
                  <>Bạn chưa lưu câu sai nào vào Sổ tay.</>
                )}
              </p>
              <div className="flex gap-2 justify-center pt-2">
                {defaultSourceName && (
                  <button
                    type="button"
                    onClick={() => { triggerHaptic(6); openCreate(); }}
                    className="px-4 py-2 rounded-xl border-2 border-slate-900 bg-blue-600 text-white font-black text-xs shadow-[2px_2px_0_0_#0f172a] hover:bg-blue-500 cursor-pointer"
                  >
                    + Thêm câu sai cho đề này
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { triggerHaptic(6); resetFilters(); }}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {mistakes.length > 0 ? `Xem tất cả ${mistakes.length} câu` : 'Đặt lại bộ lọc'}
                </button>
              </div>
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

      {/* Sticky Bottom CTA on Mobile when cards need spaced repetition review */}
      {isPhone && reviewCount > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+2px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7] to-transparent px-4 pb-3 pt-4 dark:from-[#070C16] dark:via-[#070C16]">
          <button
            type="button"
            onClick={() => onStartReview(activeFilterCount ? matchingMistakes.filter(m => isDueForReview(m)).map(m => m.id) : undefined)}
            aria-label={`Bắt đầu ôn tập ${reviewCount} thẻ ngắt quãng`}
            className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 bg-rose-600 px-4 text-[15px] font-black text-white shadow-[3px_3px_0_0_#0f172a] transition-all hover:bg-rose-700 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-rose-300 dark:bg-rose-600 dark:shadow-none"
          >
            <Brain className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>Bắt đầu ôn tập {reviewCount} thẻ ngắt quãng</span>
          </button>
        </div>
      )}

      {overlays}
    </div>
  );
}

/** Empty notebook: a small stack of review cards, the front one with a Part chip and an answer row. */
function EmptyCards() {
  return (
    <div className="relative h-28 w-40" aria-hidden="true">
      <div className="absolute left-3 top-5 h-20 w-32 -rotate-[8deg] rounded-2xl border-2 border-slate-900 bg-teal-100 dark:border-slate-300 dark:bg-teal-950" />
      <div className="absolute left-5 top-3 h-20 w-32 rotate-[5deg] rounded-2xl border-2 border-slate-900 bg-indigo-100 dark:border-slate-300 dark:bg-indigo-950" />
      <div className="absolute left-4 top-4 h-20 w-32 rounded-2xl border-2 border-slate-900 bg-white p-2.5 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-slate-900 dark:shadow-[3px_3px_0_0_#cbd5e1]">
        <span className="block h-4 w-7 rounded-md bg-teal-600" />
        <span className="mt-2 block h-1.5 rounded bg-slate-200 dark:bg-slate-700" />
        <span className="mt-1 block h-1.5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
        <span className="mt-2 flex gap-1">
          <i className="h-3 w-3 rounded-full border-2 border-slate-300" /><i className="h-3 w-3 rounded-full border-2 border-slate-900 bg-rose-500" />
          <i className="h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-500" /><i className="h-3 w-3 rounded-full border-2 border-slate-300" />
        </span>
      </div>
    </div>
  );
}
