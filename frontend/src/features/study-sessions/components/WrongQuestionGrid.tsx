import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PhoneSheet } from '@/app/components/phone';
import { Soc } from '@/shared/ui/soc/Soc';
import { Camera, ImagePlus, Plus, Sparkles } from 'lucide-react';
import { generateUUID } from '@/shared/domain/uuid';
import { fileExifOrientation, prepareResultImages, MAX_RESULT_IMAGES } from '@/features/mistakes/lib/imageInput';
import { checkPhotoClarity, clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { PhotoReview } from '@/features/mistakes/components/PhotoReview';
import { ScreenshotSuggestBar } from '@/features/mistakes/components/wrong-detail/ScreenshotSuggestBar';
import { BurstCameraModal } from '@/features/mistakes/components/wrong-detail/BurstCameraModal';
import { useTurnstile } from '@/features/mistakes/hooks/useTurnstile';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { normalizeQuestionList, parseQuestionList, PART_NUMBERS, questionsOfPart, wrongQuestionsByPart, type PartNumber } from '@/shared/domain/questionNumbers';
import { triggerHaptic } from '@/shared/lib/haptics';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { requestAISignIn } from '@/shared/lib/aiSignIn';
import type { ResultImageTiming } from '@/shared/types';
import { createResultScoreDraft, ResultScoreReview, tryAutoApplyResultScores, type AppliedResultScore, type ResultScoreStore } from './ResultScoreReview';
import { useWrongNumberDraft, type WrongNumberDraft } from '../lib/wrongNumberDraft';

const listening = (part: PartNumber) => part <= 4;

/** Tap the questions answered wrong, one Part at a time; or type the numbers ("3 15 101-104"). */
export function WrongQuestionGrid({ wrong, onChange, onScores, onScoresPending, scoreStore, numberDraft, onNumberDraft, onTiming, appliedScore, estimatedScore, onRevertScore, initialFiles, onInitialFilesHandled, phone, testName }: { /** Phone logger: after Sóc reads a photo the grid collapses to a result card; "Sửa" opens it in a sheet. */ phone?: { read: boolean; onRead: () => void }; testName?: string; wrong: number[]; onChange: (wrong: number[]) => void; onScores?: (score: AppliedResultScore) => void; onScoresPending?: (pending: boolean) => void; scoreStore?: ResultScoreStore; numberDraft?: WrongNumberDraft; onNumberDraft?: (value: WrongNumberDraft) => void; onTiming?: (value: ResultImageTiming) => void; appliedScore?: { listening?: string; reading?: string; total?: string }; estimatedScore?: { listening?: string; reading?: string; total?: string }; onRevertScore?: () => void; initialFiles?: File[]; onInitialFilesHandled?: () => void }) {
  const [part, setPart] = useState<PartNumber>(1);
  const { typing, text, setText, setTyping, open: openNumbers, cancel: cancelNumbers } = useWrongNumberDraft(wrong, numberDraft, onNumberDraft);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const byPart = wrongQuestionsByPart(wrong);
  const marked = new Set(wrong);
  const toggle = (question: number) => {
    triggerHaptic(6);
    onChange(marked.has(question) ? wrong.filter(item => item !== question) : [...wrong, question].sort((a, b) => a - b));
  };
  const applyTyped = () => {
    const parsed = parseQuestionList(text);
    setInvalid(parsed.invalid);
    if (!parsed.invalid.length) { onChange(parsed.questions); setTyping(false); }
  };

  const gridBody = (
    <>
      <p className="text-[14.5px] font-black text-[var(--rd-ink)]">Chạm vào câu bạn làm sai</p>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Part">
        {PART_NUMBERS.map(item => {
          const on = item === part, count = byPart[item].length;
          return (
            <button key={item} type="button" aria-pressed={on} aria-label={`Part ${item}${count ? `, ${count} câu sai` : ''}`} onClick={() => setPart(item)}
              className="flex cursor-pointer flex-col items-center gap-0.5">
              <span className={'flex h-9 w-full items-center justify-center rounded-[10px] border-2 text-[13px] font-black ' + (on
                ? (listening(item) ? 'border-[var(--rd-line)] bg-[var(--rd-violet-d)] text-white' : 'border-[var(--rd-line)] bg-[var(--rd-teal)] text-white') + ''
                : 'border-[var(--rd-line)] bg-white text-[#5c675f]')}>P{item}</span>
              <span className="h-4 text-[11px] font-black tabular-nums text-[var(--rd-pink-d)]" aria-hidden="true">{count ? `${count} sai` : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label={`Câu sai Part ${part}`}>
        {questionsOfPart(part).map(question => {
          const on = marked.has(question);
          return (
            <button key={question} type="button" aria-pressed={on} aria-label={`Câu ${question}`} onClick={() => toggle(question)}
              className={'h-11 cursor-pointer rounded-[10px] border-2 text-[14px] font-black tabular-nums active:scale-90 transition-transform duration-75 ' + (on
                ? 'border-[var(--rd-line)] bg-[var(--rd-pink)] text-white'
                : 'border-[var(--rd-line)] bg-white text-[#5c675f]')}>{question}</button>
          );
        })}
      </div>
      {typing
        ? <div className="space-y-2">
            <label className="block text-[13px] font-bold text-[#5c675f]">Số câu sai
              <input aria-label="Số câu sai" autoFocus type="text" value={text} onChange={event => { setText(event.target.value); setInvalid([]); }} placeholder="3 15 22 101-104"
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyTyped(); } }}
                className="mt-1 h-12 w-full rounded-xl border-2 border-[var(--rd-line)] bg-white px-3 font-bold tabular-nums text-[var(--rd-ink)]" />
            </label>
            {invalid.length > 0 && <p role="alert" className="text-[13px] font-semibold text-[var(--rd-pink-d)]">Không đọc được: {invalid.join(', ')}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={applyTyped} className="min-h-11 flex-1 cursor-pointer rounded-xl border-2 border-[var(--rd-line)] bg-white text-[14px] font-black text-[var(--rd-ink)]">Áp dụng</button>
              <button type="button" onClick={() => { cancelNumbers(); setInvalid([]); }} className="min-h-11 cursor-pointer px-3 text-[14px] font-bold text-[var(--rd-mut)]">Hủy</button>
            </div>
          </div>
        : <button
            type="button"
            aria-label="Gõ số câu thay vì chạm"
            onClick={openNumbers}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--rd-line)] bg-[var(--rd-soft)] px-4 py-2.5 text-[13.5px] font-bold text-[#5c675f] transition-all hover:border-[var(--rd-line)] hover:bg-[var(--rd-soft)] hover:text-[var(--rd-ink)]"
          >
            <span aria-hidden="true" className="text-base">⌨️</span>
            <span>Gõ số câu thay vì chạm</span>
          </button>}
    </>
  );
  const cardScore = appliedScore?.total ? appliedScore : estimatedScore;
  const readCard = phone?.read ? (
    <>
      <section className="pl-read" aria-label="Kết quả Sóc đọc">
        <Soc state="yay" size={64} className="pl-read-soc" />
        <small>{testName || 'Đề'}</small>
        <div className="pl-read-score">
          <b>{cardScore?.total || '—'}</b>
          {cardScore?.listening && cardScore?.reading && <span>Nghe {cardScore.listening} · Đọc {cardScore.reading}{!appliedScore?.total ? ' (ước tính)' : ''}</span>}
        </div>
        <div className="pl-read-wrong">
          <div className="pl-read-wrong-h">
            <span>{wrong.length ? `Sai ${wrong.length} câu` : 'Không có câu sai'}</span>
            <button type="button" className="pl-read-edit" onClick={() => setEditOpen(true)}>Sửa</button>
          </div>
          {wrong.length > 0 && <div className="pl-read-nums">
            {wrong.slice(0, 8).map(number => <i key={number}>{number}</i>)}
            {wrong.length > 8 && <i>+{wrong.length - 8}</i>}
          </div>}
        </div>
      </section>
      <p className="pl-read-line" role="status">Sóc đã đọc ảnh — kiểm tra lại nhé</p>
    </>
  ) : null;

  return (
    <div className="space-y-3">
      <ResultImageButton marks={wrong} phone={Boolean(phone)} compactPhone={Boolean(phone?.read)} phoneCard={readCard} onTiming={onTiming} onScores={onScores} onScoresPending={onScoresPending} scoreStore={scoreStore} appliedScore={appliedScore} onRevertScore={onRevertScore} initialFiles={initialFiles} onInitialFilesHandled={onInitialFilesHandled} onRead={numbers => {
        // Marks from the screenshot are added to any taps; the grid opens on the first marked Part.
        const merged = normalizeQuestionList([...wrong, ...numbers]);
        onChange(merged);
        phone?.onRead();
        if (numbers.length) setPart(PART_NUMBERS.find(item => questionsOfPart(item).includes(Math.min(...numbers))) ?? 1);
      }} />
      {phone?.read ? null : gridBody}
      {phone?.read && editOpen && (
        <PhoneSheet title="Sửa câu sai" onClose={() => setEditOpen(false)}>
          <div className="pl-edit-grid">
            {gridBody}
            <button type="button" className="pl-save pl-save--green pl-save--sheet" onClick={() => setEditOpen(false)}>Xong</button>
          </div>
        </PhoneSheet>
      )}
    </div>
  );
}

/**
 * Optional: a screenshot of the test's result page lets AI mark the wrong and skipped questions on the grid.
 * Shown only when the backend offers it; the learner checks the marks before saving.
 */
export function ResultImageButton({
  onRead,
  marks,
  desktop = false,
  onScores,
  onScoresPending,
  scoreStore,
  extraButton,
  scoreCard,
  isTyping = false,
  typingContent,
  timingContent,
  appliedScore,
  onRevertScore,
  onTiming,
  initialFiles,
  onInitialFilesHandled,
  dropzone = false,
  extraMenu,
  compactDrop = false,
  flatCard = false,
  pasteEnabled = true,
  phone = false,
  compactPhone = false,
  phoneCard
}: {
  onRead: (numbers: number[]) => void;
  marks: number[];
  desktop?: boolean;
  /** Computer AI-first view: one large paste/drop area instead of two small buttons. */
  dropzone?: boolean;
  /** Ghi điểm desktop: extra "Cách khác" items (e.g. Tự chọn câu sai). */
  extraMenu?: Array<{ key: string; label: string; pressed?: boolean; disabled?: boolean; onClick: () => void }>;
  /** With a summary on screen the drop area shrinks to one line so the next actions stay in view. */
  compactDrop?: boolean;
  /** Summary supplies its own frame; no score-entry rows are added under it. */
  flatCard?: boolean;
  /** Ctrl+V anywhere reads an image (off while a view without the drop area is shown). */
  pasteEnabled?: boolean;
  /** Phone logger: no long instruction paragraph, no "AI đã tô" line (the read card says it). */
  phone?: boolean;
  /** Phone, after Sóc read a photo: only `phoneCard` and a "Cách khác" link stay; every other photo option moves into that sheet. */
  compactPhone?: boolean;
  phoneCard?: ReactNode;
  onScores?: (score: AppliedResultScore) => void;
  onScoresPending?: (pending: boolean) => void;
  scoreStore?: ResultScoreStore;
  extraButton?: React.ReactNode;
  scoreCard?: React.ReactNode | ((api: { editScore: () => void }) => React.ReactNode);
  isTyping?: boolean;
  typingContent?: React.ReactNode;
  timingContent?: React.ReactNode;
  appliedScore?: { listening?: string; reading?: string; total?: string };
  onRevertScore?: () => void;
  onTiming?: (value: ResultImageTiming) => void;
  initialFiles?: File[];
  onInitialFilesHandled?: () => void;
}) {
  const [available, setAvailable] = useState(true);
  // Reading images needs a Google sign-in when AI access is managed: say so up front instead of failing after a paste.
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [multiStage, setMultiStage] = useState(false);
  const [staged, setStaged] = useState<Array<{ id: string; file: File; url: string; clarity: ClarityResult | null }>>([]);
  const [editingStagedId, setEditingStagedId] = useState<string | null>(null);
  const [burstOpen, setBurstOpen] = useState(false);
  const [clarityWarn, setClarityWarn] = useState<{ text: string; file: File } | null>(null);
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [scoreReview, setScoreReviewState] = useState<aiService.ResultImageScores | null>(() => scoreStore?.current?.scores ?? null);
  const [scoreOpen, setScoreOpen] = useState(Boolean(scoreStore?.current));
  const setScoreReview = (value: aiService.ResultImageScores | null) => { setScoreReviewState(value); setScoreOpen(Boolean(value)); };
  const [scoreVersion, setScoreVersion] = useState(0);
  const scoreEdited = useRef(scoreStore?.current?.edited ?? false);
  const lastImageScores = useRef<aiService.ResultImageScores | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  /** On the phone read view these blocks live in the "Cách khác" sheet; elsewhere they stay where they are. */
  const place = (node: ReactNode): ReactNode => {
    if (!compactPhone) return node;
    if (!moreOpen || !slot) return null;
    return createPortal(
      <div className="pl-more-items" onClick={event => { const button = (event.target as HTMLElement).closest('button'); if (button && !button.hasAttribute('aria-pressed')) setMoreOpen(false); }}>{node}</div>,
      slot
    );
  };
  const { containerRef, getToken, remove } = useTurnstile();
  const lifecycle = useRef(0);
  const running = useRef(false);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  const previousMarks = useRef(new Set(marks));
  const manualEdits = useRef(new Map<number, boolean>());
  const currentMarks = new Set(marks);
  if (running.current) {
    for (const number of new Set([...previousMarks.current, ...currentMarks])) {
      if (previousMarks.current.has(number) !== currentMarks.has(number)) manualEdits.current.set(number, currentMarks.has(number));
    }
  }
  previousMarks.current = currentMarks;
  const latestOnRead = useRef(onRead);
  latestOnRead.current = onRead;
  useEffect(() => () => {
    lifecycle.current += 1;
    running.current = false;
    stagedRef.current.forEach(item => { try { URL.revokeObjectURL(item.url); } catch { /* noop */ } });
  }, []);
  const clearStaged = () => {
    stagedRef.current.forEach(item => { try { URL.revokeObjectURL(item.url); } catch { /* noop */ } });
    setStaged([]);
    setEditingStagedId(null);
  };
  const addStaged = (files: File[]) => {
    const imgs = files.filter(file => file.type.startsWith('image/'));
    if (!imgs.length) return;
    const room = MAX_RESULT_IMAGES - stagedRef.current.length;
    if (room <= 0) { setError(`Mỗi lần chọn tối đa ${MAX_RESULT_IMAGES} ảnh.`); return; }
    const accepted = imgs.slice(0, room);
    const created = accepted.map(file => ({
      id: generateUUID(),
      file,
      url: URL.createObjectURL(file),
      clarity: null as ClarityResult | null
    }));
    setError(imgs.length > accepted.length ? `Đã thêm ${accepted.length} ảnh (tối đa ${MAX_RESULT_IMAGES} ảnh mỗi lần).` : '');
    setStaged(prev => [...prev, ...created]);
    const gen = lifecycle.current;
    created.forEach(entry => {
      void fileExifOrientation(entry.file).then(orientation => {
        if (lifecycle.current === gen && orientation !== 1) setPhotoMode(true);
      });
      void checkPhotoClarity(entry.url).then(result => {
        if (lifecycle.current !== gen) return;
        setStaged(prev => prev.map(item => item.id === entry.id ? { ...item, clarity: result } : item));
        if (result?.problem) setPhotoMode(true);
      });
    });
  };
  const removeStaged = (id: string) => {
    setStaged(prev => {
      const target = prev.find(item => item.id === id);
      if (target) { try { URL.revokeObjectURL(target.url); } catch { /* noop */ } }
      return prev.filter(item => item.id !== id);
    });
  };
  const moveStaged = (id: string, delta: -1 | 1) => {
    setStaged(prev => {
      const idx = prev.findIndex(item => item.id === id);
      const nextIdx = idx + delta;
      if (idx < 0 || nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, moved);
      return copy;
    });
  };
  const replaceStagedFile = (id: string, nextFile: File) => {
    const nextUrl = URL.createObjectURL(nextFile);
    setStaged(prev => prev.map(item => {
      if (item.id !== id) return item;
      try { URL.revokeObjectURL(item.url); } catch { /* noop */ }
      return { ...item, file: nextFile, url: nextUrl, clarity: null };
    }));
    const gen = lifecycle.current;
    void checkPhotoClarity(nextUrl).then(result => {
      if (lifecycle.current !== gen) return;
      setStaged(prev => prev.map(item => item.id === id ? { ...item, clarity: result } : item));
    });
  };
  const stagingActive = photoMode || multiStage || staged.length > 0;
  useEffect(() => {
    let cancelled = false;
    void aiService.getAIConfiguration().then(config => {
      if (cancelled) return;
      setAvailable(config.resultImages !== false);
      setNeedsSignIn(Boolean(config.managedAccess) && !getActiveAccountId());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const read = async (files: File[], overridePhotoMode?: boolean, clearTrayOnSuccess = false) => {
    if (running.current || !files.length) return;
    if (files.length > MAX_RESULT_IMAGES) { setError(`Mỗi lần chọn tối đa ${MAX_RESULT_IMAGES} ảnh.`); return; }
    const generation = ++lifecycle.current;
    const owner = getActiveAccountId();
    const isCurrent = () => lifecycle.current === generation && getActiveAccountId() === owner;
    running.current = true;
    manualEdits.current.clear();
    setBusy(true); setError(''); setNote(''); setClarityWarn(null);
    let usePaperMode = overridePhotoMode ?? photoMode;
    try {
      for (const file of files) {
        if ((await fileExifOrientation(file)) !== 1) {
          usePaperMode = true;
          if (isCurrent()) setPhotoMode(true);
          break;
        }
      }
      const images = await prepareResultImages(files);
      if (!isCurrent()) return;
      // Non-blocking on-device clarity check so blurred/dark paper sheets can be cropped/retaken if needed.
      for (let i = 0; i < images.length; i += 1) {
        const reading = await checkPhotoClarity(images[i].dataUrl);
        if (reading?.problem && isCurrent()) {
          usePaperMode = true;
          setPhotoMode(true);
          const msg = clarityMessage(i + 1, reading.problem);
          setClarityWarn({ text: `${msg.head}${msg.rest}`, file: files[i] });
          break;
        }
      }
      if (!isCurrent()) return;
      const result = await aiService.readResultsWithAI(images, getToken, owner, isCurrent, usePaperMode ? { photoMode: true } : undefined);
      if (!isCurrent()) return;
      if (clearTrayOnSuccess) clearStaged();
      const imported = normalizeQuestionList([...result.wrong, ...result.skipped].filter(number => manualEdits.current.get(number) !== false));
      const count = imported.length;
      const skippedCount = result.skipped.filter(number => imported.includes(number)).length;
      // Read the latest callback: the learner may have changed marks while AI was running.
      latestOnRead.current(imported);
      if (result.timing) onTiming?.(result.timing);
      if (result.scores && Object.values(result.scores).some(value => value !== null) && !scoreEdited.current) {
        lastImageScores.current = result.scores;
        const autoApplied = tryAutoApplyResultScores(result.scores);
        if (autoApplied) {
          if (scoreStore) scoreStore.current = null;
          setScoreReview(null);
          setScoreVersion(value => value + 1);
          onScoresPending?.(false);
          onScores?.(autoApplied);
        } else {
          if (scoreStore) scoreStore.current = createResultScoreDraft(result.scores);
          setScoreReview(result.scores);
          setScoreVersion(value => value + 1);
          onScoresPending?.(false);
        }
      }
      // Paste view: the grid is hidden and the summary table already shows the count, so only the empty case needs a line.
      setNote(phone ? '' : dropzone
        ?(count ? '' : 'Không thấy câu sai nào trong ảnh. Thử ảnh khác hoặc bấm Nhập tay.')
        : count ? `AI đã tô ${count} câu${skippedCount ? ` (${skippedCount} câu bỏ trống)` : ''}. Kiểm tra lại trên lưới.`
          : 'Không thấy câu sai nào trong ảnh. Chạm vào các câu sai bên dưới.');
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Chạm vào các câu sai bên dưới.');
    } finally {
      if (lifecycle.current === generation) { running.current = false; setBusy(false); remove(); }
    }
  };
  const handleIncomingFiles = (files: File[]) => {
    if (!files.length) return;
    if (stagingActive) {
      addStaged(files);
      return;
    }
    void read(files);
  };
  const latestHandleIncoming = useRef(handleIncomingFiles);
  latestHandleIncoming.current = handleIncomingFiles;
  const latestRead = useRef(read);
  latestRead.current = read;
  useEffect(() => {
    if (!available || !initialFiles?.length || running.current) return;
    const files = initialFiles;
    onInitialFilesHandled?.();
    void latestRead.current(files);
  }, [available, initialFiles, onInitialFilesHandled]);
  // On a computer the screenshot can be pasted with Ctrl+V anywhere in the form, not only on the button.
  useEffect(() => {
    if (!desktop || !available || !pasteEnabled || busy || needsSignIn || isTyping || Boolean(editingStagedId) || Boolean(reviewFile)) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); latestHandleIncoming.current(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [desktop, available, pasteEnabled, busy, needsSignIn, isTyping, editingStagedId, reviewFile]);
  if (!available) return null;
  const editingStaged = editingStagedId ? staged.find(item => item.id === editingStagedId) ?? null : null;
  const openEditAppliedScore = () => {
    triggerHaptic(6);
    const draftScores = lastImageScores.current ?? {
      listening: appliedScore?.listening ? Number(appliedScore.listening) : null,
      reading: appliedScore?.reading ? Number(appliedScore.reading) : null,
      total: appliedScore?.total ? Number(appliedScore.total) : null,
    };
    if (scoreStore) scoreStore.current = createResultScoreDraft(draftScores);
    setScoreReview(draftScores);
    onScoresPending?.(true);
  };
  const hasAppliedScore = Boolean(appliedScore && (appliedScore.total || (appliedScore.listening && appliedScore.reading)));
  return (
    <div
      onPaste={desktop ? undefined : event => { const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); handleIncomingFiles(files); } }}
      onDragOver={event => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); }}
      onDrop={event => { const files = [...(event.dataTransfer?.files ?? [])].filter(file => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); handleIncomingFiles(files); } }}
    >
      {/* Unified Score Card (if provided on desktop) */}
      {scoreCard && (
        <div className={flatCard ? 'mb-2.5' : 'rounded-[20px] border-2 border-[var(--rd-line)] bg-[#FFFDF7] p-3.5 text-center shadow-[0_3px_0_var(--rd-line)] mb-2.5'} aria-live="polite">
          {typeof scoreCard === 'function' ? scoreCard({ editScore: openEditAppliedScore }) : scoreCard}
          {onScores && flatCard && scoreReview && (
            <button type="button" disabled={busy} onClick={() => { triggerHaptic(4); setScoreOpen(true); }}
              className="mt-2 flex min-h-9 w-full cursor-pointer items-center justify-between rounded-xl border-2 border-[var(--rd-line)] bg-white px-3 text-[13px] font-black text-[var(--rd-ink)]">
              <span>Điểm từ đề: {scoreOpen ? 'đang mở hộp thoại' : 'cần kiểm tra'}</span>
              <span className="text-[12px] font-bold text-[var(--rd-violet-d)]" aria-hidden="true">Kiểm tra ›</span>
            </button>
          )}
          {onScores && !flatCard && (
            <div className="mt-2.5 pt-2 border-t border-[var(--rd-line)] space-y-1.5">
              {scoreReview ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { triggerHaptic(4); setScoreOpen(true); }}
                  className="flex min-h-8 w-full cursor-pointer items-center justify-between rounded-lg bg-[var(--rd-gold-l)] px-2.5 py-1 text-xs font-black text-[#8a6a10] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="animate-pulse">📄</span>
                    <span>Điểm từ đề: {scoreOpen ? 'Đang mở hộp thoại' : 'Cần kiểm tra'}</span>
                  </span>
                  <span className="text-[11px] font-bold text-[#8a6a10]" aria-hidden="true">Kiểm tra ›</span>
                </button>
              ) : hasAppliedScore ? (
                <div className="flex w-full items-center justify-between py-0.5 text-xs font-black">
                  <span className="flex items-center gap-1.5 text-[#8a6a10]">
                    <span aria-hidden="true">📄</span>
                    <span>Điểm từ đề thi</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={openEditAppliedScore}
                      className="cursor-pointer rounded-md bg-[var(--rd-gold-l)] px-2 py-0.5 text-[10.5px] font-bold text-[#8a6a10] hover:bg-[var(--rd-gold-l)] transition-colors"
                      title="Chỉnh sửa điểm từ đề"
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(6);
                        lastImageScores.current = null;
                        scoreEdited.current = false;
                        onRevertScore?.();
                      }}
                      className="cursor-pointer rounded-md bg-[var(--rd-soft)] px-1.5 py-0.5 text-[10.5px] font-bold text-[var(--rd-mut)] hover:bg-[var(--rd-pink-l)] hover:text-[var(--rd-pink-d)] transition-colors"
                      title="Bỏ điểm từ đề, dùng điểm ước tính"
                    >
                      ✕ Bỏ
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    triggerHaptic(6);
                    const empty = { listening: null, reading: null, total: null };
                    if (scoreStore) scoreStore.current = createResultScoreDraft(empty);
                    setScoreReview(empty);
                    onScoresPending?.(true);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between text-xs font-black text-[#5c675f] hover:text-[var(--rd-violet-d)] transition-colors py-0.5"
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="text-[#8a6a10]">📄</span>
                    <span>Điểm từ đề thi</span>
                  </span>
                  <span className="rounded bg-[var(--rd-soft)] px-1.5 py-0.5 text-[10px] text-[#5c675f] font-bold hover:bg-[var(--rd-gold-l)] hover:text-[#8a6a10] transition-colors" aria-hidden="true">
                    + Nhập ›
                  </span>
                </button>
              )}
              {timingContent}
            </div>
          )}
        </div>
      )}

      {/* Review Modal Dialog - Always active when scoreReview is set */}
      {onScores && scoreReview && scoreOpen && (
        <ResultScoreReview
          key={scoreVersion}
          scores={scoreReview}
          disabled={busy}
          draft={scoreStore?.current}
          onDraftChange={value => { if (scoreStore) scoreStore.current = value; }}
          onClose={() => setScoreOpen(false)}
          onApply={score => { lastImageScores.current = null; if (scoreStore) scoreStore.current = null; onScoresPending?.(false); setScoreReview(null); onScores(score); }}
          onDiscard={() => { lastImageScores.current = null; if (scoreStore) scoreStore.current = null; setScoreReview(null); scoreEdited.current = false; onScoresPending?.(false); onRevertScore?.(); }}
          onEdit={() => { scoreEdited.current = true; onScoresPending?.(true); }}
        />
      )}

      {/* Action Area: Either Typing or Buttons */}
      {place(<>
      {isTyping && typingContent ? (
        typingContent
      ) : dropzone && needsSignIn ? (
        <div className="rounded-2xl border-[2.5px] border-dashed border-[var(--rd-line)] bg-[var(--rd-soft)] px-4 py-6 text-center">
          <p className="text-[16px] font-black text-[var(--rd-ink)]">Đọc ảnh tự động cần đăng nhập</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] font-semibold leading-5 text-[#5c675f]">Đăng nhập Google để dán ảnh kết quả và để AI điền điểm, thời gian, câu sai.</p>
          <button type="button" onClick={requestAISignIn}
            className="mt-3 min-h-10 cursor-pointer rounded-xl border-2 border-[var(--rd-line)] bg-[var(--rd-green)] px-4 text-[13.5px] font-black text-white shadow-[0_3px_0_var(--rd-line)] active:translate-x-px active:translate-y-px active:shadow-none">
            Đăng nhập Google
          </button>
        </div>
      ) : dropzone && compactDrop ? (
        busy ? <p className="rdl-compact" role="status">Sóc đang đọc ảnh…</p> : null
      ) : dropzone && busy ? (
        <div className="rdl-read" role="status" aria-live="polite">
          <div className="rdl-thumb" aria-hidden="true">
            {[60, 40, 100, 100, 80, 100, 70, 100, 50, 100, 85].map((w, i) => <i key={i} style={{ width: `${w}%`, marginTop: i === 2 ? 20 : undefined }} />)}
            <div className="rdl-scan" />
          </div>
          <div className="rdl-read-t">
            <Soc state="think" size={96} />
            <b>Sóc đang đọc ảnh</b>
            <p>Vài giây thôi, xong Sóc điền giúp bạn.</p>
            {['Điểm Nghe và Đọc', 'Danh sách câu sai', 'Thời gian làm bài'].map(label => <div key={label} className="rdl-ck"><i aria-hidden="true" />{label}</div>)}
          </div>
        </div>
      ) : dropzone ? (
        <div className="rdl-ai-wrap">
          <div className="rdl-toggles" role="group" aria-label="Tùy chọn đọc ảnh">
            <button type="button" disabled={busy} aria-pressed={photoMode}
              onClick={() => { triggerHaptic(4); setPhotoMode(value => !value); }}
              className={'rdl-pill-sw' + (photoMode ? ' is-on' : '')}>
              <span className="rdl-sw" aria-hidden="true"><i /></span>
              <span>Phiếu tô giấy</span>
            </button>
            {!photoMode && staged.length === 0 && (
              <button type="button" disabled={busy} aria-pressed={multiStage}
                onClick={() => { triggerHaptic(4); setMultiStage(value => !value); }}
                className={'rdl-pill-sw' + (multiStage ? ' is-on' : '')}>
                <span className="rdl-sw" aria-hidden="true"><i /></span>
                <span>Ghép nhiều ảnh</span>
              </button>
            )}
          </div>
          <div role="button" tabIndex={0} className={'rdl-drop' + (dragOver ? ' is-drag' : '')}
            onClick={() => input.current?.click()}
            onDragOver={event => { event.preventDefault(); if (!dragOver) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={event => {
              event.preventDefault();
              setDragOver(false);
              const files = [...event.dataTransfer.files].filter(file => file.type.startsWith('image/'));
              if (files.length) handleIncomingFiles(files);
            }}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.current?.click(); } }}
            aria-label="Dán ảnh kết quả: bấm Ctrl V, kéo ảnh vào, hoặc bấm để chọn tệp">
            <Soc state="focus" size={116} />
            <div className="rdl-drop-t">
              <b>Chụp trang kết quả</b>
              <span>Sóc đọc điểm và các câu bạn sai, bạn khỏi gõ tay.</span>
              <p className="rdl-drop-hint">{dragOver ? 'Thả ảnh vào đây để Sóc đọc ngay!' : 'Kéo thả ảnh vào đây, dán Ctrl+V hoặc dùng nút bên dưới'}</p>
            </div>
          </div>
        </div>
      ) : desktop && extraButton ? (
        <div className="space-y-2">
          {busy && <button type="button" disabled className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rd-line)] bg-[var(--rd-soft)] px-3 text-xs font-bold text-[#5c675f]"><ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />Đang đọc…</button>}
          <div className="rdg-act-row">
            {extraButton}
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="rdg-act-btn"
            >
              <ImagePlus className="h-4 w-4 shrink-0 text-[var(--rd-pink-d)]" aria-hidden="true" />
              <span>Chọn ảnh</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={desktop
            ? 'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-[var(--rd-line)] bg-white text-[14px] font-black text-[var(--rd-ink)] hover:bg-[var(--rd-violet-l)] disabled:cursor-wait disabled:opacity-60'
            : 'flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-[var(--rd-line)] bg-[var(--rd-violet-l)] text-[14.5px] font-black text-[var(--rd-violet-d)] disabled:cursor-wait disabled:opacity-60'}
        >
          <ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" />
          {busy ? 'AI đang đọc ảnh…' : 'Dán ảnh kết quả'}
          {!desktop && <span className="text-[12px] font-bold text-[var(--rd-violet-d)]">(không bắt buộc)</span>}
        </button>
      )}

      </>)}
      <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Ảnh kết quả"
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; handleIncomingFiles(files); }} />
      {compactPhone && (
        <>
          {phoneCard}
          {busy && <p role="status" className="pl-reading">Sóc đang đọc ảnh…</p>}
          <button type="button" className="pl-more" onClick={() => setMoreOpen(true)}>Cách khác ›</button>
          {moreOpen && <PhoneSheet title="Cách khác" onClose={() => setMoreOpen(false)}><div ref={setSlot} className="pl-more-slot" /></PhoneSheet>}
        </>
      )}
      {place(<>{!isTyping && !needsSignIn && (!desktop || clarityWarn) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!desktop && <button
            type="button"
            disabled={busy}
            aria-pressed={photoMode}
            onClick={() => { triggerHaptic(4); setPhotoMode(value => !value); }}
            className={'inline-flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-extrabold transition-colors ' + (photoMode
              ? 'border-[var(--rd-pink)] bg-[var(--rd-pink-l)] text-[var(--rd-pink-d)]'
              : 'border-[var(--rd-line)] bg-white text-[#5c675f] hover:bg-[var(--rd-soft)]')}
          >
            <span aria-hidden="true" className={'relative inline-block h-4 w-7 rounded-full transition-colors ' + (photoMode ? 'bg-[var(--rd-pink)]' : 'bg-[#f1f3f1]')}>
              <span className={'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ' + (photoMode ? 'translate-x-3' : '')} />
            </span>
            <span>Phiếu tô giấy</span>
          </button>}
          {!desktop && (
            <button
              type="button"
              disabled={busy || staged.length >= MAX_RESULT_IMAGES}
              onClick={() => { triggerHaptic(6); setBurstOpen(true); }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--rd-pink)] bg-[var(--rd-pink-l)] px-3 py-1 text-[12px] font-extrabold text-[var(--rd-pink-d)] hover:bg-[var(--rd-pink-l)] disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Chụp phiếu giấy liên tiếp</span>
            </button>
          )}
          {clarityWarn && !staged.length && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setReviewFile(clarityWarn.file)}
              className="cursor-pointer rounded-lg bg-[var(--rd-gold-l)] px-2.5 py-1 text-[11.5px] font-bold text-[#8a6a10] hover:bg-[var(--rd-gold-l)]"
            >
              {clarityWarn.text} Chỉnh / cắt đọc lại
            </button>
          )}
        </div>
      )}</>)}
      {!isTyping && !needsSignIn && stagingActive && (
        <div className="mt-2.5 rounded-2xl border-2 border-dashed border-[var(--rd-pink)] bg-[var(--rd-pink-l)] p-3" aria-label="Khay ảnh chờ đọc">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-black text-[var(--rd-ink)]">
              {photoMode ? 'Khay ảnh Phiếu tô + Bảng đáp án' : 'Khay ghép nhiều ảnh kết quả'} ({staged.length}/{MAX_RESULT_IMAGES})
            </span>
            {staged.length > 0 && (
              <button type="button" disabled={busy} onClick={clearStaged} className="cursor-pointer text-[12px] font-bold text-[var(--rd-mut)] hover:text-[var(--rd-pink-d)]">
                Xóa hết
              </button>
            )}
          </div>
          {staged.length === 0 ? (
            <p className="mt-1 text-[12px] font-semibold text-[#5c675f]">
              {photoMode
                ? 'Thêm đủ ảnh Phiếu tô và Bảng đáp án trước, rồi bấm Đọc để Sóc tự dò đáp án trong 1 lượt.'
                : 'Dán hoặc chọn thêm nhiều ảnh kết quả (VD: ảnh điểm + ảnh danh sách câu sai), rồi bấm Đọc cùng lúc.'}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {staged.map((item, idx) => (
                <span key={item.id} className="relative h-16 w-14 flex-none overflow-hidden rounded-lg bg-white shadow-sm ring-2 ring-[var(--rd-pink)]">
                  <img
                    src={item.url}
                    alt={`Ảnh chờ đọc ${idx + 1}`}
                    onClick={() => { if (!busy) setEditingStagedId(item.id); }}
                    className="h-full w-full cursor-pointer object-cover object-top"
                    title="Bấm để xem to, xoay hoặc cắt ảnh"
                  />
                  {item.clarity?.problem && (
                    <span className="pointer-events-none absolute top-0.5 left-0.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--rd-gold)] text-[10px] font-black text-[#8a6a10]" aria-label="Ảnh hơi tối hoặc mờ">!</span>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Bỏ ảnh ${idx + 1}`}
                    onClick={() => removeStaged(item.id)}
                    className="absolute top-0.5 right-0.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-[var(--rd-ink)] text-[11px] font-black text-white"
                  >×</button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Chỉnh ảnh ${idx + 1}`}
                    onClick={() => setEditingStagedId(item.id)}
                    className="absolute right-0.5 bottom-0.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-[var(--rd-pink)] text-[10px] font-black text-white"
                  >✎</button>
                  {staged.length > 1 && (
                    <span className="absolute bottom-0.5 left-0.5 flex gap-0.5">
                      {idx > 0 && (
                        <button type="button" disabled={busy} aria-label={`Đưa ảnh ${idx + 1} lên trước`} onClick={() => moveStaged(item.id, -1)}
                          className="grid h-4 w-3.5 cursor-pointer place-items-center rounded bg-[var(--rd-ink)] text-[11px] font-black text-white">‹</button>
                      )}
                      {idx < staged.length - 1 && (
                        <button type="button" disabled={busy} aria-label={`Đưa ảnh ${idx + 1} ra sau`} onClick={() => moveStaged(item.id, 1)}
                          className="grid h-4 w-3.5 cursor-pointer place-items-center rounded bg-[var(--rd-ink)] text-[11px] font-black text-white">›</button>
                      )}
                    </span>
                  )}
                </span>
              ))}
              {staged.length < MAX_RESULT_IMAGES && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                  aria-label="Thêm ảnh vào khay kết quả"
                  className="grid h-16 w-14 flex-none cursor-pointer place-items-center rounded-lg border-2 border-dashed border-[var(--rd-pink)] bg-white/80 text-[var(--rd-pink-d)] hover:bg-[var(--rd-pink-l)]"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {staged.length === 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--rd-pink)] bg-white px-3 text-[12.5px] font-extrabold text-[var(--rd-pink-d)] hover:bg-[var(--rd-pink-l)]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Chọn ảnh</span>
              </button>
            )}
            {staged.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void read(staged.map(item => item.file), photoMode, true)}
                className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[var(--rd-pink)] px-4 text-[13.5px] font-black text-white shadow-sm hover:bg-[var(--rd-pink)] disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{busy ? 'Sóc đang đọc ảnh…' : `Đọc ${staged.length} ảnh kết quả`}</span>
              </button>
            )}
          </div>
        </div>
      )}
      {desktop && !isTyping && !needsSignIn && dropzone && (
        <>
          {compactDrop && (
            <div className="rdl-toggles mt-2.5" role="group" aria-label="Tùy chọn đọc ảnh">
              <button type="button" disabled={busy} aria-pressed={photoMode}
                onClick={() => { triggerHaptic(4); setPhotoMode(value => !value); }}
                className={'rdl-pill-sw' + (photoMode ? ' is-on' : '')}>
                <span className="rdl-sw" aria-hidden="true"><i /></span>
                <span>Phiếu tô giấy</span>
              </button>
              <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rdl-pill-sw">
                <ImagePlus className="h-3.5 w-3.5 text-[var(--rd-pink-d)]" aria-hidden="true" />
                <span>Chọn ảnh khác</span>
              </button>
            </div>
          )}
          <ScreenshotSuggestBar
            enabled={desktop && !isTyping && !needsSignIn}
            disabled={busy}
            quick
            onPick={() => input.current?.click()}
            addVerb="kết quả"
            maxAdd={stagingActive ? Math.max(0, MAX_RESULT_IMAGES - staged.length) : MAX_RESULT_IMAGES}
            onAddFiles={picked => handleIncomingFiles(picked)}
          />
          {extraMenu && extraMenu.length > 0 && (
            <div className="rdl-alt-bar" role="group" aria-label="Cách nhập khác">
              <span className="rdl-alt-lbl">Hoặc tự nhập:</span>
              <div className="rdl-alt-btns">
                {extraMenu.map((item, idx) => (
                  <button key={item.key} type="button" disabled={item.disabled}
                    className={'rdl-alt-btn' + (idx === 0 ? ' is-main' : '')}
                    onClick={item.onClick}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {desktop && !isTyping && !needsSignIn && !dropzone && (
        <div className="rdg-tools" role="group" aria-label="Tùy chọn bổ sung">
          <button type="button" disabled={busy} aria-pressed={photoMode}
            onClick={() => { triggerHaptic(4); setPhotoMode(value => !value); }}
            className={'rdg-tool-sw' + (photoMode ? ' is-on' : '')}>
            <span>Phiếu tô giấy</span>
            <span className="rdl-sw" aria-hidden="true"><i /></span>
          </button>
          {(extraMenu ?? []).filter(item => item.pressed !== undefined).map(item => (
            <button key={item.key} type="button" disabled={item.disabled} aria-pressed={item.pressed}
              onClick={item.onClick}
              className={'rdg-tool-sw' + (item.pressed ? ' is-on' : '')}>
              <span>{item.label}</span>
              <span className="rdl-sw" aria-hidden="true"><i /></span>
            </button>
          ))}
          {(extraMenu ?? []).some(item => item.pressed === undefined) && (
            <div className="rdg-modes">
              {(extraMenu ?? []).filter(item => item.pressed === undefined).map(item => (
                <button key={item.key} type="button" disabled={item.disabled} onClick={item.onClick} className="rdg-mode-btn">
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!phone && <p className={'mt-2 text-xs leading-5 text-[var(--rd-mut)]' + (compactDrop || dropzone || (desktop && extraButton && !dropzone) ? ' hidden' : '')}>Chụp rõ điểm, thời gian đã làm và câu sai (hoặc gửi chung Phiếu tô + Bảng đáp án để Sóc tự chấm). Có thể thêm nhiều ảnh, không cần chụp gộp.</p>}
      {note && <p role="status" className="mt-1.5 text-[13px] font-bold text-[var(--rd-violet-d)]">{note}</p>}
      {error && <p role="alert" className="mt-1.5 text-[13px] font-semibold text-[var(--rd-pink-d)]">{error}</p>}
      {editingStaged && (
        <PhotoReview
          file={editingStaged.file}
          photoMode={photoMode}
          onClose={() => setEditingStagedId(null)}
          onApply={({ file: nextFile, photoMode: nextPhotoMode, changed }) => {
            setPhotoMode(nextPhotoMode);
            if (changed) replaceStagedFile(editingStaged.id, nextFile);
            setEditingStagedId(null);
          }}
        />
      )}
      {!editingStaged && reviewFile && (
        <PhotoReview
          file={reviewFile}
          photoMode={photoMode}
          onClose={() => setReviewFile(null)}
          onApply={({ file: nextFile, photoMode: nextPhotoMode }) => {
            setPhotoMode(nextPhotoMode);
            setReviewFile(null);
            void read([nextFile], nextPhotoMode);
          }}
        />
      )}
      {burstOpen && (
        <BurstCameraModal
          maxPhotos={Math.max(1, MAX_RESULT_IMAGES - staged.length)}
          title="Chụp phiếu tô & bảng đáp án"
          onClose={() => setBurstOpen(false)}
          onComplete={picked => {
            setBurstOpen(false);
            if (picked.length) {
              setPhotoMode(true);
              addStaged(picked);
            }
          }}
        />
      )}

      {/* Fallback button when scoreCard is not provided (e.g. mobile) */}
      {!scoreCard && scoreReview && !scoreOpen && <button type="button" onClick={() => setScoreOpen(true)}
        className="min-h-11 w-full rounded-xl border border-[var(--rd-gold)] bg-[var(--rd-gold-l)] px-3 text-sm font-bold text-[#8a6a10]">Kiểm tra điểm chưa áp dụng</button>}
      {place(<>
      {!scoreCard && onScores && !scoreReview && hasAppliedScore && (
        <div className="mt-2 flex min-h-9 w-full items-center justify-between rounded-xl border border-[var(--rd-gold)] bg-[var(--rd-gold-l)] px-3 py-1.5 text-xs font-black text-[#8a6a10]">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">📄</span>
            <span>Điểm từ đề thi</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openEditAppliedScore}
              className="cursor-pointer rounded-md bg-[var(--rd-gold-l)] px-2 py-0.5 text-[11px] font-bold text-[#8a6a10] hover:bg-[var(--rd-gold)]"
              title="Chỉnh sửa điểm từ đề"
            >
              ✏️ Sửa
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(6);
                lastImageScores.current = null;
                scoreEdited.current = false;
                onRevertScore?.();
              }}
              className="cursor-pointer rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-[#5c675f] hover:bg-[var(--rd-pink-l)] hover:text-[var(--rd-pink-d)]"
              title="Bỏ điểm từ đề, dùng điểm ước tính"
            >
              ✕ Bỏ
            </button>
          </div>
        </div>
      )}
      {!scoreCard && !dropzone && onScores && !scoreReview && !hasAppliedScore && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            triggerHaptic(6);
            const empty = { listening: null, reading: null, total: null };
            if (scoreStore) scoreStore.current = createResultScoreDraft(empty);
            setScoreReview(empty);
            onScoresPending?.(true);
          }}
          className="mt-2 flex min-h-9 w-full cursor-pointer items-center justify-between rounded-xl border border-dashed border-[var(--rd-line)] bg-[var(--rd-soft)] px-3 py-1.5 text-xs font-bold text-[#5c675f] hover:border-[var(--rd-line)] hover:bg-[var(--rd-soft)] hover:text-[var(--rd-ink)] transition-all disabled:opacity-60"
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">📄</span>
            <span>Nhập điểm từ đề (tùy chọn)</span>
          </span>
          <span className="text-[var(--rd-mut)] font-bold" aria-hidden="true">›</span>
        </button>
      )}
      </>)}
      <div ref={containerRef} aria-label="Xác minh yêu cầu AI" />
    </div>
  );
}
