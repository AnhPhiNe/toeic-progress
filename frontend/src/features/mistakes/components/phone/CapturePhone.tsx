import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { Soc } from '@/shared/ui/soc/Soc';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { testNameKey, normalizeTestName } from '@/features/mistakes/lib/sourceTests';
import { MAX_CAPTURE_IMAGES } from '@/features/mistakes/lib/captureBatch';
import { latestTestName, questionsToFind } from '@/features/mistakes/lib/captureContext';
import { checkPhotoClarity, clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { addFiles, backToInput, captureState, closeCapture, openCapture, patchItem, removeImage, removeItem, resetCapture, retryFailure,
  setAllChecked, setTestName, startReading, subscribeCapture, toggleItem } from '@/features/mistakes/services/captureSession';
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
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
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
    // Opening the camera right away only works where the browser still counts the tap that opened this screen.
    if (tipsSeen() && current.phase === 'input' && !current.images.length) camera.current?.click();
    // Opening runs once; later changes of the lists must not overwrite the learner's pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every new photo is measured on this phone; nothing is sent and no AI use is spent.
  const measured = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    for (const image of state.images) {
      if (measured.current.has(image.id)) continue;
      measured.current.add(image.id);
      void checkPhotoClarity(image.dataUrl).then(result => { if (alive.current) setClarity(previous => ({ ...previous, [image.id]: result })); });
    }
  }, [state.images]);

  const testName = normalizeTestName(state.testName);
  const plan = useMemo(() => questionsToFind(sessions, testName), [sessions, testName]);
  const full = state.images.length >= MAX_CAPTURE_IMAGES;
  const checked = state.items.filter(item => item.checked);
  const problemIndex = state.images.findIndex(image => clarity[image.id]?.problem);
  const problem = problemIndex >= 0 ? clarity[state.images[problemIndex].id]!.problem! : null;
  const message = problem ? clarityMessage(problemIndex + 1, problem) : null;
  const preview = state.images[state.images.length - 1];

  const pickFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length) void addFiles(files);
  };
  const retake = () => { if (problemIndex >= 0) removeImage(state.images[problemIndex].id); camera.current?.click(); };
  const startCamera = () => { markTipsSeen(); setTips(false); camera.current?.click(); };
  const send = () => {
    if (!state.images.length || !testName || state.adding) return;
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

  const failureGroups = useMemo(() => {
    const groups = new Map<string, { message: string; ids: string[]; images: number }>();
    for (const failure of state.failures) {
      const group = groups.get(failure.message) ?? { message: failure.message, ids: [], images: 0 };
      group.ids.push(failure.id); group.images += failure.imageIds.length; groups.set(failure.message, group);
    }
    return [...groups.values()];
  }, [state.failures]);
  const retryAll = async (ids: string[]) => { for (const id of ids) await retryFailure(id); };

  const fileInputs = (
    <>
      <input ref={camera} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden aria-label="Chụp ảnh trang chữa bài" onChange={pickFiles} />
      <input ref={gallery} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Chọn ảnh từ thư viện" onChange={pickFiles} />
    </>
  );

  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Chụp trang chữa bài" tabIndex={-1} className={'rd pc' + (state.phase === 'review' ? ' is-light' : '')}>
      {state.phase === 'input' && (
        <>
          <div className="pc-top">
            <button type="button" className="pc-x" aria-label="Đóng" onClick={close}>×</button>
            <b>Chụp trang chữa bài</b>
            <button type="button" className="pc-i" aria-label="Mẹo chụp rõ" onClick={() => setTips(true)}>i</button>
          </div>
          <div className="pc-test"><TestSelect value={state.testName} names={sourceSuggestions} onChange={setTestName} /></div>
          <div className="pc-vf">
            {preview ? <img src={preview.dataUrl} alt="Ảnh vừa chụp" /> : (
              <div className="pc-empty"><Soc state="idle" size={84} /><p>Bấm nút tròn để chụp trang chữa bài</p><small>Chỉ Part 5–7 (câu 101–200)</small></div>
            )}
            <span className="pc-corner is-tl" /><span className="pc-corner is-tr" /><span className="pc-corner is-bl" /><span className="pc-corner is-br" />
          </div>
          {state.images.length > 0 && (
            <ul className="pc-thumbs" aria-label="Ảnh đã chụp">
              {state.images.map((image, index) => {
                const bad = Boolean(clarity[image.id]?.problem);
                return (
                  <li key={image.id} className={bad ? 'is-warn' : ''}>
                    <img src={image.dataUrl} alt={`Ảnh ${index + 1}`} />
                    {bad ? <b aria-label="Ảnh chưa rõ">!</b> : null}
                    <button type="button" aria-label={`Bỏ ảnh ${index + 1}`} onClick={() => removeImage(image.id)}>×</button>
                  </li>
                );
              })}
              <li className="pc-count">{state.images.length} trang<br />{full ? 'đủ ảnh một lượt' : 'chụp thêm hoặc gửi'}</li>
            </ul>
          )}
          {message && (
            <div className="pc-warn" role="status"><div><b>{message.head}</b>{message.rest}</div><button type="button" onClick={retake}>Chụp lại</button></div>
          )}
          {(error || state.error) && <p role="alert" className="pc-err">{error || state.error}</p>}
          {state.overflow && <p className="pc-err" role="status">Gửi {MAX_CAPTURE_IMAGES} ảnh trước, phần còn lại gửi lần sau.</p>}
          <div className="pc-ctl">
            <button type="button" className="pc-side" onClick={() => gallery.current?.click()} disabled={state.adding || full}>Thư viện</button>
            <button type="button" className="pc-shoot" aria-label="Chụp ảnh" onClick={() => camera.current?.click()} disabled={state.adding || full} />
            <button type="button" className="pc-side" onClick={() => { closeCapture(); onManual(); }}>Tự gõ</button>
          </div>
          <div className="pc-foot">
            <button type="button" className="pc-send" disabled={!state.images.length || !testName || state.adding} onClick={send}>
              {state.adding ? 'Đang xử lý ảnh…' : state.images.length && !testName ? 'Chọn đề trước khi gửi' : state.images.length ? `Gửi Sóc đọc ${state.images.length} trang · 1 lượt AI` : 'Chụp ít nhất một trang'}
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
            <p role="status">{state.items.length ? `Đã thấy ${state.items.length} câu sai.` : 'Chưa thấy câu sai nào, Sóc đang tìm tiếp.'} Thường mất khoảng {Math.max(20, state.requestsTotal * 20)} giây.</p>
            <ul className="pc-thumbs is-read" aria-label="Ảnh đang đọc">
              {state.images.map((image, index) => (
                <li key={image.id} className={'is-' + image.status}><img src={image.dataUrl} alt={`Ảnh ${index + 1}`} />
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
                <p>Kiểm tra lại đề, hoặc chụp trang có đánh dấu câu sai rõ hơn.</p>
                <button type="button" className="pc-send is-light" onClick={backToInput}>Thử ảnh khác</button>
              </div>
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

      {fileInputs}
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
          <button type="button" className="pc-send is-sheet" onClick={startCamera}>Hiểu rồi, mở camera</button>
        </PhoneSheet>
      )}
    </div>, document.body);
}
