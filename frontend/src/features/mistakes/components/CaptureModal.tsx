import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { Soc } from '@/shared/ui/soc/Soc';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { testNameKey, normalizeTestName } from '@/features/mistakes/lib/sourceTests';
import { MAX_CAPTURE_IMAGES } from '@/features/mistakes/lib/captureBatch';
import { latestTestName, questionsToFind } from '@/features/mistakes/lib/captureContext';
import { addFiles, backToInput, captureState, closeCapture, openCapture, patchItem, removeImage, removeItem, resetCapture, retryFailure,
  setAllChecked, setTestName, startReading, subscribeCapture, toggleItem } from '@/features/mistakes/services/captureSession';
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [owner] = useState(getActiveAccountId);
  const close = useCallback(() => { closeCapture(); onClose(); }, [onClose]);
  const ref = useModalA11y(true, close);

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
    if (state.phase !== 'input') return;
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); void addFiles(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [state.phase]);

  const testName = normalizeTestName(state.testName);
  const plan = useMemo(() => questionsToFind(sessions, testName), [sessions, testName]);
  const full = state.images.length >= MAX_CAPTURE_IMAGES;
  const step = state.phase === 'input' ? 1 : state.phase === 'reading' ? 2 : 3;
  const checked = state.items.filter(item => item.checked);

  const next = () => {
    if (!state.images.length || !testName) return;
    setError('');
    void startReading({ questions: plan.questions, getToken });
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
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="cap-title" className={'cap-mod' + (step === 3 ? ' is-wide' : '')}>
        <div className="cap-head">
          <h2 id="cap-title">{step === 3 ? state.items.length ? `Soát ${state.items.length} câu sai` : 'Kết quả đọc ảnh' : 'Chụp trang chữa bài'}</h2>
          <button type="button" className="cap-x" aria-label="Đóng" onClick={close}>×</button>
        </div>
        <div className="cap-prog" role="progressbar" aria-label="Các bước" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
          {[1, 2, 3].map(index => <i key={index} className={index <= step ? 'on' : ''} />)}
        </div>

        {step === 1 && <>
          <div className="cap-body">
            <TestSelect value={state.testName} names={sourceSuggestions} onChange={setTestName} />
            <div className={'cap-drop' + (state.images.length ? ' is-compact' : '')}
              onDragOver={event => event.preventDefault()}
              onDrop={event => { event.preventDefault(); void addFiles([...event.dataTransfer.files]); }}>
              {!state.images.length && <Soc state="hi" size={92} />}
              <b>{state.images.length ? 'Thả hoặc dán thêm ảnh' : 'Thả, dán hoặc chọn ảnh trang chữa bài'}</b>
              {!state.images.length && <p>Nhấn <kbd>Ctrl+V</kbd> để dán ảnh chụp màn hình · nhiều ảnh một lúc</p>}
              <button type="button" className="rd-btn rd-btn--white cap-sm" disabled={state.adding || full} onClick={() => fileInput.current?.click()}>
                {state.adding ? 'Đang xử lý ảnh…' : 'Chọn ảnh…'}
              </button>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Ảnh trang chữa bài"
                onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; if (files.length) void addFiles(files); }} />
            </div>
            {state.images.length > 0 && (
              <ul className="cap-thumbs" aria-label="Ảnh đã thêm">
                {state.images.map((image, index) => (
                  <li key={image.id} className="cap-th">
                    <img src={image.dataUrl} alt={`Ảnh ${index + 1}`} />
                    <button type="button" aria-label={`Bỏ ảnh ${index + 1}`} onClick={() => removeImage(image.id)}>×</button>
                  </li>
                ))}
                <li className="cap-count" aria-label="Số ảnh">{state.images.length}/{MAX_CAPTURE_IMAGES} ảnh</li>
              </ul>
            )}
            {(state.overflow || full) && <p className="cap-note is-warn" role="status">Gửi {MAX_CAPTURE_IMAGES} ảnh trước, phần còn lại gửi lần sau.</p>}
            <p className="cap-hint">📖 Chỉ Part 5–7 (câu 101–200). {plan.logged ? `Sóc tìm ${plan.questions.length} câu bạn đã ghi sai ở đề này.` : 'Sóc tự tìm câu bạn sai.'}</p>
            {(error || state.error) && <p role="alert" className="cap-error">{error || state.error}</p>}
          </div>
          <div className="cap-foot">
            <button type="button" className="cap-link" onClick={onManual}>✏️ Tự gõ một câu</button>
            <button type="button" className="rd-btn rd-btn--pink" disabled={!state.images.length || !testName || state.adding} onClick={next}>Tiếp</button>
          </div>
        </>}

        {step === 2 && <>
          <div className="cap-body cap-read">
            <Soc state="think" size={150} />
            <div>
              <h3>Sóc đang đọc {state.images.length} ảnh…</h3>
              <p role="status">{state.items.length
                ? `Đã thấy ${state.items.length} câu sai ở ${partsText(foundParts)}. `
                : 'Chưa thấy câu sai nào, Sóc đang tìm tiếp. '}Thường mất khoảng {Math.max(20, state.requestsTotal * 20)} giây.</p>
              <ul className="cap-thumbs is-read" aria-label="Ảnh đang đọc">
                {state.images.map((image, index) => (
                  <li key={image.id} className={'cap-th is-' + image.status}>
                    <img src={image.dataUrl} alt={`Ảnh ${index + 1}`} />
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
                <p>Kiểm tra lại đề, hoặc chụp trang có đánh dấu câu sai rõ hơn.</p>
                <button type="button" className="rd-btn rd-btn--white cap-sm" onClick={backToInput}>Thử ảnh khác</button>
              </div>
            )}
            {error && <p role="alert" className="cap-error">{error}</p>}
          </div>
          <div className="cap-foot">
            <span className="cap-foot-note">Bỏ tick câu nào không muốn lưu.
              {state.items.length > 1 && <> <button type="button" className="cap-link is-quiet" onClick={() => setAllChecked(checked.length < state.items.length)}>{checked.length < state.items.length ? 'Tick tất cả' : 'Bỏ tick tất cả'}</button></>}
            </span>
            <button type="button" className="rd-btn rd-btn--pink" disabled={!checked.length || saving} onClick={save}>Lưu {checked.length} câu vào Sổ tay</button>
          </div>
        </>}
      </div>
    </div>
  );
}
