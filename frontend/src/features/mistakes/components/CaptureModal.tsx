import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, FileText, Layers, Loader2, Plus, X } from 'lucide-react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { Soc } from '@/shared/ui/soc/Soc';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { testNameKey, normalizeTestName } from '@/features/mistakes/lib/sourceTests';
import { partOfQuestion } from '@/shared/domain/questionNumbers';
import { MAX_CAPTURE_IMAGES, isRightAnswer } from '@/features/mistakes/lib/captureBatch';
import { captureQuestions, latestTestName, looksLikePastedQuestion, questionsToFind } from '@/features/mistakes/lib/captureContext';
import { checkPhotoClarity, clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { fileExifOrientation } from '@/features/mistakes/lib/imageInput';
import { isGroupedPart, suggestGroups, updatePart7Range, type CustomRangeMap } from '@/features/mistakes/lib/wrongDetail';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { CapturePartInput } from '@/features/mistakes/components/wrong-detail/CapturePartInput';
import { ScreenshotSuggestBar } from '@/features/mistakes/components/wrong-detail/ScreenshotSuggestBar';
import { PhotoReview } from '@/features/mistakes/components/PhotoReview';
import { addFiles, backToInput, cancelReading, captureState, clearSavedItems, closeCapture, getImageFile, moveImage, openCapture, openReview, patchItem,
  queueAndContinue, removeImage, removeItem, removeUncheckedItems, replaceImageFile, resetCapture, retryFailure,
  setAllChecked, setGroup, setPart, setPhotoMode, setTestName, startReading, subscribeCapture, toggleItem } from '@/features/mistakes/services/captureSession';
import { saveCaptureItems } from '@/features/mistakes/services/saveCapture';
import { ReviewList } from '@/features/mistakes/components/CaptureReview';
import { TestSelect } from '@/features/mistakes/components/TestSelect';
import './capture-rd.css';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  sourceSuggestions: string[];
  /** A test chosen for the learner (for instance from a logged test) when the capture is still empty. */
  initialTestName?: string;
  getToken: () => Promise<string>;
  onClose: () => void;
  onManual: (initialRaw?: string) => void;
  onAddBatch?: (entries: MistakeEntry[]) => void;
  onUpdate: (entry: MistakeEntry, original: MistakeEntry) => void;
  onSaved: (message: string) => void;
}

const partsText = (parts: number[]) => parts.length > 1 ? `Part ${parts.slice(0, -1).join(', ')} và Part ${parts[parts.length - 1]}` : `Part ${parts[0]}`;
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

