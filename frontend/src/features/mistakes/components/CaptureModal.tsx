import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { Soc } from '@/shared/ui/soc/Soc';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { testNameKey, normalizeTestName } from '@/features/mistakes/lib/sourceTests';
import { partOfQuestion } from '@/shared/domain/questionNumbers';
import { MAX_CAPTURE_IMAGES, isRightAnswer } from '@/features/mistakes/lib/captureBatch';
import { captureQuestions, latestTestName, questionsToFind } from '@/features/mistakes/lib/captureContext';
import { checkPhotoClarity, clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { fileExifOrientation } from '@/features/mistakes/lib/imageInput';
import { isGroupedPart, suggestGroups, updatePart7Range, type CustomRangeMap } from '@/features/mistakes/lib/wrongDetail';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { CapturePartInput } from '@/features/mistakes/components/wrong-detail/CapturePartInput';
import { PhotoReview } from '@/features/mistakes/components/PhotoReview';
import { addFiles, backToInput, captureState, closeCapture, getImageFile, openCapture, patchItem, removeImage, removeItem, replaceImageFile, resetCapture, retryFailure,
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
  onManual: () => void;
  onAddBatch?: (entries: MistakeEntry[]) => void;
  onUpdate: (entry: MistakeEntry, original: MistakeEntry) => void;
  onSaved: (message: string) => void;
}

const partsText = (parts: number[]) => parts.length > 1 ? `Part ${parts.slice(0, -1).join(', ')} và Part ${parts[parts.length - 1]}` : `Part ${parts[0]}`;

/** "Chụp trang chữa bài": drop screenshots, Sóc reads them, the learner reviews and saves. */
export function CaptureModal({ sessions, mistakes, sourceSuggestions, initialTestName = '', getToken, onClose, onManual, onAddBatch, onUpdate, onSaved }: Props) {
  const state = useSyncExternalStore(subscribeCapture, captureState);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [contextSupported, setContextSupported] = useState(true);
  const [customPart7Ranges, setCustomPart7Ranges] = useState<CustomRangeMap>({});
  const [clarity, setClarity] = useState<Record<string, ClarityResult | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
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
    if (state.phase !== 'input' || !state.part) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); addFiles(files, 'questions'); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [state.phase, state.part]);

  const testName = normalizeTestName(state.testName);
  const plan = useMemo(() => questionsToFind(sessions, testName, mistakes), [sessions, testName, mistakes]);
  const groupRange = state.part && isGroupedPart(state.part) && state.group
    ? suggestGroups(state.part, plan.logged ? plan.questions : [state.group], state.part === 7 ? customPart7Ranges : undefined).find(item => item.from === state.group) ?? null
    : null;
  const full = state.images.length >= MAX_CAPTURE_IMAGES;
  const step = state.phase === 'input' ? 1 : state.phase === 'reading' ? 2 : 3;
  const checked = state.items.filter(item => item.checked);
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
    if (!state.images.length || !testName || !state.part) return;
    setError('');
    void startReading({ questions: captureQuestions(plan, state.part, groupRange), getToken, contextSupported });
  };

  const save = () => {
    if (saving || !checked.length) return;
    if (getActiveAccountId() !== owner) { setError('Tài khoản đã thay đổi. Chưa lưu câu sai.'); return; }
    if (!testName) { setError('Chọn hoặc thêm tên đề trước khi lưu.'); return; }
    setSaving(true); setError('');
    try {
      const sessionId = plan.logged && testNameKey(testName) === testNameKey(state.testName) ? plan.sessionId : undefined;
      const result = saveCaptureItems(state.items, { testName, sessionId, existing: mistakes, onAddBatch, onUpdate });
      resetCapture(); closeCapture();
      onSaved(`Đã lưu ${result.saved} câu sai${result.explanationsQueued ? '' : '. Chưa xếp được lời giải AI; bạn có thể mở thẻ để bổ sung.'}`);
      onClose();
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
            <TestSelect value={state.testName} names={sourceSuggestions} onChange={setTestName} />
            <CapturePartInput part={state.part} group={state.group} customPart7Ranges={customPart7Ranges} images={state.images}
              logged={plan.logged ? plan.questions : null} photoMode={state.photoMode} clarity={clarity}
              onPart={setPart} onGroup={setGroup} onEditPart7Range={editPart7Range} onPhotoMode={setPhotoMode}
              onAdd={addFiles} onCameraAdd={(files, zone) => { if (files.length) setPhotoMode(true); addFiles(files, zone); }}
              onEditImage={setEditingId} onRemove={removeImage} />
            {problemMessage && problemIndex >= 0 && (
              <div className="wd-clarity" role="status">
                <span><b>{problemMessage.head}</b>{problemMessage.rest}</span>
                <button type="button" className="wd-chip-btn" onClick={() => setEditingId(state.images[problemIndex].id)}>Chỉnh / cắt ảnh</button>
              </div>
            )}
            {(state.overflow || full) && <p className="cap-note is-warn" role="status">Gửi {MAX_CAPTURE_IMAGES} ảnh trước, phần còn lại gửi lần sau.</p>}
            {state.part && (() => {
              const hasLoggedInPart = plan.logged && plan.questions.some(number => partOfQuestion(number) === state.part);
              const count = captureQuestions(plan, state.part, groupRange).length;
              return <p className="cap-hint">{hasLoggedInPart ? `Sóc tìm ${count} câu bạn đã ghi sai ở đề này.` : `Sóc tìm trong cả Part ${state.part} (${count} câu) và tự giải đối chiếu.`}</p>;
            })()}
            {(error || state.error) && <p role="alert" className="cap-error">{error || state.error}</p>}
          </div>
          <div className="cap-foot">
            <button type="button" className="cap-link" onClick={onManual}>✏️ Tự gõ một câu</button>
            <button type="button" className="rd-btn rd-btn--pink" disabled={!state.images.length || !testName || !state.part} onClick={next}>Gửi Sóc đọc</button>
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
            <span className="cap-foot-note">Bạn có thể đóng, Sóc đọc tiếp và báo khi xong.</span>
            <button type="button" className="rd-btn rd-btn--white" onClick={close}>Đóng, báo mình sau</button>
          </div>
        </>}

        {step === 3 && <>
          <div className="cap-body">
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
            ) : !state.failures.length && (
              <div className="cap-empty">
                <Soc state="idle" size={110} />
                <h3>Sóc chưa thấy câu sai nào trong ảnh</h3>
                <p>{state.rejectionReasons[0]?.detail || 'Kiểm tra lại đề, hoặc chụp trang có đánh dấu câu sai rõ hơn.'}</p>
                <button type="button" className="rd-btn rd-btn--white cap-sm" onClick={backToInput}>Thử ảnh khác</button>
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
            </span>
            {!checked.length && state.items.length > 0 && state.items.every(item => isRightAnswer(item.draft))
              ? <button type="button" className="rd-btn rd-btn--pink" onClick={backToInput}>Xong · Chụp trang khác</button>
              : <button type="button" className="rd-btn rd-btn--pink" disabled={!checked.length || saving} onClick={save}>Lưu {checked.length} câu vào Sổ tay</button>}
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
