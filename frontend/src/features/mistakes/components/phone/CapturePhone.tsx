import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { Soc } from '@/shared/ui/soc/Soc';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { testNameKey, normalizeTestName } from '@/features/mistakes/lib/sourceTests';
import { MAX_CAPTURE_IMAGES } from '@/features/mistakes/lib/captureBatch';
import { captureQuestions, latestTestName, questionsToFind } from '@/features/mistakes/lib/captureContext';
import { isGroupedPart, suggestGroups, updatePart7Range, type CustomRangeMap } from '@/features/mistakes/lib/wrongDetail';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { CapturePartInput } from '@/features/mistakes/components/wrong-detail/CapturePartInput';
import { PhotoReview } from '@/features/mistakes/components/PhotoReview';
import { checkPhotoClarity, clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { addFiles, backToInput, captureState, closeCapture, getImageFile, openCapture, patchItem, removeImage, removeItem, replaceImageFile, resetCapture, retryFailure,
  setAllChecked, setGroup, setPart, setPhotoMode, setTestName, startReading, subscribeCapture, toggleItem } from '@/features/mistakes/services/captureSession';
import { saveCaptureItems } from '@/features/mistakes/services/saveCapture';
import { ReviewList } from '@/features/mistakes/components/CaptureReview';
import { TestSelect } from '@/features/mistakes/components/TestSelect';
import { PhoneSheet } from '@/app/components/phone';
import '@/features/mistakes/components/capture-rd.css';
import './phone-notebook.css';

interface Props {
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  sourceSuggestions: string[];
  initialTestName?: string;
  getToken: () => Promise<string>;
  onClose: () => void;
  onManual: () => void;
  onAddBatch?: (entries: MistakeEntry[]) => void;
  onUpdate: (entry: MistakeEntry, original: MistakeEntry) => void;
  onSaved: (message: string) => void;
}

const TIPS_KEY = 'toeic.capture.tipsSeen';
const tipsSeen = () => { try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; } };
const markTipsSeen = () => { try { localStorage.setItem(TIPS_KEY, '1'); } catch { /* the tips just show again next time */ } };

