import { useEffect, useRef, useState } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import { Camera, ImagePlus, Layers, Plus, Sparkles } from 'lucide-react';
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
export function WrongQuestionGrid({ wrong, onChange, onScores, onScoresPending, scoreStore, numberDraft, onNumberDraft, onTiming, appliedScore, onRevertScore, initialFiles, onInitialFilesHandled }: { wrong: number[]; onChange: (wrong: number[]) => void; onScores?: (score: AppliedResultScore) => void; onScoresPending?: (pending: boolean) => void; scoreStore?: ResultScoreStore; numberDraft?: WrongNumberDraft; onNumberDraft?: (value: WrongNumberDraft) => void; onTiming?: (value: ResultImageTiming) => void; appliedScore?: { listening?: string; reading?: string; total?: string }; onRevertScore?: () => void; initialFiles?: File[]; onInitialFilesHandled?: () => void }) {
  const [part, setPart] = useState<PartNumber>(1);
  const { typing, text, setText, setTyping, open: openNumbers, cancel: cancelNumbers } = useWrongNumberDraft(wrong, numberDraft, onNumberDraft);
  const [invalid, setInvalid] = useState<string[]>([]);
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

  return (
    <div className="space-y-3">
      <ResultImageButton marks={wrong} onTiming={onTiming} onScores={onScores} onScoresPending={onScoresPending} scoreStore={scoreStore} appliedScore={appliedScore} onRevertScore={onRevertScore} initialFiles={initialFiles} onInitialFilesHandled={onInitialFilesHandled} onRead={numbers => {
        // Marks from the screenshot are added to any taps; the grid opens on the first marked Part.
        const merged = normalizeQuestionList([...wrong, ...numbers]);
        onChange(merged);
        if (numbers.length) setPart(PART_NUMBERS.find(item => questionsOfPart(item).includes(Math.min(...numbers))) ?? 1);
      }} />
      <p className="text-[14.5px] font-black text-slate-900 dark:text-white">Chạm vào câu bạn làm sai</p>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Part">
        {PART_NUMBERS.map(item => {
          const on = item === part, count = byPart[item].length;
          return (
            <button key={item} type="button" aria-pressed={on} aria-label={`Part ${item}${count ? `, ${count} câu sai` : ''}`} onClick={() => setPart(item)}
              className="flex cursor-pointer flex-col items-center gap-0.5">
              <span className={'flex h-9 w-full items-center justify-center rounded-[10px] border-2 text-[13px] font-black ' + (on
                ? (listening(item) ? 'border-slate-900 bg-indigo-600 text-white' : 'border-slate-900 bg-teal-600 text-white') + ' dark:border-slate-200'
                : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>P{item}</span>
              <span className="h-4 text-[11px] font-black tabular-nums text-rose-600 dark:text-rose-400" aria-hidden="true">{count ? `${count} sai` : ''}</span>
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
                ? 'border-slate-900 bg-rose-600 text-white dark:border-slate-200'
                : 'border-stone-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>{question}</button>
          );
        })}
      </div>
      {typing
        ? <div className="space-y-2">
            <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-200">Số câu sai
              <input aria-label="Số câu sai" autoFocus type="text" value={text} onChange={event => { setText(event.target.value); setInvalid([]); }} placeholder="3 15 22 101-104"
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyTyped(); } }}
                className="mt-1 h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 font-bold tabular-nums text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
            </label>
            {invalid.length > 0 && <p role="alert" className="text-[13px] font-semibold text-rose-700 dark:text-rose-300">Không đọc được: {invalid.join(', ')}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={applyTyped} className="min-h-11 flex-1 cursor-pointer rounded-xl border-2 border-slate-900 bg-white text-[14px] font-black text-slate-950 dark:border-slate-200 dark:bg-slate-900 dark:text-white">Áp dụng</button>
              <button type="button" onClick={() => { cancelNumbers(); setInvalid([]); }} className="min-h-11 cursor-pointer px-3 text-[14px] font-bold text-slate-500 dark:text-slate-400">Hủy</button>
            </div>
          </div>
        : <button
            type="button"
            aria-label="Gõ số câu thay vì chạm"
            onClick={openNumbers}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-2.5 text-[13.5px] font-bold text-slate-700 transition-all hover:border-slate-900 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-400 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true" className="text-base">⌨️</span>
            <span>Gõ số câu thay vì chạm</span>
          </button>}
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
  compactDrop = false,
  flatCard = false,
  pasteEnabled = true
}: {
  onRead: (numbers: number[]) => void;
  marks: number[];
  desktop?: boolean;
  /** Computer AI-first view: one large paste/drop area instead of two small buttons. */
  dropzone?: boolean;
  /** With a summary on screen the drop area shrinks to one line so the next actions stay in view. */
  compactDrop?: boolean;
  /** Summary supplies its own frame; no score-entry rows are added under it. */
  flatCard?: boolean;
  /** Ctrl+V anywhere reads an image (off while a view without the drop area is shown). */
  pasteEnabled?: boolean;
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
      setNote(dropzone
        ? (count ? '' : 'Không thấy câu sai nào trong ảnh. Thử ảnh khác hoặc bấm Nhập tay.')
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
        <div className={flatCard ? 'mb-2.5' : 'rounded-[20px] border-2 border-slate-900 bg-[#FFFDF7] p-3.5 text-center shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1] mb-2.5'} aria-live="polite">
          {typeof scoreCard === 'function' ? scoreCard({ editScore: openEditAppliedScore }) : scoreCard}
          {onScores && flatCard && scoreReview && (
            <button type="button" disabled={busy} onClick={() => { triggerHaptic(4); setScoreOpen(true); }}
              className="mt-2 flex min-h-9 w-full cursor-pointer items-center justify-between rounded-xl border-2 border-slate-900 bg-white px-3 text-[13px] font-black text-slate-950 dark:border-slate-300 dark:bg-slate-900 dark:text-white">
              <span>Điểm từ đề: {scoreOpen ? 'đang mở hộp thoại' : 'cần kiểm tra'}</span>
              <span className="text-[12px] font-bold text-indigo-700 dark:text-indigo-300" aria-hidden="true">Kiểm tra ›</span>
            </button>
          )}
          {onScores && !flatCard && (
            <div className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1.5">
              {scoreReview ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { triggerHaptic(4); setScoreOpen(true); }}
                  className="flex min-h-8 w-full cursor-pointer items-center justify-between rounded-lg bg-amber-100/70 px-2.5 py-1 text-xs font-black text-amber-950 dark:bg-amber-950/50 dark:text-amber-200 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="animate-pulse">📄</span>
                    <span>Điểm từ đề: {scoreOpen ? 'Đang mở hộp thoại' : 'Cần kiểm tra'}</span>
                  </span>
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300" aria-hidden="true">Kiểm tra ›</span>
                </button>
              ) : hasAppliedScore ? (
                <div className="flex w-full items-center justify-between py-0.5 text-xs font-black">
                  <span className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                    <span aria-hidden="true">📄</span>
                    <span>Điểm từ đề thi</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={openEditAppliedScore}
                      className="cursor-pointer rounded-md bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-900 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200 transition-colors"
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
                      className="cursor-pointer rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500 hover:bg-rose-100 hover:text-rose-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-950 dark:hover:text-rose-300 transition-colors"
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
                  className="flex w-full cursor-pointer items-center justify-between text-xs font-black text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors py-0.5"
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="text-amber-500">📄</span>
                    <span>Điểm từ đề thi</span>
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 font-bold dark:bg-slate-800 dark:text-slate-400 hover:bg-amber-50 hover:text-amber-700 transition-colors" aria-hidden="true">
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
      {isTyping && typingContent ? (
        typingContent
      ) : dropzone && needsSignIn ? (
        <div className="rounded-2xl border-[2.5px] border-dashed border-slate-300 bg-slate-100 px-4 py-6 text-center dark:border-slate-600 dark:bg-slate-900/60">
          <p className="text-[16px] font-black text-slate-800 dark:text-slate-100">Đọc ảnh tự động cần đăng nhập</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] font-semibold leading-5 text-slate-600 dark:text-slate-300">Đăng nhập Google để dán ảnh kết quả và để AI điền điểm, thời gian, câu sai.</p>
          <button type="button" onClick={requestAISignIn}
            className="mt-3 min-h-10 cursor-pointer rounded-xl border-2 border-slate-900 bg-blue-600 px-4 text-[13.5px] font-black text-white shadow-[3px_3px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-300 dark:shadow-none">
            Đăng nhập Google
          </button>
        </div>
      ) : dropzone && compactDrop ? (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rdl-compact">
          <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          {busy ? 'Sóc đang đọc ảnh…' : 'Dán ảnh khác: Ctrl + V hoặc thả vào đây'}
        </button>
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
        <div role="button" tabIndex={0} className="rdl-drop" onClick={() => input.current?.click()}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.current?.click(); } }}
          aria-label="Dán ảnh kết quả: bấm Ctrl V, kéo ảnh vào, hoặc bấm để chọn tệp">
          <svg width="56" height="50" viewBox="0 0 56 50" aria-hidden="true"><rect x="4" y="6" width="48" height="38" rx="9" fill="#fff" /><circle cx="19" cy="20" r="5" fill="#ffc83d" /><path d="M8 38 L22 26 L31 33 L39 27 L48 35 V40 H8Z" fill="#46b35a" /></svg>
          <b>Dán ảnh kết quả vào đây</b>
          <span>bấm <span className="rdl-kbd">Ctrl</span> + <span className="rdl-kbd">V</span>, kéo ảnh vào, hoặc bấm để chọn tệp</span>
          <small>Chụp trang có điểm và danh sách câu sai, hoặc gửi chung Phiếu tô + Bảng đáp án để Sóc tự dò.</small>
        </div>
      ) : desktop && extraButton ? (
        <div className="space-y-2">
          {busy && <button type="button" disabled className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"><ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />Đang đọc…</button>}
          {extraButton}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={desktop
            ? 'flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-white text-[14px] font-black text-slate-950 hover:bg-violet-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-300 dark:bg-slate-900 dark:text-white'
            : 'flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-900 bg-violet-100 text-[14.5px] font-black text-violet-950 disabled:cursor-wait disabled:opacity-60 dark:border-violet-300 dark:bg-violet-950 dark:text-white'}
        >
          <ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" />
          {busy ? 'AI đang đọc ảnh…' : 'Dán ảnh kết quả'}
          {!desktop && <span className="text-[12px] font-bold text-violet-700 dark:text-violet-300">(không bắt buộc)</span>}
        </button>
      )}

      <input ref={input} type="file" accept="image/*" multiple hidden aria-label="Ảnh kết quả"
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; handleIncomingFiles(files); }} />
      {!isTyping && !needsSignIn && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            aria-pressed={photoMode}
            onClick={() => { triggerHaptic(4); setPhotoMode(value => !value); }}
            className={'inline-flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-extrabold transition-colors ' + (photoMode
              ? 'border-pink-400 bg-pink-50 text-pink-800 dark:border-pink-500/70 dark:bg-pink-950/60 dark:text-pink-200'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200')}
          >
            <span aria-hidden="true" className={'relative inline-block h-4 w-7 rounded-full transition-colors ' + (photoMode ? 'bg-pink-500' : 'bg-slate-300 dark:bg-slate-600')}>
              <span className={'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ' + (photoMode ? 'translate-x-3' : '')} />
            </span>
            <span>Phiếu tô giấy</span>
          </button>
          {desktop && !photoMode && staged.length === 0 && (
            <button
              type="button"
              disabled={busy}
              aria-pressed={multiStage}
              onClick={() => { triggerHaptic(4); setMultiStage(value => !value); }}
              className={'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-extrabold transition-colors ' + (multiStage
                ? 'border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-500/70 dark:bg-violet-950/60 dark:text-violet-200'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200')}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Ghép nhiều ảnh</span>
            </button>
          )}
          {!desktop && (
            <button
              type="button"
              disabled={busy || staged.length >= MAX_RESULT_IMAGES}
              onClick={() => { triggerHaptic(6); setBurstOpen(true); }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-pink-300 bg-pink-50 px-3 py-1 text-[12px] font-extrabold text-pink-800 hover:bg-pink-100 disabled:opacity-50 dark:border-pink-500/60 dark:bg-pink-950/60 dark:text-pink-200"
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
              className="cursor-pointer rounded-lg bg-amber-100 px-2.5 py-1 text-[11.5px] font-bold text-amber-900 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200"
            >
              {clarityWarn.text} Chỉnh / cắt đọc lại
            </button>
          )}
        </div>
      )}
      {!isTyping && !needsSignIn && stagingActive && (
        <div className="mt-2.5 rounded-2xl border-2 border-dashed border-pink-300 bg-pink-50/60 p-3 dark:border-pink-500/50 dark:bg-pink-950/20" aria-label="Khay ảnh chờ đọc">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-black text-slate-800 dark:text-slate-100">
              {photoMode ? 'Khay ảnh Phiếu tô + Bảng đáp án' : 'Khay ghép nhiều ảnh kết quả'} ({staged.length}/{MAX_RESULT_IMAGES})
            </span>
            {staged.length > 0 && (
              <button type="button" disabled={busy} onClick={clearStaged} className="cursor-pointer text-[12px] font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400">
                Xóa hết
              </button>
            )}
          </div>
          {staged.length === 0 ? (
            <p className="mt-1 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
              {photoMode
                ? 'Thêm đủ ảnh Phiếu tô và Bảng đáp án trước, rồi bấm Đọc để Sóc tự dò đáp án trong 1 lượt.'
                : 'Dán hoặc chọn thêm nhiều ảnh kết quả (VD: ảnh điểm + ảnh danh sách câu sai), rồi bấm Đọc cùng lúc.'}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {staged.map((item, idx) => (
                <span key={item.id} className="relative h-16 w-14 flex-none overflow-hidden rounded-lg bg-white shadow-sm ring-2 ring-pink-200 dark:bg-slate-900 dark:ring-pink-700/60">
                  <img
                    src={item.url}
                    alt={`Ảnh chờ đọc ${idx + 1}`}
                    onClick={() => { if (!busy) setEditingStagedId(item.id); }}
                    className="h-full w-full cursor-pointer object-cover object-top"
                    title="Bấm để xem to, xoay hoặc cắt ảnh"
                  />
                  {item.clarity?.problem && (
                    <span className="pointer-events-none absolute top-0.5 left-0.5 grid h-4 w-4 place-items-center rounded-full bg-amber-400 text-[10px] font-black text-amber-950" aria-label="Ảnh hơi tối hoặc mờ">!</span>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Bỏ ảnh ${idx + 1}`}
                    onClick={() => removeStaged(item.id)}
                    className="absolute top-0.5 right-0.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-slate-900/80 text-[11px] font-black text-white"
                  >×</button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Chỉnh ảnh ${idx + 1}`}
                    onClick={() => setEditingStagedId(item.id)}
                    className="absolute right-0.5 bottom-0.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full bg-pink-600/90 text-[10px] font-black text-white"
                  >✎</button>
                  {staged.length > 1 && (
                    <span className="absolute bottom-0.5 left-0.5 flex gap-0.5">
                      {idx > 0 && (
                        <button type="button" disabled={busy} aria-label={`Đưa ảnh ${idx + 1} lên trước`} onClick={() => moveStaged(item.id, -1)}
                          className="grid h-4 w-3.5 cursor-pointer place-items-center rounded bg-slate-900/75 text-[11px] font-black text-white">‹</button>
                      )}
                      {idx < staged.length - 1 && (
                        <button type="button" disabled={busy} aria-label={`Đưa ảnh ${idx + 1} ra sau`} onClick={() => moveStaged(item.id, 1)}
                          className="grid h-4 w-3.5 cursor-pointer place-items-center rounded bg-slate-900/75 text-[11px] font-black text-white">›</button>
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
                  className="grid h-16 w-14 flex-none cursor-pointer place-items-center rounded-lg border-2 border-dashed border-pink-300 bg-white/80 text-pink-700 hover:bg-pink-100/70 dark:border-pink-600 dark:bg-slate-900/60 dark:text-pink-300"
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
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-pink-300 bg-white px-3 text-[12.5px] font-extrabold text-pink-800 hover:bg-pink-50 dark:border-pink-600 dark:bg-slate-900 dark:text-pink-200"
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
                className="inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-pink-600 px-4 text-[13.5px] font-black text-white shadow-sm hover:bg-pink-700 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{busy ? 'Sóc đang đọc ảnh…' : `Đọc ${staged.length} ảnh kết quả`}</span>
              </button>
            )}
          </div>
        </div>
      )}
      {desktop && !isTyping && !needsSignIn && (
        <ScreenshotSuggestBar
          enabled={desktop && !isTyping && !needsSignIn}
          disabled={busy}
          addVerb="kết quả"
          maxAdd={stagingActive ? Math.max(0, MAX_RESULT_IMAGES - staged.length) : MAX_RESULT_IMAGES}
          onAddFiles={picked => handleIncomingFiles(picked)}
        />
      )}
      <p className={'mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400' + (compactDrop || dropzone || (desktop && extraButton && !dropzone) ? ' hidden' : '')}>Chụp rõ điểm, thời gian đã làm và câu sai (hoặc gửi chung Phiếu tô + Bảng đáp án để Sóc tự chấm). Có thể thêm nhiều ảnh, không cần chụp gộp.</p>
      {note && <p role="status" className="mt-1.5 text-[13px] font-bold text-violet-700 dark:text-violet-300">{note}</p>}
      {error && <p role="alert" className="mt-1.5 text-[13px] font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
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
        className="min-h-11 w-full rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Kiểm tra điểm chưa áp dụng</button>}
      {!scoreCard && onScores && !scoreReview && hasAppliedScore && (
        <div className="mt-2 flex min-h-9 w-full items-center justify-between rounded-xl border border-amber-300 bg-amber-50/70 px-3 py-1.5 text-xs font-black text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">📄</span>
            <span>Điểm từ đề thi</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={openEditAppliedScore}
              className="cursor-pointer rounded-md bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-950 hover:bg-amber-300 dark:bg-amber-900/70 dark:text-amber-100"
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
              className="cursor-pointer rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-rose-100 hover:text-rose-700 dark:bg-slate-800 dark:text-slate-300"
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
          className="mt-2 flex min-h-9 w-full cursor-pointer items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-slate-800 hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:border-slate-400 dark:hover:text-white transition-all disabled:opacity-60"
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">📄</span>
            <span>Nhập điểm từ đề (tùy chọn)</span>
          </span>
          <span className="text-slate-400 font-bold" aria-hidden="true">›</span>
        </button>
      )}
      {!scoreCard && onScores && scoreReview && (
        <button
          type="button"
          disabled={busy}
          onClick={() => triggerHaptic(4)}
          className="mt-2 flex min-h-9 w-full cursor-pointer items-center justify-between rounded-xl border-2 border-amber-400 bg-amber-50/70 px-3 py-1.5 text-xs font-black text-amber-950 transition-all dark:border-amber-500/80 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="animate-pulse">📄</span>
            <span>Điểm từ đề: Đang mở hộp thoại</span>
          </span>
          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300" aria-hidden="true">Đang kiểm tra ›</span>
        </button>
      )}
      <div ref={containerRef} aria-label="Xác minh yêu cầu AI" />
    </div>
  );
}
