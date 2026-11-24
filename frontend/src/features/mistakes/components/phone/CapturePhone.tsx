import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Camera, Layers, Loader2, MoreHorizontal } from 'lucide-react';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { Soc } from '@/shared/ui/soc/Soc';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { testNameKey, normalizeTestName } from '@/features/mistakes/lib/sourceTests';
import { partOfQuestion } from '@/shared/domain/questionNumbers';
import { MAX_CAPTURE_IMAGES, isRightAnswer } from '@/features/mistakes/lib/captureBatch';
import { captureQuestions, defaultCapturePart, latestTestName, questionsToFind } from '@/features/mistakes/lib/captureContext';
import { isGroupedPart, suggestGroups, updatePart7Range, type CustomRangeMap } from '@/features/mistakes/lib/wrongDetail';
import * as aiService from '@/features/mistakes/services/aiMistakeExtractor';
import { CapturePartInput, type CapturePartControls } from '@/features/mistakes/components/wrong-detail/CapturePartInput';
import { PhotoReview } from '@/features/mistakes/components/PhotoReview';
import { checkPhotoClarity, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { fileExifOrientation } from '@/features/mistakes/lib/imageInput';
import { addFiles, backToInput, cancelReading, captureState, clearSavedItems, closeCapture, getImageFile, moveImage, moveImageToZone, openCapture, openReview, patchItem,
  queueAndContinue, removeImage, removeItem, removeUncheckedItems, replaceImageFile, resetCapture, retryFailure,
  setActiveZone, setAllChecked, setGroup, setPart, setPhotoMode, setTestName, startReading, subscribeCapture, toggleItem } from '@/features/mistakes/services/captureSession';
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

/** "Chụp trang chữa bài" on phones: straight to Auto-Part burst camera/gallery, on-device clarity check, continuous batch queue. */
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
  const controls = useRef<CapturePartControls | null>(null);
  const [sheet, setSheet] = useState(false);
  const close = useCallback(() => { if (editingId) { setEditingId(null); return; } closeCapture(); onClose(); }, [editingId, onClose]);
  const ref = useModalA11y(true, close);

  useEffect(() => {
    openCapture();
    const current = captureState();
    let effectiveName = normalizeTestName(current.testName);
    if (!effectiveName && current.phase === 'input') {
      effectiveName = normalizeTestName(initialTestName) || latestTestName(sessions) || sourceSuggestions[0] || '';
      if (effectiveName) setTestName(effectiveName);
    }
    if (current.phase === 'input' && !current.images.length && !current.items.length && !current.activeJobs && effectiveName) {
      setPart(defaultCapturePart(questionsToFind(sessions, effectiveName, mistakes)));
    }
    // Opening runs once; later changes of the lists must not overwrite the learner's pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void aiService.getAIConfiguration().then(value => { if (!cancelled) setContextSupported(value.pageContextImages !== false); }).catch(() => {});
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
      const file = getImageFile(image.id);
      if (file) {
        void fileExifOrientation(file).then(orientation => {
          if (alive.current && orientation !== 1) setPhotoMode(true);
        });
      }
      void checkPhotoClarity(image.url).then(result => {
        if (!alive.current) return;
        setClarity(previous => ({ ...previous, [image.id]: result }));
        if (result?.problem) setPhotoMode(true);
      });
    }
  }, [state.images]);

  const testName = normalizeTestName(state.testName);
  const plan = useMemo(() => questionsToFind(sessions, testName, mistakes), [sessions, testName, mistakes]);
  const full = state.images.length >= MAX_CAPTURE_IMAGES;
  const sendReady = state.part === 7 ? state.images.some(image => image.zone === 'questions') : state.images.length > 0;
  const checked = state.items.filter(item => item.checked);
  const hasQueueStatus = state.activeJobs > 0 || state.items.length > 0 || state.failures.length > 0;
  const problemIndex = state.images.findIndex(image => clarity[image.id]?.problem);
  const problem = problemIndex >= 0 ? clarity[state.images[problemIndex].id]!.problem! : null;
  const partGroups = useMemo(() => {
    if (!isGroupedPart(state.part)) return [];
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
  const editingFile = editingId ? getImageFile(editingId) : undefined;
  const editPart7Range = (oldFrom: number, from: number, to: number): string | null => {
    const res = updatePart7Range(customPart7Ranges, oldFrom, from, to);
    if ('error' in res) return res.error;
    setCustomPart7Ranges(res.next);
    setGroup(from);
    return null;
  };

  const passageOnly = state.part === 7 && state.images.length > 0 && !sendReady;
  const closeTips = () => { markTipsSeen(); setTips(false); };
  const send = () => {
    if (!sendReady || !testName) return;
    setError('');
    void startReading({ questions: captureQuestions(plan, state.part, groupRange), getToken, contextSupported });
  };

  const sendAndContinue = () => {
    if (!sendReady || !testName) return;
    setError('');
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
      const baseMsg = `Đã lưu ${result.saved} câu sai${result.explanationsQueued ? '' : '. Chưa xếp được lời giải AI; bạn có thể mở thẻ để bổ sung.'}`;
      if (keepOpen || state.activeJobs > 0) {
        clearSavedItems(checked.map(item => item.id));
        onSaved(!keepOpen && state.activeJobs > 0 ? `${baseMsg} · Sóc vẫn đang đọc nền ${state.activeJobs} mẻ nữa.` : baseMsg);
      } else {
        resetCapture(); closeCapture();
        onSaved(baseMsg);
        onClose();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chưa lưu được các câu sai. Bản nháp vẫn được giữ; hãy thử lại.');
    } finally { setSaving(false); }
  };

  const failureGroups = useMemo(() => {
    const groups = new Map<string, { message: string; ids: string[]; images: number }>();
    for (const failure of state.failures) {
      const group = groups.get(failure.message) ?? { message: failure.message, ids: [], images: 0 };
      group.ids.push(failure.id); group.images += failure.imageCount || failure.imageIds.length; groups.set(failure.message, group);
    }
    return [...groups.values()];
  }, [state.failures]);
  const retryAll = async (ids: string[]) => { for (const id of ids) await retryFailure(id); };

  const badImage = problemIndex >= 0 ? state.images[problemIndex] : null;
  const wide = 'pc-send';
  let primary: ReactNode;
  let under: ReactNode = null;
  if (!testName && state.images.length) primary = <button type="button" className={wide} disabled>Chọn đề trước khi gửi</button>;
  else if (badImage) primary = <button type="button" className={wide} onClick={() => { removeImage(badImage.id); controls.current?.open(badImage.zone); }}><Camera className="h-5 w-5" aria-hidden="true" /> Chụp lại ảnh {problemIndex + 1}</button>;
  else if (sendReady) {
    primary = <button type="button" className={wide} onClick={send}>Gửi Sóc đọc <ArrowRight className="h-5 w-5" aria-hidden="true" /></button>;
    under = <button type="button" className={wide + ' is-outline'} disabled={full} onClick={() => controls.current?.open()}><Camera className="h-5 w-5" aria-hidden="true" /> Chụp tiếp</button>;
  } else if (passageOnly) {
    primary = <button type="button" className={wide} onClick={() => { setActiveZone('questions'); controls.current?.open('questions'); }}><Camera className="h-5 w-5" aria-hidden="true" /> Chụp câu hỏi</button>;
    under = <p className="pc-tiny">Cần ảnh câu hỏi để gửi</p>;
  } else primary = <button type="button" className={wide} disabled={full} onClick={() => controls.current?.open()}><Camera className="h-5 w-5" aria-hidden="true" /> Chụp hoặc chọn ảnh</button>;

  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Chụp trang chữa bài" tabIndex={-1} className={'rd pc' + (state.phase !== 'reading' ? ' is-light' : '')}>
      {state.phase === 'input' && (
        <>
          <div className="pc-top">
            <button type="button" className="pc-x" aria-label="Đóng" onClick={close}>×</button>
            <b>Chụp trang chữa bài</b>
            <button type="button" className="pc-i" aria-label="Mẹo chụp rõ" onClick={() => setTips(true)}>i</button>
            <button type="button" className="pc-i" aria-label="Thêm lựa chọn" aria-haspopup="dialog" onClick={() => setSheet(true)}><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          {hasQueueStatus && (
            <div className="pc-queue" role="status" aria-live="polite">
              {state.activeJobs > 0
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#7c5ce0]" aria-hidden="true" />
                : <Layers className="h-4 w-4 shrink-0 text-[#d64570]" aria-hidden="true" />}
              <span>
                {state.activeJobs > 0
                  ? <><b>Đang đọc {state.activeJobs} mẻ</b> ({state.queuedImagesCount} ảnh){state.items.length > 0 ? ` · ${state.items.length} câu` : ''}</>
                  : state.items.length > 0
                    ? <><b>Đã xong {state.items.length} câu</b> chờ soát</>
                    : <><b>Có {state.failures.length} ảnh</b> cần thử lại</>}
              </span>
              <button type="button" onClick={openReview}>
                <span>Soát</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="pc-test"><TestSelect value={state.testName} names={sourceSuggestions} onChange={setTestName} /></div>
          <div className="pc-part">
            <CapturePartInput phone controlsRef={controls} part={state.part} group={state.group} customPart7Ranges={customPart7Ranges} images={state.images}
              activeZone={state.activeZone} onActiveZone={setActiveZone} onSwitchZone={moveImageToZone}
              logged={plan.logged ? plan.questions : null} photoMode={state.photoMode} clarity={clarity}
              onPart={setPart} onGroup={setGroup} onEditPart7Range={editPart7Range} onPhotoMode={setPhotoMode}
              onAdd={addFiles} onCameraAdd={(files, zone) => { if (files.length) setPhotoMode(true); addFiles(files, zone); }}
              onEditImage={setEditingId} onMoveImage={moveImage} onRemove={removeImage} />
          </div>
          {problemIndex >= 0 && (
            <div className="cv-warn-row" role="status">
              <span>Ảnh {problemIndex + 1} {problem === 'dark' ? 'hơi tối' : 'hơi mờ'}</span>
              <button type="button" className="cv-wbtn is-mut" disabled={!sendReady || !testName} onClick={send}>Vẫn gửi</button>
            </div>
          )}
          {(error || state.error) && <p role="alert" className="pc-err">{error || state.error}</p>}
          {(state.overflow || full) && <p className="pc-err" role="status">Mỗi lần gửi tối đa {MAX_CAPTURE_IMAGES} ảnh.</p>}
          <div className="pc-foot is-calm">
            {primary}
            {under}
          </div>
        </>
      )}

      {state.phase === 'reading' && (
        <>
          <div className="pc-top"><button type="button" className="pc-x" aria-label="Đóng" onClick={close}>×</button><b>Sóc đang đọc</b></div>
          <div className="pc-read">
            <Soc state="think" size={150} />
            <h3>{state.solving ? 'Sóc đang tự giải & đối chiếu…' : state.images.length ? `Sóc đang đọc ${state.images.length} ảnh…` : 'Sóc đang đọc lại ảnh…'}</h3>
            {state.note && <p className="pc-note">{state.note}</p>}
            <p role="status">{state.solving && state.items.length
              ? `Đã đọc ${state.items.length} câu, Sóc đang tự giải và đối chiếu đáp án.`
              : state.items.length ? `Đã thấy ${state.items.length} câu.` : 'Đang quét câu hỏi trên ảnh.'} Thường mất khoảng {Math.max(20, state.requestsTotal * 20)} giây.</p>
            <ul className="pc-thumbs is-read" aria-label="Ảnh đang đọc">
              {state.images.map((image, index) => (
                <li key={image.id} className={'is-' + image.status}><img src={image.url} alt={`Ảnh ${index + 1}`} />
                  {image.status === 'done' && <b className="is-ok" aria-label="Đã đọc xong">✓</b>}{image.status === 'failed' && <b aria-label="Chưa đọc được">!</b>}</li>
              ))}
            </ul>
          </div>
          <div className="pc-foot">
            <button type="button" className="pc-send is-quiet" onClick={close}>Đóng, báo mình sau</button>
            <button type="button" className="pc-all is-dark" onClick={cancelReading}>← Hủy, chọn ảnh lại</button>
          </div>
        </>
      )}

      {state.phase === 'review' && (
        <>
          <div className="pc-top">
            <button type="button" className="pc-x" aria-label="Đóng" onClick={close}>×</button>
            <b>{state.items.length ? (state.items.some(item => isRightAnswer(item.draft)) ? `Soát ${state.items.length} câu đã đọc` : `Soát ${state.items.length} câu sai`) : 'Kết quả đọc ảnh'}</b>
          </div>
          <div className="pc-rev">
            {state.activeJobs > 0 && (
              <div className="pc-queue is-rev" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#7c5ce0]" aria-hidden="true" />
                <span><b>Sóc đang đọc nền {state.activeJobs} mẻ</b> ({state.queuedImagesCount} ảnh) — câu mới sẽ tự hiện thêm.</span>
              </div>
            )}
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
            ) : !state.failures.length && state.activeJobs === 0 && (
              <div className="pc-none">
                <Soc state="idle" size={110} />
                <h3>Sóc chưa thấy câu sai nào trong ảnh</h3>
                <p>{state.rejectionReasons[0]?.detail || 'Kiểm tra lại đề, hoặc chụp trang có đánh dấu câu sai rõ hơn.'}</p>
                <button type="button" className="pc-send is-light" onClick={() => backToInput(false)}>Thử ảnh khác</button>
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
              <div className="pc-foot-tools">
                <button type="button" className="pc-all" onClick={() => backToInput(true)}>+ Chụp thêm</button>
                {state.items.length > 1 && <button type="button" className="pc-all" onClick={() => setAllChecked(checked.length < state.items.length)}>{checked.length < state.items.length ? 'Tick tất cả' : 'Bỏ tick tất cả'}</button>}
                {state.items.length > checked.length && <button type="button" className="pc-all is-danger" onClick={removeUncheckedItems}>Xóa {state.items.length - checked.length} câu chưa tick</button>}
              </div>
              {!checked.length && state.items.every(item => isRightAnswer(item.draft))
                ? <button type="button" className="pc-send" onClick={() => backToInput(false)}>Xong · Chụp trang khác</button>
                : (
                  <div className="pc-rev-acts">
                    {checked.length > 0 && (
                      <button type="button" className="pc-send is-light is-half" disabled={saving} onClick={() => saveItems(true)}>Lưu &amp; chụp tiếp</button>
                    )}
                    <button type="button" className="pc-send" disabled={!checked.length || saving} onClick={() => saveItems(false)}>Lưu {checked.length} câu vào Sổ tay</button>
                  </div>
                )}
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

      {sheet && (
        <PhoneSheet title="Thêm lựa chọn" hideTitle onClose={() => setSheet(false)}>
          <div className="pc-menu">
            <button type="button" onClick={() => { setSheet(false); closeCapture(); onManual(); }}><b>Tự gõ một câu</b><small>Gõ câu hỏi và đáp án thay vì chụp</small></button>
            {sendReady && Boolean(testName) && <button type="button" onClick={() => { setSheet(false); sendAndContinue(); }}><b>Gửi &amp; chụp tiếp</b><small>Gửi mẻ này, Sóc đọc nền, chụp nhóm tiếp theo</small></button>}
          </div>
        </PhoneSheet>
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