/** "Chụp trang chữa bài": drop screenshots, Sóc reads them, the learner reviews and saves. */
export function CaptureModal({ sessions, mistakes, sourceSuggestions, initialTestName = '', getToken, onClose, onManual, onAddBatch, onUpdate, onSaved }: Props) {
  const state = useSyncExternalStore(subscribeCapture, captureState);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [contextSupported, setContextSupported] = useState(true);
  const [customPart7Ranges, setCustomPart7Ranges] = useState<CustomRangeMap>({});
  const [clarity, setClarity] = useState<Record<string, ClarityResult | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pastedTextPrompt, setPastedTextPrompt] = useState('');
  const measured = useRef(new Set<string>());
  const alive = useRef(true);
  const [owner] = useState(getActiveAccountId);
  const close = useCallback(() => { if (editingId) { setEditingId(null); return; } closeCapture(); onClose(); }, [editingId, onClose]);
  const ref = useModalA11y(true, close);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    for (const image of state.images) {
      if (measured.current.has(image.id)) continue;
      measured.current.add(image.id);
      const file = getImageFile(image.id);
      if (file) {
        void fileExifOrientation(file).then(orientation => {
          if (alive.current && orientation !== 1) setPhotoMode(true);
        });
      }
      void checkPhotoClarity(image.url).then(result => {
        if (!alive.current) return;
        setClarity(prev => ({ ...prev, [image.id]: result }));
        if (result?.problem) setPhotoMode(true);
      });
    }
  }, [state.images]);

  useEffect(() => {
    openCapture();
    const current = captureState();
    if (!current.testName && current.phase === 'input') {
      const name = normalizeTestName(initialTestName) || latestTestName(sessions) || sourceSuggestions[0] || '';
      if (name) setTestName(name);
    }
    // Opening runs once; later changes of the lists must not overwrite the learner's pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void aiService.getAIConfiguration().then(value => { if (!cancelled) setContextSupported(value.pageContextImages !== false); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (state.phase !== 'input') return;
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) {
        event.preventDefault();
        setPastedTextPrompt('');
        addFiles(files, 'questions');
        return;
      }
      if (isEditableTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (looksLikePastedQuestion(text)) {
        event.preventDefault();
        setPastedTextPrompt(text.trim());
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [state.phase]);

  const testName = normalizeTestName(state.testName);
  const plan = useMemo(() => questionsToFind(sessions, testName, mistakes), [sessions, testName, mistakes]);
  const partGroups = useMemo(() => {
    if (state.part === 'auto' || !isGroupedPart(state.part)) return [];
    const loggedInPart = plan.logged ? plan.questions.filter(number => partOfQuestion(number) === state.part) : [];
    const seeds = loggedInPart.length ? loggedInPart : state.group ? [state.group] : [];
    return seeds.length ? suggestGroups(state.part, seeds, state.part === 7 ? customPart7Ranges : undefined) : [];
  }, [state.part, state.group, plan, customPart7Ranges]);
  const groupRange = state.group ? partGroups.find(item => item.from === state.group) ?? null : null;
  const nextGroup = useMemo(() => {
    if (!partGroups.length || state.group === null) return null;
    const idx = partGroups.findIndex(item => item.from === state.group);
    return idx >= 0 && idx + 1 < partGroups.length ? partGroups[idx + 1].from : null;
  }, [partGroups, state.group]);

  const full = state.images.length >= MAX_CAPTURE_IMAGES;
  const step = state.phase === 'input' ? 1 : state.phase === 'reading' ? 2 : 3;
  const checked = state.items.filter(item => item.checked);
  const hasQueueStatus = state.activeJobs > 0 || state.items.length > 0 || state.failures.length > 0;
  const problemIndex = state.images.findIndex(image => clarity[image.id]?.problem);
  const problemMessage = problemIndex >= 0 ? clarityMessage(problemIndex + 1, clarity[state.images[problemIndex].id]!.problem!) : null;
  const editingFile = editingId ? getImageFile(editingId) : undefined;
  const editPart7Range = (oldFrom: number, from: number, to: number): string | null => {
    const res = updatePart7Range(customPart7Ranges, oldFrom, from, to);
    if ('error' in res) return res.error;
    setCustomPart7Ranges(res.next);
    setGroup(from);
    return null;
  };

  const next = () => {
    if (!state.images.length || !testName) return;
    setError('');
    setPastedTextPrompt('');
    void startReading({ questions: captureQuestions(plan, state.part, groupRange), getToken, contextSupported });
  };

  const sendAndContinue = () => {
    if (!state.images.length || !testName) return;
    setError('');
    setPastedTextPrompt('');
    void queueAndContinue({ questions: captureQuestions(plan, state.part, groupRange), getToken, contextSupported }, nextGroup);
  };

  const saveItems = (keepOpen: boolean) => {
    if (saving || !checked.length) return;
    if (getActiveAccountId() !== owner) { setError('Tài khoản đã thay đổi. Chưa lưu câu sai.'); return; }
    if (!testName) { setError('Chọn hoặc thêm tên đề trước khi lưu.'); return; }
    setSaving(true); setError('');
    try {
      const sessionId = plan.logged && testNameKey(testName) === testNameKey(state.testName) ? plan.sessionId : undefined;
      const result = saveCaptureItems(state.items, { testName, sessionId, existing: mistakes, onAddBatch, onUpdate });
      const msg = `Đã lưu ${result.saved} câu sai${result.explanationsQueued ? '' : '. Chưa xếp được lời giải AI; bạn có thể mở thẻ để bổ sung.'}`;
      if (keepOpen || state.activeJobs > 0) {
        clearSavedItems(checked.map(item => item.id));
        onSaved(msg);
      } else {
        resetCapture(); closeCapture();
        onSaved(msg);
        onClose();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa lưu được các câu sai. Bản nháp vẫn được giữ; hãy thử lại.');
    } finally { setSaving(false); }
  };

  // Readings that failed for the same reason are one line with one "Thử lại".
  const failureGroups = useMemo(() => {
    const groups = new Map<string, { message: string; ids: string[]; images: number }>();
    for (const failure of state.failures) {
      const group = groups.get(failure.message) ?? { message: failure.message, ids: [], images: 0 };
      group.ids.push(failure.id); group.images += failure.imageIds.length; groups.set(failure.message, group);
    }
    return [...groups.values()];
  }, [state.failures]);
  const retryAll = async (ids: string[]) => { for (const id of ids) await retryFailure(id); };
  const foundParts = [...new Set(state.items.map(item => item.part))].sort();

  const hintText = useMemo(() => {
    if (state.part === 'auto') {
      return plan.logged && plan.questions.length > 0
        ? `Sóc tự nhận Part và ưu tiên tìm ${plan.questions.length} câu bạn đã ghi sai ở đề này.`
        : 'Sóc tự nhận Part từ số câu trên ảnh (1–200) và tự giải đối chiếu đáp án.';
    }
    const hasLoggedInPart = plan.logged && plan.questions.some(number => partOfQuestion(number) === state.part);
    const count = captureQuestions(plan, state.part, groupRange).length;
    return hasLoggedInPart
      ? `Sóc tìm ${count} câu bạn đã ghi sai ở đề này.`
      : `Sóc tìm trong cả Part ${state.part} (${count} câu) và tự giải đối chiếu.`;
  }, [state.part, plan, groupRange]);

  return (
    <div className="cap-dim" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Chụp trang chữa bài" className={'cap-mod' + (step === 3 ? ' is-wide' : '')}>
        <div className="cap-head">
          <h2 id="cap-title">{step === 3 ? state.items.length ? (state.items.some(item => isRightAnswer(item.draft)) ? `Soát ${state.items.length} câu đã đọc` : `Soát ${state.items.length} câu sai`) : 'Kết quả đọc ảnh' : 'Chụp trang chữa bài'}</h2>
          <button type="button" className="cap-x" aria-label="Đóng" onClick={close}>×</button>
        </div>
        <div className="cap-prog" role="progressbar" aria-label="Các bước" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
          {[1, 2, 3].map(index => <i key={index} className={index <= step ? 'on' : ''} />)}
        </div>

        {step === 1 && <>
          <div className="cap-body">
            {hasQueueStatus && (
              <div className="cap-queue" role="status" aria-live="polite">
                {state.activeJobs > 0
                  ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#7c5ce0]" aria-hidden="true" />
                  : <Layers className="h-4 w-4 shrink-0 text-[#d64570]" aria-hidden="true" />}
                <span className="cap-queue-text">
                  {state.activeJobs > 0
                    ? <><b>Đang đọc nền {state.activeJobs} mẻ</b> ({state.queuedImagesCount} ảnh){state.items.length > 0 ? ` · Đã xong ${state.items.length} câu` : ''}</>
                    : state.items.length > 0
                      ? <><b>Đã đọc xong {state.items.length} câu</b> chờ soát{state.failures.length > 0 ? ` · ${state.failures.length} lỗi` : ''}</>
                      : <><b>Có {state.failures.length} ảnh</b> chưa đọc được</>}
                </span>
                <button type="button" className="cap-queue-btn" onClick={openReview}>
                  <span>Soát ngay</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              </div>
            )}
            <TestSelect value={state.testName} names={sourceSuggestions} onChange={setTestName} />
            <CapturePartInput part={state.part} group={state.group} customPart7Ranges={customPart7Ranges} images={state.images}
              logged={plan.logged ? plan.questions : null} photoMode={state.photoMode} clarity={clarity}
              extraTools={
                <ScreenshotSuggestBar
                  enabled={step === 1}
                  onAddFiles={picked => { setPastedTextPrompt(''); addFiles(picked, 'questions'); }}
                />
              }
              onPart={p => { setPastedTextPrompt(''); setPart(p); }} onGroup={setGroup} onEditPart7Range={editPart7Range} onPhotoMode={setPhotoMode}
              onAdd={(picked, zone) => { setPastedTextPrompt(''); addFiles(picked, zone); }}
              onCameraAdd={(files, zone) => { if (files.length) setPhotoMode(true); setPastedTextPrompt(''); addFiles(files, zone); }}
              onEditImage={setEditingId} onMoveImage={moveImage} onRemove={removeImage} />
            {pastedTextPrompt && (
              <div className="cap-text-banner" role="status">
                <FileText className="h-4 w-4 shrink-0 text-[#a87a00]" aria-hidden="true" />
                <span>Bạn vừa dán văn bản câu hỏi — Khung này dành cho ảnh chụp. Chuyển nhanh sang <b>Tự gõ</b> nhé?</span>
                <button type="button" className="cap-text-go" onClick={() => { const raw = pastedTextPrompt; setPastedTextPrompt(''); onManual(raw); }}>Chuyển sang Tự gõ</button>
                <button type="button" className="cap-text-x" aria-label="Đóng gợi ý" onClick={() => setPastedTextPrompt('')}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </div>
            )}
            {problemMessage && problemIndex >= 0 && (
              <div className="wd-clarity" role="status">
                <span><b>{problemMessage.head}</b>{problemMessage.rest}</span>
                <button type="button" className="wd-chip-btn" onClick={() => setEditingId(state.images[problemIndex].id)}>Chỉnh / cắt ảnh</button>
              </div>
            )}
            {(state.overflow || full) && <p className="cap-note is-warn" role="status">Gửi {MAX_CAPTURE_IMAGES} ảnh trước, phần còn lại gửi lần sau.</p>}
            <p className="cap-hint">{hintText}</p>
            {(error || state.error) && <p role="alert" className="cap-error">{error || state.error}</p>}
          </div>
          <div className="cap-foot">
            <button type="button" className="cap-link" onClick={() => onManual()}>Tự gõ một câu</button>
            <div className="cap-foot-acts">
              {state.images.length > 0 && Boolean(testName) && (
                <button type="button" className="rd-btn rd-btn--white cap-sm" onClick={sendAndContinue}>Gửi &amp; chụp tiếp ›</button>
              )}
              <button type="button" className="rd-btn rd-btn--pink" disabled={!state.images.length || !testName} onClick={next}>Gửi Sóc đọc</button>
            </div>
          </div>
        </>}

        {step === 2 && <>
          <div className="cap-body cap-read">
            <Soc state="think" size={150} />
            <div>
              <h3>{state.solving ? 'Sóc đang tự giải & đối chiếu đáp án…' : `Sóc đang đọc ${state.images.length} ảnh…`}</h3>
              {state.note && <p className="cap-note">{state.note}</p>}
              <p role="status">{state.solving && state.items.length
                ? `Đã đọc ${state.items.length} câu ở ${partsText(foundParts)}, Sóc đang giải và kiểm tra lại đáp án. `
                : state.items.length
                  ? `Đã thấy ${state.items.length} câu ở ${partsText(foundParts)}. `
                  : 'Đang quét câu hỏi trên ảnh. '}Thường mất khoảng {Math.max(20, state.requestsTotal * 20)} giây.</p>
              <ul className="cap-thumbs is-read" aria-label="Ảnh đang đọc">
                {state.images.map((image, index) => (
                  <li key={image.id} className={'cap-th is-' + image.status}>
                    <img src={image.url} alt={`Ảnh ${index + 1}`} />
                    {image.status === 'reading' && <span className="cap-scan" aria-hidden="true" />}
                    {image.status === 'done' && <span className="cap-done" aria-label="Đã đọc xong">✓</span>}
                    {image.status === 'failed' && <span className="cap-done is-bad" aria-label="Chưa đọc được">!</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="cap-foot">
            <button type="button" className="cap-link is-quiet" onClick={cancelReading}>← Hủy, chọn ảnh lại</button>
            <div className="cap-foot-acts">
              <span className="cap-foot-note">Có thể đóng, Sóc báo khi xong.</span>
              <button type="button" className="rd-btn rd-btn--white" onClick={close}>Đóng, báo mình sau</button>
            </div>
          </div>
        </>}

        {step === 3 && <>
          <div className="cap-body">
            {state.activeJobs > 0 && (
              <div className="cap-queue" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#7c5ce0]" aria-hidden="true" />
                <span className="cap-queue-text"><b>Sóc đang đọc nền thêm {state.activeJobs} mẻ</b> ({state.queuedImagesCount} ảnh) — câu mới sẽ tự hiện vào danh sách.</span>
              </div>
            )}
            {state.restored && <p className="cap-note" role="status">Đã khôi phục các câu bạn chưa lưu lần trước.</p>}
            {state.note && <p className="cap-note">{state.note}</p>}
            {failureGroups.map(group => (
              <div key={group.message} className="cap-fail" role="alert">
                <span><b>Chưa đọc được {group.images} ảnh.</b> {group.message}</span>
                <button type="button" className="rd-btn rd-btn--white cap-sm" onClick={() => void retryAll(group.ids)}>Thử lại</button>
              </div>
            ))}
            {state.unsent > 0 && <p className="cap-note is-warn" role="status">{state.unsent} ảnh chưa được gửi, gửi ở lần chụp sau.</p>}
            {state.items.length > 0 ? (
              <ReviewList items={state.items} onToggle={toggleItem} onPatch={patchItem} onRemove={removeItem} />
            ) : !state.failures.length && state.activeJobs === 0 && (
              <div className="cap-empty">
                <Soc state="idle" size={110} />
                <h3>Sóc chưa thấy câu sai nào trong ảnh</h3>
                <p>{state.rejectionReasons[0]?.detail || 'Kiểm tra lại đề, hoặc chụp trang có đánh dấu câu sai rõ hơn.'}</p>
                <button type="button" className="rd-btn rd-btn--white cap-sm" onClick={() => backToInput(false)}>Thử ảnh khác</button>
              </div>
            )}
            {state.items.length > 0 && state.rejectionReasons.length > 0 && (
              <ul className="wd-reasons" role="status">
                {state.rejectionReasons.map((reason, idx) => <li key={`${reason.number ?? 'x'}-${idx}`}>{reason.detail}</li>)}
              </ul>
            )}
            {error && <p role="alert" className="cap-error">{error}</p>}
          </div>
          <div className="cap-foot">
            <span className="cap-foot-note">Bỏ tick câu nào không muốn lưu.
              {state.items.length > 1 && <> <button type="button" className="cap-link is-quiet" onClick={() => setAllChecked(checked.length < state.items.length)}>{checked.length < state.items.length ? 'Tick tất cả' : 'Bỏ tick tất cả'}</button></>}
              {state.items.length > checked.length && <> · <button type="button" className="cap-link is-danger" onClick={removeUncheckedItems}>Xóa {state.items.length - checked.length} câu chưa tick</button></>}
            </span>
            <div className="cap-foot-acts">
              {state.items.length > 0 && (
                <button type="button" className="rd-btn rd-btn--white cap-sm" onClick={() => backToInput(true)}>
                  <Plus className="h-3.5 w-3.5 shrink-0 inline-block mr-1 -mt-0.5" aria-hidden="true" />Chụp thêm
                </button>
              )}
              {!checked.length && state.items.length > 0 && state.items.every(item => isRightAnswer(item.draft))
                ? <button type="button" className="rd-btn rd-btn--pink" onClick={() => backToInput(false)}>Xong · Chụp trang khác</button>
                : <>
                    {checked.length > 0 && (
                      <button type="button" className="rd-btn rd-btn--white cap-sm" disabled={saving} onClick={() => saveItems(true)}>Lưu &amp; chụp tiếp</button>
                    )}
                    <button type="button" className="rd-btn rd-btn--pink" disabled={!checked.length || saving} onClick={() => saveItems(false)}>Lưu {checked.length} câu vào Sổ tay</button>
                  </>}
            </div>
          </div>
        </>}
        {editingId && editingFile && (
          <PhotoReview
            file={editingFile}
            photoMode={state.photoMode}
            onClose={() => setEditingId(null)}
            onApply={({ file: nextFile, photoMode: nextPhotoMode, changed }) => {
              setPhotoMode(nextPhotoMode);
              if (changed) { measured.current.delete(editingId); replaceImageFile(editingId, nextFile); }
              setEditingId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
