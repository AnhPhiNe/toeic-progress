import { useState, useMemo, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { ImagePlus, X, AlertCircle } from 'lucide-react';
import type { MistakeEntry, ErrorCategory, StudySession } from '@/shared/types';
import { ERROR_CATEGORY_LABELS } from '@/shared/types';
import { WrongDetailFlow } from '@/features/mistakes/components/wrong-detail/WrongDetailFlow';
import { DraftWaitRow } from '@/features/mistakes/components/wrong-detail/DraftWaitRow';
import { isBlankDraft, isRetiredDraft, needsSupplement } from '@/features/mistakes/lib/mistakeDrafts';
import { groupDetailAttempts } from '@/features/mistakes/lib/detailGroups';
import { waitingTests } from '@/features/mistakes/lib/wrongDetail';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { inputText, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { getUserChoice, optionLetter } from '@/features/mistakes/lib/userChoice';
import { matchesExplanationCard, mergeExplanation, fitsSyncPayload } from '@/features/mistakes/lib/explanationMerge';
import { canRetryFree, explanationsVersion, isExplaining, retryExplanation, subscribeExplanations } from '@/features/mistakes/services/explanationQueue';
import { MistakeEntryModal } from '@/features/mistakes/components/MistakeEntryModal';
import { CaptureModal } from '@/features/mistakes/components/CaptureModal';
import { ManualQuestionModal } from '@/features/mistakes/components/ManualQuestionModal';
import { NotebookEmpty } from '@/features/mistakes/components/NotebookEmpty';
import { addFiles, backToInput, captureState, closeCapture, openCapture, openReview, dismissBackgroundNotice, subscribeCapture } from '@/features/mistakes/services/captureSession';
import { isDueForReview, canReview, reviewBatch } from '@/features/mistakes/lib/spacedRepetition';
import { dueSummary } from '@/features/mistakes/lib/notebookSummary';
import { dueFirst, matchesSearch } from '@/features/mistakes/lib/notebookSearch';
import { questionSnippet } from '@/features/mistakes/lib/questionSnippet';
import { loadMistakes } from '@/shared/data/storage';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { mistakeTestName, testNameKey, uniqueTestNames } from '@/features/mistakes/lib/sourceTests';
import { collectTestNames } from '@/shared/domain/testNames';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import { askConfirm } from '@/shared/components/ConfirmDialog';
import type { MistakeUndoAction } from '@/features/mistakes/lib/mistakeUndo';
import { PageTip } from '@/features/guide/PageTip';
import './notebook.css';
import './notebook-rd.css';
import './capture-rd.css';
import { MistakeDetail, categoryShort, rowReviewLabel } from './MistakeDetail';
import { savedVocabulary, toggleSavedWord, withSavedWords, withoutSavedWord } from '@/features/mistakes/lib/savedWords';
import { Soc } from '@/shared/ui/soc/Soc';

const NOTEBOOK_PAGE_SIZE = 8;

interface MistakeNotebookViewProps {
  mistakes: MistakeEntry[];
  sessions?: StudySession[];
  initialSourceNames?: string[];
  /** Opens the notebook already filtered to one Part (from a treasure chest in Hành trình điểm). */
  initialPart?: number;
  /** Opens the note form for a test, or with `detailSessionId` the detail flow for that test's draft cards. */
  createRequest?: { sourceName?: string; sessionId?: string; detailSessionId?: string };
  dueCount: number;
  /** Selected cards (or all due), at most `limit` of them. */
  onStartReview: (ids?: string[], limit?: number) => void;
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
  onMarkMastered, onReopenCards, onDeleteMistake, onUpdateMistake }: MistakeNotebookViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState<number | 'ALL'>(initialPart ?? 'ALL');
  // null: "Cần ôn" while something is due, otherwise "Tất cả" (as on phones).
  const [chosenStatus, setSelectedStatus] = useState<'ALL' | 'DUE' | 'MASTERED' | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ErrorCategory | 'ALL'>('ALL');
  const [selectedTest, setSelectedTest] = useState(() => initialSourceNames === undefined ? 'ALL'
    : initialSourceNames.length === 1 ? initialSourceNames[0] ? `test:${testNameKey(initialSourceNames[0])}` : 'NONE' : 'SCOPE');
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [entry, setEntry] = useState<MistakeEntry | null | undefined>(createRequest && !createRequest.detailSessionId ? null : undefined);
  // The test whose wrong questions are being worked through (Gỡ câu sai); its cards are read live from `mistakes`.
  const [detailSessionId, setDetailSessionId] = useState<string | null>(createRequest?.detailSessionId ?? null);
  const [quickDetailId, setQuickDetailId] = useState<string | null>(createRequest?.detailSessionId ?? null);
  const [sessionSource, setSessionSource] = useState(createRequest);
  const [reusedReading, setReusedReading] = useState<{ text: string; sourceName: string; cardId: string } | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  // Computers (2026-11 redesign): a list of rows; a row opens one detail card.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [nbTab, setNbTab] = useState<'mistakes' | 'words'>('mistakes');
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
  const deleteCard = async (id: string) => {
    const ok = await askConfirm({ title: 'Xóa thẻ lỗi?', message: 'Xóa lỗi này khỏi sổ tay? Bạn vẫn có thể bấm Hoàn tác ngay sau đó.', confirmLabel: 'Xóa thẻ', cancelLabel: 'Giữ lại', destructive: true });
    if (!ok) return;
    try {
      const owner = getActiveAccountId();
      const undo = onDeleteMistake(id);
      setFeedback({ id: ++feedbackSequence.current, message: 'Đã xóa thẻ', error: false, ...(undo ? { undo, owner } : {}) });
      setDetailId(current => (current === id ? null : current));
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

  const ingestDroppedOrPastedImages = useCallback((files: File[]) => {
    const current = captureState();
    if (current.phase === 'reading') {
      openCreate();
      return;
    }
    if (current.phase === 'review') backToInput(true);
    addFiles(files);
    openCreate();
  }, [openCreate]);

  // Zero-click desktop paste: Ctrl+V an image anywhere on Sổ tay immediately opens CaptureModal with the image staged.
  useEffect(() => {
    if (detailId || entry !== undefined || manualOpen || detailSessionId) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (!files.length) return;
      event.preventDefault();
      ingestDroppedOrPastedImages(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [detailId, entry, manualOpen, detailSessionId, ingestDroppedOrPastedImages]);
  const sessionNames = useMemo(() => new Map(sessions.filter(s => !s.deletedAt).map(s => [s.id, s.testName])), [sessions]);
  const sourcedMistakes = useMemo(() => mistakes.filter(m => !isRetiredDraft(m)).map(m => ({ ...m, sourceTestName: mistakeTestName(m, sessionNames) })), [mistakes, sessionNames]);
  const sourceNames = useMemo(() => uniqueTestNames(sourcedMistakes.map(m => m.sourceTestName)), [sourcedMistakes]);
  const scopeKeys = useMemo(() => new Set((initialSourceNames ?? []).map(testNameKey)), [initialSourceNames]);
  const filterSourceNames = useMemo(() => uniqueTestNames([...sourceNames, ...(initialSourceNames ?? [])]), [sourceNames, initialSourceNames]);
  const sourceSuggestions = useMemo(() => collectTestNames(sessions, mistakes), [sessions, mistakes]);
  const matchingMistakes = useMemo(() => {
    return sourcedMistakes.filter(m => matchesSearch(m, searchTerm) && (selectedPart === 'ALL' || m.part === selectedPart)
      && (selectedTest === 'ALL' || (selectedTest === 'SCOPE' ? scopeKeys.has(testNameKey(m.sourceTestName))
        : selectedTest === 'NONE' ? !m.sourceTestName : `test:${testNameKey(m.sourceTestName)}` === selectedTest))
      && (selectedCategory === 'ALL' || m.category === selectedCategory));
  }, [sourcedMistakes, searchTerm, selectedPart, selectedTest, selectedCategory, scopeKeys]);
  // Number-only drafts of a logged test are not cards yet: they wait in one row above the list (Gỡ câu sai), so the list
  // and its tab counts leave them out. A draft with any content is listed like any card.
  const listedMistakes = useMemo(() => matchingMistakes.filter(m => !isBlankDraft(m)), [matchingMistakes]);
  const waiting = useMemo(() => {
    const attempts = new Map(groupDetailAttempts(matchingMistakes.filter(isBlankDraft), sessions).map(group => [group.sessionId, group]));
    return waitingTests(matchingMistakes, id => ({ title: attempts.get(id)?.title ?? 'Chưa ghi đề', attempt: attempts.get(id)?.attempt ?? '' }));
  }, [matchingMistakes, sessions]);
  const stats = useMemo(() => ({ total: listedMistakes.length, due: listedMistakes.filter(m => isDueForReview(m)).length,
    mastered: listedMistakes.filter(m => m.status === 'MASTERED' && canReview(m)).length }), [listedMistakes]);
  const selectedStatus = chosenStatus ?? (stats.due > 0 ? 'DUE' : 'ALL');
  // Due cards first, in the order a review would take them.
  const filteredMistakes = useMemo(() => dueFirst(listedMistakes.filter(m => selectedStatus === 'ALL' ||
    (selectedStatus === 'DUE' ? isDueForReview(m) : m.status === 'MASTERED' && canReview(m)))), [listedMistakes, selectedStatus]);
  const pageCount = Math.max(1, Math.ceil(filteredMistakes.length / NOTEBOOK_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleMistakes = filteredMistakes.slice((currentPage - 1) * NOTEBOOK_PAGE_SIZE, currentPage * NOTEBOOK_PAGE_SIZE);
  useEffect(() => { setPage(current => Math.min(current, pageCount)); }, [pageCount]);
  const activeFilterCount = Number(selectedTest !== 'ALL') + Number(selectedPart !== 'ALL') + Number(selectedCategory !== 'ALL') + Number(Boolean(searchTerm.trim()));
  const reviewCount = activeFilterCount ? stats.due : dueCount;
  const defaultSourceName = filterSourceNames.find(name => `test:${testNameKey(name)}` === selectedTest) ?? (initialSourceNames?.[0] ?? '');
  const resetFilters = () => { setPage(1); setSearchTerm(''); setSelectedTest('ALL'); setSelectedPart('ALL'); setSelectedStatus('ALL'); setSelectedCategory('ALL'); };
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
    const chosen = getUserChoice(card);
    const sourceAnswer = card.answerSource === 'PROVIDED' ? optionLetter(card.correctAnswer) : '';
    const input: MistakeInput = { question: card.question ?? card.questionContext, options: [...(card.options ?? [])], context: card.context ?? '', part: card.part,
      userChoiceState: card.userChoiceState ?? (chosen ? 'CHOSEN' : 'UNKNOWN'), userChoice: chosen,
      userReason: card.userReason ?? '', sourceAnswer, savedCard: true, ...(card.category !== 'OTHER' ? { errorCategory: card.category } : {}) };
    setExplainingId(card.id);
    try {
      const { draft } = await aiService.extractMistakeWithAI(inputText(input), getToken, input, [], owner, isCurrent);
      if (!isCurrent()) return;
      const latest = loadMistakes().find(value => value.id === card.id);
      if (!latest || !matchesExplanationCard(latest, input)) {
        throw new Error('Nội dung thẻ đã thay đổi hoặc bị xóa. Chưa áp dụng lời giải; hãy mở lại thẻ để kiểm tra.');
      }
      if (latest.explanation || latest.trapTip?.trim()) throw new Error('Thẻ đã có lời giải mới. Giữ nguyên lời giải đang lưu.');
      onUpdateMistake(mergeExplanation(latest, draft), latest);
      notify('Đã thêm giải thích');
    } catch (reason) { if (isCurrent()) notify(reason instanceof Error ? reason.message : 'Chưa giải thích được. Hãy thử lại.', true); }
    finally { if (isCurrent()) { setExplainingId(''); removeCaptcha(); } }
  };

  const savedWordsList = useMemo(() => savedVocabulary(sourcedMistakes), [sourcedMistakes]);
  const removeSavedWordEverywhere = (word: string) => {
    try {
      for (const m of mistakes) {
        if (m.deletedAt) continue;
        const next = withoutSavedWord(m, word);
        if (next !== m) onUpdateMistake(next, m);
      }
      notify(`Đã bỏ lưu từ "${word}"`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa bỏ lưu được từ.', true); }
  };

  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  const cardProps = (mistake: (typeof sourcedMistakes)[number]) => ({
    mistake,
    onReview: () => onStartReview([mistake.id]),
    onEdit: () => openEdit(mistakes.find(value => value.id === mistake.id) ?? mistake),
    onDelete: () => { void deleteCard(mistake.id); },
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
    },
    onSaveWords: (words: string[]) => {
      const latest = mistakes.find(value => value.id === mistake.id) ?? mistake;
      const next = withSavedWords(latest, words);
      if (next === latest) return;
      if (!fitsSyncPayload(next)) { notify('Thẻ đã quá dài để lưu thêm từ. Hãy rút gọn ghi chú hoặc bỏ bớt từ đã lưu.', true); return; }
      try { onUpdateMistake(next, latest); }
      catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa lưu được từ.', true); }
    },
    onToggleWord: (word: string) => {
      const latest = mistakes.find(value => value.id === mistake.id) ?? mistake;
      const next = toggleSavedWord(latest, word);
      if (next === latest) return;
      if (!fitsSyncPayload(next)) { notify('Thẻ đã quá dài để lưu thêm từ. Hãy rút gọn ghi chú hoặc bỏ bớt từ đã lưu.', true); return; }
      try { onUpdateMistake(next, latest); }
      catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa cập nhật được từ đã lưu.', true); }
    }
  });

  const detailSession = detailSessionId ? sessions.find(session => session.id === detailSessionId && !session.deletedAt) : undefined;

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
      {detailSession && <WrongDetailFlow quickEntry={quickDetailId === detailSession.id} session={detailSession} mistakes={mistakes} phone={false} onSave={onUpdateMistake} onAdd={onAddMistake}
        onReview={ids => onStartReview(ids)}
        onClose={saved => { setDetailSessionId(null); setQuickDetailId(null); if (saved) notify(`Đã ghi chi tiết ${saved} câu`); }} />}
      {entry === null && <CaptureModal sessions={sessions} mistakes={mistakes} sourceSuggestions={sourceSuggestions}
        initialTestName={reusedReading?.sourceName ?? sessionSource?.sourceName ?? defaultSourceName} getToken={getToken}
        onClose={closeEntry} onManual={openManual} onAddBatch={onAddMistakes} onUpdate={onUpdateMistake} onSaved={savedFeedback} />}
      {manualOpen && <ManualQuestionModal sessions={sessions} mistakes={mistakes} sourceSuggestions={sourceSuggestions}
        initialTestName={sessionSource?.sourceName ?? defaultSourceName} initialRaw={manualInitialRaw} onClose={closeEntry} onAdd={onAddMistake} onAddBatch={onAddMistakes}
        onUpdate={onUpdateMistake} onExplain={card => void explain(card)} onSaved={savedFeedback} />}
      {entry !== undefined && entry !== null && <MistakeEntryModal key={`${entry?.id ?? 'new'}:${editorVersion}`} original={entry}
        sourceSuggestions={sourceSuggestions} initialSourceName={entry ? mistakeTestName(entry, sessionNames) : reusedReading?.sourceName ?? sessionSource?.sourceName ?? defaultSourceName}
        initialSessionId={sessionSource?.sessionId}
        initialReading={reusedReading?.text}
        draftScope={reusedReading ? `reuse:${reusedReading.cardId}` : undefined}
        onAdd={onAddMistake} onAddBatch={onAddMistakes} onUpdate={onUpdateMistake} onClose={closeEntry} onSaved={savedFeedback}
        onReload={() => { setEntry(loadMistakes().find(value => value.id === entry?.id)); setEditorVersion(value => value + 1); }} />}
      {entry !== null && !manualOpen && (capture.phase === 'reading' || capture.activeJobs > 0 || capture.finishedInBackground) && (() => {
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

  const opened = detailId ? sourcedMistakes.find(m => m.id === detailId) : undefined;
  if (opened) {
    const p = cardProps(opened);
    return (
      <div className="rd nb-page is-detail">
        <MistakeDetail mistake={opened} testName={opened.sourceTestName ?? undefined} onBack={() => setDetailId(null)} actions={p} />
        {overlays}
      </div>
    );
  }
  const dueList = matchingMistakes.filter(m => isDueForReview(m) && !(needsSupplement(m) && fromLoggedTest(m)));
  const topPart = dueSummary(dueList).topPart;
  const batch = reviewBatch(reviewCount);
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
        ingestDroppedOrPastedImages(files);
      }}
    >
      {dragOver && (
        <div className="nb-drop-mask" aria-hidden="true">
          <div className="nb-drop-card">
            <ImagePlus className="h-11 w-11 text-[#d64570]" />
            <b>Thả ảnh vào đây để Sóc đọc ngay</b>
            <span>Mở ngay khay ảnh — chọn đúng Part bên trên bất cứ lúc nào mà không mất ảnh.</span>
          </div>
        </div>
      )}
      <div className="nb-top">
        <div><h1>Sổ tay</h1>{!empty && <p>Câu sai Sóc gom từ các trang chữa bài bạn chụp.</p>}</div>
        <div className="nb-topr">
          {savedWordsList.length > 0 && (
            <div className="nb-tabs" role="tablist" aria-label="Sổ tay">
              <button type="button" role="tab" aria-selected={nbTab === 'mistakes'} onClick={() => setNbTab('mistakes')}>Câu sai<em>{listedMistakes.length}</em></button>
              <button type="button" role="tab" aria-selected={nbTab === 'words'} onClick={() => setNbTab('words')}>Từ đã lưu<em>{savedWordsList.length}</em></button>
            </div>
          )}
          <PageTip id="notebook" ready={!empty} />
          {!empty && <button type="button" className="rd-btn rd-btn--pink nb-cam" data-guide="notebook" onClick={openCreate}><span aria-hidden="true">📸</span> Chụp trang chữa bài</button>}
        </div>
      </div>

      {nbTab === 'words' && savedWordsList.length > 0 ? (
        <section className="nb-words" aria-label="Từ đã lưu từ các câu sai">
          <div className="nb-words-head">
            <div>
              <h2>{savedWordsList.length} từ cần nhớ</h2>
              <p>Các từ bạn đã bấm “+ Ôn” trong thẻ câu sai. Bấm vào thẻ gốc để xem lại ngữ cảnh trong đề.</p>
            </div>
            <button type="button" className="nb-ghost" onClick={() => setNbTab('mistakes')}>← Về danh sách câu sai</button>
          </div>
          <ul className="nb-words-list">
            {savedWordsList.map(item => (
              <li key={item.word.toLowerCase()}>
                <div className="nb-w-main">
                  <b lang="en">{item.word}</b>
                  {item.meaning && <span>{item.meaning}</span>}
                </div>
                <button type="button" className="nb-w-card" onClick={() => setDetailId(item.cardId)}>
                  <span className={'nb-part p' + item.part}>Part {item.part}</span>
                  <span>{item.questionNumber ? `Câu ${item.questionNumber}` : 'Xem thẻ'} ›</span>
                </button>
                <button type="button" className="nb-w-rm" aria-label={`Bỏ lưu ${item.word}`} onClick={() => removeSavedWordEverywhere(item.word)}>Bỏ lưu</button>
              </li>
            ))}
          </ul>
        </section>
      ) : empty ? (
        <NotebookEmpty onCapture={openCreate} onManual={() => openManual()} />
      ) : (
        <>
          <section className="nb-hero">
            <div>
              {reviewCount > 0 ? <>
                <h2>{reviewCount} câu đến hạn ôn hôm nay</h2>
                <p>{topPart ? `Nhiều nhất Part ${topPart} · ` : ''}~{Math.max(1, Math.round(batch.count * 0.8))} phút · Đã thuộc {stats.mastered}/{stats.total} câu</p>
                <button type="button" className="rd-btn" onClick={() => onStartReview(activeFilterCount ? dueList.map(m => m.id) : undefined, batch.count)}>Ôn {batch.count} câu{batch.rest ? ` · còn ${batch.rest}` : ''}</button>
              </> : <>
                <h2>Hôm nay không có câu nào đến hạn</h2>
                <p>Đã thuộc {stats.mastered}/{stats.total} câu. Sóc sẽ nhắc khi tới lúc ôn lại — có trang chữa bài mới thì chụp vào đây nhé.</p>
                <button type="button" className="rd-btn" onClick={openCreate}>Chụp trang chữa bài</button>
              </>}
            </div>
            <Soc state={reviewCount > 0 ? 'idle' : 'cheerC'} size={154} className="nb-hsoc" />
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
                  <div className="nb-pft">
                    <span>{filteredMistakes.length} câu khớp</span>
                    <div className="nb-pft-acts">
                      {pickedFilters > 0 && <button type="button" className="is-reset" onClick={() => { setSelectedTest('ALL'); setSelectedPart('ALL'); setSelectedCategory('ALL'); setPage(1); }}>Đặt lại</button>}
                      <button type="button" onClick={() => setFilterOpen(false)}>Xong</button>
                    </div>
                  </div>
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
                const due = rowReviewLabel(m);
                return (
                  <li key={m.id}>
                    <button type="button" className="nb-row" onClick={() => setDetailId(m.id)}>
                      <span className={'nb-part p' + m.part}>Part {m.part}</span>
                      <span className="nb-q"><b>{questionSnippet(m)}</b>
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
          ) : activeFilterCount > 0 ? (
            <div className="nb-none">
              <p>Không có câu nào khớp bộ lọc.</p>
              <button type="button" className="nb-ghost" onClick={resetFilters}>Bỏ lọc</button>
            </div>
          ) : (
            <div className="nb-none">
              <p>{selectedStatus === 'DUE' ? 'Hôm nay chưa có câu nào đến hạn ôn.' : selectedStatus === 'MASTERED' ? 'Chưa có câu nào được đánh dấu Đã thuộc.' : 'Chưa có câu sai nào trong danh sách.'}</p>
              {selectedStatus !== 'ALL' && stats.total > 0 && <button type="button" className="nb-ghost" onClick={() => { setSelectedStatus('ALL'); setPage(1); }}>Xem tất cả ({stats.total})</button>}
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