const PAGE_LINES = [80, 70, 85, 60, 78, 72, 66, 82];
const SamplePage = ({ bad }: { bad?: boolean }) => (
  <div className={'pc-sample' + (bad ? ' is-bad' : '')} aria-hidden="true">{PAGE_LINES.map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div>
);

/** "Chụp trang chữa bài" on phones: straight to the camera, thumbnails, an on-device clarity check, one send button. */
export function CapturePhone({ sessions, mistakes, sourceSuggestions, initialTestName = '', getToken, onClose, onManual, onAddBatch, onUpdate, onSaved }: Props) {
  const state = useSyncExternalStore(subscribeCapture, captureState);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tips, setTips] = useState(() => !tipsSeen());
  const [clarity, setClarity] = useState<Record<string, ClarityResult | null>>({});
  const [contextSupported, setContextSupported] = useState(true);
  const [customPart7Ranges, setCustomPart7Ranges] = useState<CustomRangeMap>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [owner] = useState(getActiveAccountId);
  const close = useCallback(() => { if (editingId) { setEditingId(null); return; } closeCapture(); onClose(); }, [editingId, onClose]);
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
    let cancelled = false;
    void aiService.getAIConfiguration().then(value => { if (!cancelled) setContextSupported(Boolean(value.pageContextImages)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Every new photo is measured on this phone; nothing is sent and no AI use is spent.
  const measured = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    for (const image of state.images) {
      if (measured.current.has(image.id)) continue;
      measured.current.add(image.id);
      void checkPhotoClarity(image.url).then(result => { if (alive.current) setClarity(previous => ({ ...previous, [image.id]: result })); });
    }
  }, [state.images]);

  const testName = normalizeTestName(state.testName);
  const plan = useMemo(() => questionsToFind(sessions, testName), [sessions, testName]);
  const full = state.images.length >= MAX_CAPTURE_IMAGES;
  const checked = state.items.filter(item => item.checked);
  const problemIndex = state.images.findIndex(image => clarity[image.id]?.problem);
  const problem = problemIndex >= 0 ? clarity[state.images[problemIndex].id]!.problem! : null;
  const message = problem ? clarityMessage(problemIndex + 1, problem) : null;
  const groupRange = state.part && isGroupedPart(state.part) && state.group
    ? suggestGroups(state.part, plan.logged ? plan.questions : [state.group], state.part === 7 ? customPart7Ranges : undefined).find(item => item.from === state.group) ?? null
    : null;
  const editingFile = editingId ? getImageFile(editingId) : undefined;
  const editPart7Range = (oldFrom: number, from: number, to: number): string | null => {
    const res = updatePart7Range(customPart7Ranges, oldFrom, from, to);
    if ('error' in res) return res.error;
    setCustomPart7Ranges(res.next);
    setGroup(from);
    return null;
  };

  const retake = () => { if (problemIndex >= 0) removeImage(state.images[problemIndex].id); };
  const closeTips = () => { markTipsSeen(); setTips(false); };
  const send = () => {
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

  const failureGroups = useMemo(() => {
    const groups = new Map<string, { message: string; ids: string[]; images: number }>();
    for (const failure of state.failures) {
      const group = groups.get(failure.message) ?? { message: failure.message, ids: [], images: 0 };
      group.ids.push(failure.id); group.images += failure.imageIds.length; groups.set(failure.message, group);
    }
    return [...groups.values()];
  }, [state.failures]);
  const retryAll = async (ids: string[]) => { for (const id of ids) await retryFailure(id); };

  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Chụp trang chữa bài" tabIndex={-1} className={'rd pc' + (state.phase !== 'reading' ? ' is-light' : '')}>
      {state.phase === 'input' && (
        <>
          <div className="pc-top">
            <button type="button" className="pc-x" aria-label="Đóng" onClick={close}>×</button>
            <b>Chụp trang chữa bài</b>
            <button type="button" className="pc-i" aria-label="Mẹo chụp rõ" onClick={() => setTips(true)}>i</button>
          </div>
          <div className="pc-test"><TestSelect value={state.testName} names={sourceSuggestions} onChange={setTestName} /></div>
          <div className="pc-part">
            <CapturePartInput phone part={state.part} group={state.group} customPart7Ranges={customPart7Ranges} images={state.images}
              logged={plan.logged ? plan.questions : null} photoMode={state.photoMode} clarity={clarity}
              onPart={setPart} onGroup={setGroup} onEditPart7Range={editPart7Range} onPhotoMode={setPhotoMode}
              onAdd={addFiles} onCameraAdd={(files, zone) => { if (files.length) setPhotoMode(true); addFiles(files, zone); }}
              onEditImage={setEditingId} onRemove={removeImage} />
          </div>
          {message && problemIndex >= 0 && (
            <div className="pc-warn" role="status">
              <div><b>{message.head}</b>{message.rest}</div>
              <button type="button" onClick={() => setEditingId(state.images[problemIndex].id)}>Chỉnh ảnh</button>
              <button type="button" onClick={retake}>Chụp lại</button>
            </div>
          )}
          {(error || state.error) && <p role="alert" className="pc-err">{error || state.error}</p>}
          {(state.overflow || full) && <p className="pc-err" role="status">Mỗi lần gửi tối đa {MAX_CAPTURE_IMAGES} ảnh.</p>}
          <div className="pc-foot is-row">
            <button type="button" className="pc-side is-light" onClick={() => { closeCapture(); onManual(); }}>Tự gõ</button>
            <button type="button" className="pc-send" disabled={!state.images.length || !testName || !state.part} onClick={send}>
              {!state.part ? 'Chọn Part trước' : state.images.length && !testName ? 'Chọn đề trước khi gửi' : state.images.length ? `Gửi Sóc đọc ${state.images.length} ảnh · 1 lượt AI` : 'Chụp ít nhất một ảnh'}
            </button>
          </div>
        </>
      )}

      {state.phase === 'reading' && (
        <>
          <div className="pc-top"><button type="button" className="pc-x" aria-label="Đóng" onClick={close}>×</button><b>Sóc đang đọc</b></div>
          <div className="pc-read">
            <Soc state="think" size={150} />
            <h3>Sóc đang đọc {state.images.length} ảnh…</h3>
            {state.note && <p className="pc-note">{state.note}</p>}
            <p role="status">{state.items.length ? `Đã thấy ${state.items.length} câu sai.` : 'Chưa thấy câu sai nào, Sóc đang tìm tiếp.'} Thường mất khoảng {Math.max(20, state.requestsTotal * 20)} giây.</p>
            <ul className="pc-thumbs is-read" aria-label="Ảnh đang đọc">
              {state.images.map((image, index) => (
                <li key={image.id} className={'is-' + image.status}><img src={image.url} alt={`Ảnh ${index + 1}`} />
                  {image.status === 'done' && <b className="is-ok" aria-label="Đã đọc xong">✓</b>}{image.status === 'failed' && <b aria-label="Chưa đọc được">!</b>}</li>
              ))}
            </ul>
          </div>
          <div className="pc-foot"><button type="button" className="pc-send is-quiet" onClick={close}>Đóng, báo mình sau</button></div>
        </>
      )}

      {state.phase === 'review' && (
        <>
          <div className="pc-top">
            <button type="button" className="pc-x" aria-label="Đóng" onClick={close}>×</button>
            <b>{state.items.length ? `Soát ${state.items.length} câu sai` : 'Kết quả đọc ảnh'}</b>
          </div>
          <div className="pc-rev">
            {state.restored && <p className="pc-note" role="status">Đã khôi phục các câu bạn chưa lưu lần trước.</p>}
            {state.note && <p className="pc-note">{state.note}</p>}
            {failureGroups.map(group => (
              <div key={group.message} className="pc-fail" role="alert">
                <span><b>Chưa đọc được {group.images} ảnh.</b> {group.message}</span>
                <button type="button" onClick={() => void retryAll(group.ids)}>Thử lại</button>
              </div>
            ))}
            {state.unsent > 0 && <p className="pc-note" role="status">{state.unsent} ảnh chưa được gửi, gửi ở lần chụp sau.</p>}
            {state.items.length > 0 ? (
              <ReviewList items={state.items} onToggle={toggleItem} onPatch={patchItem} onRemove={removeItem} />
            ) : !state.failures.length && (
              <div className="pc-none">
                <Soc state="idle" size={110} />
                <h3>Sóc chưa thấy câu sai nào trong ảnh</h3>
                <p>{state.rejectionReasons[0]?.detail || 'Kiểm tra lại đề, hoặc chụp trang có đánh dấu câu sai rõ hơn.'}</p>
                <button type="button" className="pc-send is-light" onClick={backToInput}>Thử ảnh khác</button>
              </div>
            )}
            {state.items.length > 0 && state.rejectionReasons.length > 0 && (
              <ul className="wd-reasons" role="status">
                {state.rejectionReasons.map((reason, idx) => <li key={`${reason.number ?? 'x'}-${idx}`}>{reason.detail}</li>)}
              </ul>
            )}
            {error && <p role="alert" className="pc-err is-light">{error}</p>}
          </div>
          {state.items.length > 0 && (
            <div className="pc-foot is-light">
              {state.items.length > 1 && <button type="button" className="pc-all" onClick={() => setAllChecked(checked.length < state.items.length)}>{checked.length < state.items.length ? 'Tick tất cả' : 'Bỏ tick tất cả'}</button>}
              <button type="button" className="pc-send" disabled={!checked.length || saving} onClick={save}>Lưu {checked.length} câu vào Sổ tay</button>
            </div>
          )}
        </>
      )}

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

      {tips && (
        <PhoneSheet title="Chụp sao cho Sóc đọc rõ" hideTitle onClose={() => { markTipsSeen(); setTips(false); }}>
          <div className="pc-tiphd"><Soc state="idle" size={54} /><div><b>Chụp sao cho Sóc đọc rõ</b><small>Chỉ hiện lần đầu · xem lại ở nút i</small></div></div>
          <div className="pc-tipcards">
            <div className="is-good"><SamplePage />Thẳng, đủ trang</div>
            <div className="is-bad"><SamplePage bad />Nghiêng, mờ</div>
          </div>
          <ul className="pc-tiplist">
            <li><em style={{ background: '#fff4d1' }}>1</em>Đủ sáng, không bị bóng hay loá màn hình</li>
            <li><em style={{ background: '#e6f1ff' }}>2</em>Cầm thẳng, trang nằm gọn trong khung</li>
            <li><em style={{ background: '#ffe9ee' }}>3</em>Thấy rõ số câu và đáp án đúng/sai</li>
          </ul>
          <button type="button" className="pc-send is-sheet" onClick={closeTips}>Hiểu rồi</button>
        </PhoneSheet>
      )}
    </div>, document.body);
}
