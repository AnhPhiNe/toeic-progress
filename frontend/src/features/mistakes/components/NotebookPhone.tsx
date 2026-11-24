import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PhoneAvatarButton } from '@/app/components/phone';
import { PageTip } from '@/features/guide/PageTip';
import type { MistakeUndoAction } from '../lib/mistakeUndo';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import { isBlankDraft, isRetiredDraft } from '@/features/mistakes/lib/mistakeDrafts';
import { groupDetailAttempts } from '@/features/mistakes/lib/detailGroups';
import { waitingTests } from '@/features/mistakes/lib/wrongDetail';
import { WrongDetailFlow } from './wrong-detail/WrongDetailFlow';
import { DraftWaitRow } from './wrong-detail/DraftWaitRow';
import { mistakeTestName, testNameKey } from '@/features/mistakes/lib/sourceTests';
import { questionSnippet } from '@/features/mistakes/lib/questionSnippet';
import { collectTestNames } from '@/shared/domain/testNames';
import { isDueForReview, canReview, reviewBatch } from '@/features/mistakes/lib/spacedRepetition';
import { matchesSearch } from '@/features/mistakes/lib/notebookSearch';
import { dueSummary } from '@/features/mistakes/lib/notebookSummary';
import { inputText, type MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import { getUserChoice, optionLetter } from '@/features/mistakes/lib/userChoice';
import { matchesExplanationCard, mergeExplanation } from '@/features/mistakes/lib/explanationMerge';
import { canRetryFree, explanationsVersion, isExplaining, retryExplanation, subscribeExplanations } from '@/features/mistakes/services/explanationQueue';
import { captureState, closeCapture, dismissBackgroundNotice, openCapture, openReview, subscribeCapture } from '@/features/mistakes/services/captureSession';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import { loadMistakes } from '@/shared/data/storage';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { SuccessMark } from '@/shared/ui/SuccessMark';
import { MistakeEntryModal } from './MistakeEntryModal';
import { categoryShort, rowReviewLabel } from './MistakeDetail';
import { CardDetailPhone } from './phone/CardDetailPhone';
import { withSavedWords } from '@/features/mistakes/lib/savedWords';
import { CapturePhone } from './phone/CapturePhone';
import { CameraIcon, PhoneNotebookEmpty } from './phone/PhoneNotebookEmpty';
import { categoryChip, PART_COLORS } from './phone/partStyle';
import './notebook-rd.css';
import './phone/phone-notebook.css';

/**
 * Sổ tay on phones (design/previews/mock-phone-notebook.html): a pink card with today's due cards, three tabs, rows that
 * open one card; "Chụp" opens the camera screen, "Ôn" the full-screen review (ReviewPhone, mounted by App).
 */
export interface NotebookPhoneProps {
  /** Same data and handlers MistakeNotebookView (desktop) receives. */
  mistakes: MistakeEntry[];
  sessions?: StudySession[];
  initialSourceNames?: string[];
  initialPart?: number;
  /** Opens the note form for a test (or, with detailSessionId, the detail flow); also set by the + Ghi "Chụp câu sai" tile with an empty request. */
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
  onOpenSessionLogger?: () => void;
}

type Tab = 'due' | 'mastered' | 'all';
const STEP = 30;

export function NotebookPhone({ mistakes, sessions = [], initialSourceNames, initialPart, createRequest, dueCount, onStartReview, onAddMistake, onAddMistakes,
  onMarkMastered, onReopenCards, onDeleteMistake, onUpdateMistake }: NotebookPhoneProps) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [part, setPart] = useState<number | null>(initialPart ?? null);
  const [testKey, setTestKey] = useState<string | null>(initialSourceNames?.length ? 'SCOPE' : null);
  const [shown, setShown] = useState(STEP);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(Boolean(createRequest && !createRequest.detailSessionId));
  const [entry, setEntry] = useState<MistakeEntry | null | undefined>(undefined);
  const [editorVersion, setEditorVersion] = useState(0);
  const [detailSessionId, setDetailSessionId] = useState<string | null>(createRequest?.detailSessionId ?? null);
  const capture = useSyncExternalStore(subscribeCapture, captureState);
  const [feedback, setFeedback] = useState<{ id: number; message: string; error: boolean; undo?: MistakeUndoAction; owner?: string | null } | null>(null);
  const sequence = useRef(0);
  const notify = useCallback((message: string, error = false) => { setFeedback({ id: ++sequence.current, message, error }); }, []);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), feedback.undo ? 15000 : feedback.error ? 7000 : 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const sessionNames = useMemo(() => new Map(sessions.filter(s => !s.deletedAt).map(s => [s.id, s.testName])), [sessions]);
  const sourced = useMemo(() => mistakes.filter(m => !isRetiredDraft(m)).map(m => ({ ...m, sourceTestName: mistakeTestName(m, sessionNames) })), [mistakes, sessionNames]);
  const scopeKeys = useMemo(() => new Set((initialSourceNames ?? []).map(testNameKey)), [initialSourceNames]);
  const sourceSuggestions = useMemo(() => collectTestNames(sessions, mistakes), [sessions, mistakes]);
  // Number-only drafts of a logged test wait in one row (Gỡ câu sai), out of the list and its counts; a draft with any
  // content is a card like the others.
  const reviewable = useMemo(() => sourced.filter(m => !isBlankDraft(m)), [sourced]);
  const matching = useMemo(() => {
    return reviewable.filter(m => matchesSearch(m, term)
      && (part === null || m.part === part)
      && (testKey === null || (testKey === 'SCOPE' ? scopeKeys.has(testNameKey(m.sourceTestName)) : testNameKey(m.sourceTestName) === testKey)));
  }, [reviewable, term, part, testKey, scopeKeys]);
  const due = useMemo(() => matching.filter(m => isDueForReview(m)), [matching]);
  const mastered = useMemo(() => matching.filter(m => m.status === 'MASTERED' && canReview(m)), [matching]);
  const filtered = Boolean(term.trim()) || part !== null || testKey !== null;
  const summary = dueSummary(due);
  const reviewCount = filtered ? summary.count : dueCount;
  const batch = reviewBatch(reviewCount);
  const activeTab: Tab = tab ?? (reviewCount > 0 ? 'due' : 'all');
  const rows = activeTab === 'due' ? due : activeTab === 'mastered' ? mastered : matching;

  // Writing explanations and deleting, as on computers.
  const { containerRef: captchaRef, getToken, remove: removeCaptcha } = useTurnstile();
  const [explainingId, setExplainingId] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useSyncExternalStore(subscribeExplanations, explanationsVersion);
  const explain = async (card: MistakeEntry) => {
    if (explainingId) return;
    const owner = getActiveAccountId();
    const isCurrent = () => mounted.current && getActiveAccountId() === owner;
    const chosen = getUserChoice(card);
    const sourceAnswer = card.answerSource === 'PROVIDED' ? optionLetter(card.correctAnswer) : '';
    const input: MistakeInput = { question: card.question ?? card.questionContext, options: [...(card.options ?? [])], context: card.context ?? '', part: card.part,
      userChoiceState: card.userChoiceState ?? (chosen ? 'CHOSEN' : 'UNKNOWN'), userChoice: chosen,
      userReason: card.userReason ?? '', sourceAnswer, ...(card.category !== 'OTHER' ? { errorCategory: card.category } : {}) };
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
  const deleteCard = (id: string) => {
    if (!window.confirm('Xóa lỗi này khỏi sổ tay?')) return;
    try {
      const owner = getActiveAccountId();
      const undo = onDeleteMistake(id);
      setFeedback({ id: ++sequence.current, message: 'Đã xóa thẻ', error: false, ...(undo ? { undo, owner } : {}) });
      setDetailId(null);
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
      const saved = loadMistakes().find(m => m.id === id);
      if (saved?.status === 'MASTERED' && canReview(saved)) notify('Đã chuyển sang Đã thuộc');
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa lưu được trạng thái thẻ.', true); }
  };

  const detail = detailId ? sourced.find(m => m.id === detailId) : undefined;
  const defaultTestName = createRequest?.sourceName ?? initialSourceNames?.[0] ?? '';
  const detailSession = detailSessionId ? sessions.find(session => session.id === detailSessionId && !session.deletedAt) : undefined;
  const waiting = useMemo(() => {
    const scoped = sourced.filter(m => testKey === null || (testKey === 'SCOPE' ? scopeKeys.has(testNameKey(m.sourceTestName)) : testNameKey(m.sourceTestName) === testKey));
    const attempts = new Map(groupDetailAttempts(scoped.filter(isBlankDraft), sessions).map(group => [group.sessionId, group]));
    return waitingTests(scoped, id => ({ title: attempts.get(id)?.title ?? 'Chưa ghi đề', attempt: attempts.get(id)?.attempt ?? '' }));
  }, [sourced, sessions, testKey, scopeKeys]);
  const openCamera = () => { openCapture(); setCaptureOpen(true); };

  const overlays = (
    <>
      <div ref={captchaRef} aria-label="Xác minh yêu cầu AI" />
      <div role="status" aria-live="polite" className="pn-toast-region">
        {feedback && (
          <div key={feedback.id} className={'pn-toast' + (feedback.error ? ' is-error' : '')}>
            {feedback.error ? <b aria-hidden="true">!</b> : <SuccessMark />}
            <p>{feedback.message}</p>
            {feedback.undo && feedback.owner === getActiveAccountId() && <button type="button" onClick={undoDelete}>Hoàn tác</button>}
            <button type="button" aria-label="Đóng thông báo" className="pn-toast__x" onClick={() => setFeedback(null)}>×</button>
          </div>
        )}
        {!captureOpen && (capture.phase === 'reading' || capture.activeJobs > 0 || capture.finishedInBackground) && (() => {
          const busy = capture.phase === 'reading' || capture.activeJobs > 0;
          const openFromToast = () => {
            openCapture();
            if (!busy && capture.phase === 'input' && (capture.items.length || capture.failures.length)) openReview();
            setCaptureOpen(true);
          };
          return (
            <div className="pn-toast is-soc">
              <Soc state={busy ? 'think' : 'cheerC'} size={40} />
              <p>{busy
                ? (capture.activeJobs > 0 ? `Sóc đang đọc nền ${capture.activeJobs} mẻ…` : `Sóc đang đọc ${capture.images.length} ảnh…`)
                : capture.items.length ? `Sóc đọc xong, ${capture.items.length} câu sai để soát` : 'Sóc đọc xong, chưa thấy câu sai'}</p>
              <button type="button" onClick={openFromToast}>{busy ? 'Xem' : 'Soát'}</button>
              {!busy && <button type="button" aria-label="Đóng thông báo" className="pn-toast__x" onClick={dismissBackgroundNotice}>×</button>}
            </div>
          );
        })()}
      </div>
      {detailSession && <WrongDetailFlow session={detailSession} mistakes={mistakes} phone onSave={onUpdateMistake} onAdd={onAddMistake}
        onReview={ids => onStartReview(ids)}
        onClose={saved => { setDetailSessionId(null); if (saved) notify(`Đã ghi chi tiết ${saved} câu`); }} />}
      {captureOpen && <CapturePhone sessions={sessions} mistakes={mistakes} sourceSuggestions={sourceSuggestions} initialTestName={defaultTestName} getToken={getToken}
        onClose={() => { closeCapture(); setCaptureOpen(false); }} onManual={() => { setCaptureOpen(false); setEntry(null); }}
        onAddBatch={onAddMistakes} onUpdate={onUpdateMistake} onSaved={message => notify(message)} />}
      {entry !== undefined && <MistakeEntryModal key={`${entry?.id ?? 'new'}:${editorVersion}`} original={entry} sourceSuggestions={sourceSuggestions}
        initialSourceName={entry ? mistakeTestName(entry, sessionNames) : defaultTestName} initialSessionId={createRequest?.sessionId}
        onAdd={onAddMistake} onAddBatch={onAddMistakes} onUpdate={onUpdateMistake} onClose={() => setEntry(undefined)} onSaved={message => notify(message)}
        onReload={() => { setEntry(loadMistakes().find(value => value.id === entry?.id)); setEditorVersion(value => value + 1); }} />}
    </>
  );

  if (detail) {
    const actions = {
      onEdit: () => setEntry(mistakes.find(m => m.id === detail.id) ?? detail),
      onDelete: () => deleteCard(detail.id),
      onMarkMastered: () => markMastered(detail.id),
      onReopen: () => onReopenCards([detail.id]),
      onReview: () => onStartReview([detail.id]),
      onExplain: () => {
        if (canRetryFree(detail.id)) { if (retryExplanation(detail.id)) notify('Đang viết lời giải…'); return; }
        void explain(mistakes.find(m => m.id === detail.id) ?? detail);
      },
      explainLabel: canRetryFree(detail.id) ? 'Viết lời giải' : 'Giải thích với AI',
      explaining: explainingId === detail.id || isExplaining(detail.id),
      onResolveDoubt: (switchToAI: boolean) => {
        const latest = mistakes.find(m => m.id === detail.id) ?? detail;
        const option = latest.options?.find(value => optionLetter(value) === latest.answerDoubt);
        onUpdateMistake({ ...latest, answerDoubt: undefined, ...(switchToAI && option ? { correctAnswer: option, answerSource: 'PROVIDED', answerProvidedBy: 'LEARNER' } : {}) }, latest);
        notify(switchToAI ? `Đã đổi đáp án sang ${latest.answerDoubt}` : 'Đã giữ đáp án trang đề');
      },
      onSaveWords: (words: string[]) => {
        const latest = mistakes.find(m => m.id === detail.id) ?? detail;
        const next = withSavedWords(latest, words);
        try { if (next !== latest) onUpdateMistake(next, latest); }
        catch (reason) { notify(reason instanceof Error ? reason.message : 'Chưa lưu được từ.', true); }
      }
    } as const;
    return (
      <div className="rd pn pn-detail">
        <CardDetailPhone mistake={detail} testName={detail.sourceTestName ?? undefined} onBack={() => setDetailId(null)} actions={actions} />
        {overlays}
      </div>
    );
  }

  const empty = mistakes.length === 0;
  const testLabel = testKey === 'SCOPE' ? 'Đề đang xem' : testKey ? sourced.find(m => testNameKey(m.sourceTestName) === testKey)?.sourceTestName ?? '' : '';
  const tabs: Array<[Tab, string, number]> = [['due', 'Cần ôn', due.length], ['mastered', 'Đã thuộc', mastered.length], ['all', 'Tất cả', matching.length]];

  return (
    <div className="rd pn">
      <header className="pn-head">
        <h1>Sổ tay</h1>
        {!empty && <button type="button" className="pn-cam" data-guide="notebook" onClick={openCamera}><CameraIcon /> Chụp</button>}
        <PhoneAvatarButton />
      </header>
      <PageTip id="notebook" ready={!empty} />

      {empty ? (
        <PhoneNotebookEmpty onCapture={openCamera} onManual={() => setEntry(null)} />
      ) : (
        <>
          <section className={'pn-due' + (reviewCount > 0 ? '' : ' is-none')}>
            <div>
              {reviewCount > 0 ? <>
                <h2>{reviewCount} câu đến hạn<br />ôn hôm nay</h2>
                <p>{summary.topPart ? `Nhiều nhất Part ${summary.topPart} · ` : ''}khoảng {Math.max(1, Math.round(batch.count * 0.8))} phút</p>
                <button type="button" className="pn-go" onClick={() => onStartReview(filtered ? due.map(m => m.id) : undefined, batch.count)}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5 12 7 3 12.5z" fill="currentColor" /></svg> Ôn {batch.count} câu{batch.rest ? ` · còn ${batch.rest}` : ''}</button>
              </> : <>
                <h2>Hôm nay chưa có câu nào đến hạn</h2>
                <p>Sóc sẽ nhắc khi tới lúc ôn lại. Có trang chữa bài mới thì chụp vào đây nhé.</p>
              </>}
            </div>
            <Soc state={reviewCount > 0 ? 'idle' : 'cheerC'} size={96} className="pn-due__soc" />
          </section>

          {waiting.length > 0 && <DraftWaitRow tests={waiting} phone onOpen={setDetailSessionId} />}

          <div className="pn-tabs" role="group" aria-label="Lọc theo trạng thái">
            {tabs.map(([id, label, count]) => (
              <button key={id} type="button" aria-pressed={activeTab === id} onClick={() => { setTab(id); setShown(STEP); }}>{label}<b>{count}</b></button>
            ))}
            <button type="button" className="pn-srch" aria-label={searchOpen ? 'Ẩn tìm kiếm' : 'Tìm trong sổ tay'} aria-pressed={searchOpen || Boolean(term.trim())} onClick={() => setSearchOpen(v => !v)}>
              <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M11 11 L14.5 14.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </button>
          </div>
          {searchOpen && <input type="search" className="pn-search" autoFocus value={term} onChange={e => { setTerm(e.target.value); setShown(STEP); }} placeholder="Tìm câu hỏi, mẹo…" aria-label="Tìm trong sổ tay" />}
          {(part !== null || testKey !== null) && (
            <div className="pn-chips">
              {part !== null && <button type="button" aria-label="Bỏ lọc Part" onClick={() => setPart(null)}>Part {part}<i>×</i></button>}
              {testKey !== null && <button type="button" aria-label="Bỏ lọc đề" onClick={() => setTestKey(null)}>{testLabel ? `Đề ${testLabel}` : 'Đề này'}<i>×</i></button>}
            </div>
          )}

          {rows.length ? (
            <ul className="pn-rows">
              {rows.slice(0, shown).map(m => {
                const label = rowReviewLabel(m), chip = categoryChip(m.category);
                return (
                  <li key={m.id}>
                    <button type="button" className="pn-row" onClick={() => setDetailId(m.id)} aria-label={[m.questionNumber ? `Câu ${m.questionNumber}` : '', questionSnippet(m), `Part ${m.part}`, chip ? categoryShort(m.category) : '', label.text].filter(Boolean).join(', ')}>
                      <span className="pn-pt" style={{ background: PART_COLORS[m.part] ?? '#7c5ce0' }}>P{m.part}</span>
                      <span className="pn-q"><b>{questionSnippet(m)}</b>
                        {chip && <span className="pn-chip" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>}</span>
                      {label.text && <span className={'pn-when' + (label.due ? ' is-due' : '')}>{label.text}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="pn-none">
              <p>{filtered ? 'Không có câu nào khớp bộ lọc.' : activeTab === 'due' ? 'Không có câu nào đến hạn.' : activeTab === 'mastered' ? 'Chưa có câu nào đã thuộc.' : 'Chưa có câu nào.'}</p>
              {filtered && <button type="button" onClick={() => { setTerm(''); setPart(null); setTestKey(null); }}>Bỏ lọc</button>}
            </div>
          )}
          {rows.length > shown && <button type="button" className="pn-more" onClick={() => setShown(value => value + STEP)}>Xem thêm {Math.min(STEP, rows.length - shown)} câu</button>}
        </>
      )}
      {overlays}
    </div>
  );
}
