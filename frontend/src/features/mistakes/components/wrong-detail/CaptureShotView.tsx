import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Camera, Check, ChevronDown, ClipboardPaste, MoreHorizontal, X } from 'lucide-react';
import { Soc } from '@/shared/ui/soc/Soc';
import { clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { MAX_CAPTURE_IMAGES } from '@/features/mistakes/lib/captureBatch';
import { shotTitle, type ShotItem } from '@/features/mistakes/lib/captureShots';
import { useScreenshotWatcher } from '@/features/mistakes/hooks/useScreenshotWatcher';
import { ScreenshotSuggestBar } from './ScreenshotSuggestBar';
import { BurstCameraModal } from './BurstCameraModal';
import { StepHead } from './captureViews';
import { CaptureZone, PhotoPreview } from './CaptureZone';
import { RangeEditor, type SentThumb, type Staged, type Zone } from './views';
import './capture-v2.css';
import './capture-calm.css';

/**
 * Cần chụp, calm version (design/previews/capture-v3): wrong-number chips lead the list, one zone at a time on a phone, quick
 * input buttons under the active zone, one primary action and "Cách khác" for the rest.
 */
export type ShotState = 'done' | 'reading' | 'failed' | 'skipped' | 'open';
export interface ShotRow { item: ShotItem; state: ShotState }
export interface StripChip { key: string; label: string; status: 'reading' | 'done' | 'failed'; count: number }
export interface CurrentJob { status: 'waiting' | 'reading' | 'done' | 'failed'; seconds: number; done: number; total: number; error: string; note: string; reasons: string[] }

interface Props {
  phone: boolean; testName: string; onClose: () => void;
  rows: ShotRow[]; current: ShotItem | null; currentState: ShotState; next: ShotItem | null;
  /** Part 5's numbers still to capture (kept for the heading of a Tấm). */
  part5Open: number[];
  zones: Record<Zone, Staged[]>; activeZone: Zone; onActivateZone: (zone: Zone) => void; sent: SentThumb[];
  clarity: Record<string, ClarityResult | null>; photoMode: boolean; onPhotoMode: (value: boolean) => void;
  onAddFiles: (files: File[], zone?: Zone) => void; onCameraAdd: (files: File[], zone?: Zone) => void;
  onEditPhoto: (zone: Zone, id: string) => void; onMovePhoto: (zone: Zone, id: string, delta: -1 | 1) => void;
  onSwitchZone: (zone: Zone, id: string) => void; onRemove: (zone: Zone, id: string) => void;
  canRead: boolean; inFlight: boolean; job: CurrentJob | null; strip: StripChip[]; onRetry: (key: string) => void;
  missing: number[]; onCaptureMissing: () => ShotItem | null;
  reviewCount: number; allDone: boolean; anyReading: boolean;
  onSelect: (key: string) => void; onSend: () => void; onSkip: () => void; onManual: () => void; onReview: () => void;
  onEditRange: (from: number, to: number) => string | null;
  listeningLeft: number; onListening: () => void;
  /** After Soát saved: the hero says how many cards went to Sổ tay and offers "Ôn ngay". */
  saved: { count: number; reviewable: number } | null; onReviewSaved: () => void;
  onNotify: (text: string) => void;
  error: string; note: string;
}

const PART_TITLE = (item: ShotItem) => item.kind === 'shot' ? `Part ${item.part} · Tấm ${item.index}` : shotTitle(item);
const stateWord = (state: ShotState) => state === 'done' ? ', xong' : state === 'reading' ? ', Sóc đang đọc' : state === 'failed' ? ', chưa đọc được' : state === 'skipped' ? ', bỏ qua' : '';

function PaperToggle({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className="wd-paper-pill" aria-pressed={on} onClick={() => onChange(!on)}>
      <span className="wd-sw" aria-hidden="true"><i /></span><span>Ảnh giấy</span>
    </button>
  );
}

function MoreMenu({ items }: { items: Array<{ key: string; icon: ReactNode; title: string; sub: string; run: () => void }> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!items.length) return <span />;
  return (
    <div className="cv-more" ref={box}>
      <button type="button" className={'cv-more-b' + (open ? ' is-open' : '')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        Cách khác <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <div className="cv-menu" role="menu" aria-label="Cách khác">
          {items.map(item => (
            <button key={item.key} type="button" role="menuitem" className="cv-mi" onClick={() => { setOpen(false); item.run(); }}>
              <span className="cv-mi-i" aria-hidden="true">{item.icon}</span>
              <span className="cv-mi-t"><b>{item.title}</b><small>{item.sub}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CaptureView(props: Props) {
  const { phone, testName, onClose, rows, current, currentState, next, zones, activeZone, onActivateZone, sent, clarity, photoMode, onPhotoMode,
    onAddFiles, onCameraAdd, onEditPhoto, onMovePhoto, onSwitchZone, onRemove, canRead, inFlight, job, strip, onRetry, missing, onCaptureMissing,
    reviewCount, allDone, anyReading, onSelect, onSend, onSkip, onManual, onReview, onEditRange, listeningLeft, onListening, saved, onReviewSaved, onNotify, error, note } = props;
  const [burst, setBurst] = useState<Zone | null>(null);
  const [sheet, setSheet] = useState(false);
  const [preview, setPreview] = useState<{ zone: Zone; index: number } | null>(null);
  const [editingRange, setEditingRange] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const pickZone = useRef<Zone>('questions');
  const clip = useScreenshotWatcher(false);
  useEffect(() => { setEditingRange(false); setPreview(null); setSheet(false); }, [current?.key]);
  const staged = zones.passage.length + zones.questions.length;
  const twoZones = current?.part === 7;
  const done = rows.filter(row => row.state === 'done').length;
  // A Part 7 group needs its question photos; passage photos alone are not enough to send.
  const ready = twoZones ? zones.questions.length > 0 : staged > 0;
  const zone: Zone = twoZones ? activeZone : 'questions';
  const openCapture = (target: Zone) => {
    if (phone) setBurst(target);
    else { pickZone.current = target; pick.current?.click(); }
  };
  const captureMissing = () => {
    const item = onCaptureMissing();
    if (item) openCapture('questions');
  };
  const receive = (files: File[]) => { onAddFiles(files); if (files.length) onNotify('Đã nhận ảnh mới'); };
  const pasteFromClipboard = async () => {
    const files = await clip.readClipboardImages();
    if (files.length) receive(files);
  };

  /* ---------- the list / navigator ---------- */
  const markerOf = (state: ShotState, on: boolean): ReactNode =>
    state === 'done' ? <Check size={16} strokeWidth={3} /> : state === 'reading' ? <Soc state="think" size={30} /> : on ? <Camera size={15} /> : null;
  const numberChips = (item: ShotItem, state: ShotState, on: boolean) => (
    <span className="cv-nums-l">{item.wrong.map(number => <b key={number} className={'cv-nc' + (state === 'done' ? ' is-done' : on ? ' is-cur' : '')}>{number}</b>)}</span>
  );
  const listItems = (
    <>
      {[5, 6, 7].map(part => {
        const partRows = rows.filter(row => row.item.part === part);
        if (!partRows.length) return null;
        const count = partRows.reduce((sum, row) => sum + row.item.wrong.length, 0);
        return (
          <div key={part} className="cv-sg">
            <h4>Part {part}<span>{count} câu</span></h4>
            <ul>
              {partRows.map(({ item, state }) => {
                const on = item.key === current?.key;
                const cls = state === 'done' ? ' is-done' : state === 'reading' ? ' is-reading' : state === 'skipped' ? ' is-skipped' : '';
                return (
                  <li key={item.key}>
                    <button type="button" className={'cv-si' + cls + (on ? ' is-active' : '')} aria-current={on ? 'step' : undefined}
                      aria-label={`${shotTitle(item)}${stateWord(state)}`} onClick={() => onSelect(item.key)}>
                      <span key={state} className={'cv-tk' + (state === 'done' ? ' is-on' : state === 'reading' ? ' is-rd' : on ? ' is-cur' : '')} aria-hidden="true">{markerOf(state, on)}</span>
                      {numberChips(item, state, on)}
                      <span className="cv-rg">{item.kind === 'group' ? `Nhóm ${item.from}–${item.to}` : `Tấm ${item.index}`}</span>
                      {state === 'reading' && <em className="is-rdg">Sóc đang đọc… ~10 giây</em>}
                      {state === 'failed' && <em className="is-fail">Chưa đọc được</em>}
                      {state === 'skipped' && <em className="is-skip">bỏ qua</em>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {listeningLeft > 0 && <button type="button" className="cv-link cv-lback" onClick={onListening}>Phần Nghe còn {listeningLeft} câu · Ghi lý do</button>}
    </>
  );

  /* ---------- status rows: blurry photo, missing numbers, reading, errors ---------- */
  const allStaged = [...zones.passage, ...zones.questions];
  const badIndex = allStaged.findIndex(item => clarity[item.id]?.problem);
  const bad = badIndex >= 0 ? allStaged[badIndex] : null;
  const badText = bad ? clarityMessage(badIndex + 1, clarity[bad.id]!.problem!) : null;
  const badZone: Zone = bad && zones.passage.some(item => item.id === bad.id) ? 'passage' : 'questions';
  const blurLine = bad && badText && (
    <div className="cv-warn-row" role="status">
      <span><b>{badText.head}</b>{badText.rest}</span>
      <button type="button" className="cv-wbtn" onClick={() => { onRemove(badZone, bad.id); openCapture(badZone); }}>{phone ? 'Chụp lại' : 'Thay ảnh'}</button>
      <button type="button" className="cv-wbtn is-mut" disabled={inFlight || !ready} onClick={onSend}>Vẫn gửi</button>
    </div>
  );
  const missLine = missing.length > 0 && (
    <div className="cv-warn-row" role="status">
      <span>Còn thiếu câu <b>{missing.join(', ')}</b></span>
      <button type="button" className="cv-wbtn" onClick={captureMissing}>Chụp tiếp</button>
      <button type="button" className="cv-wbtn is-mut" onClick={onManual}>Ghi tay</button>
    </div>
  );
  const jobLine = job && (job.status === 'waiting' || job.status === 'reading')
    ? <p className="wd-reading" role="status"><Soc state="think" size={34} />{job.status === 'waiting' ? 'Chờ Sóc đọc…' : `Sóc đang đọc${job.total > 1 ? ` · lượt ${Math.min(job.done + 1, job.total)}/${job.total}` : ''} · ${job.seconds} giây`}</p>
    : job?.status === 'failed' ? <div className="wd-err" role="alert">{job.error}{job.reasons.length > 0 && <ul className="wd-reasons">{job.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}</div> : null;
  const status = (
    <>
      {blurLine}
      {missLine}
      {jobLine}
      {job?.note && <p className="wd-note">{job.note}</p>}
      {error && <p className="wd-err" role="alert">{error}</p>}
      {!error && note && <p className="wd-note" role="status">{note}</p>}
      {!canRead && <p className="wd-note">Phiên bản này chưa đọc được ảnh. Ghi tay từng câu bằng Cách khác.</p>}
    </>
  );
  const failedChips = strip.filter(chip => chip.status === 'failed').map(chip =>
    <button key={chip.key} type="button" className="cv-chip is-fail" onClick={() => onRetry(chip.key)}>{chip.label} · Thử lại</button>);
  const failedRow = failedChips.length > 0 && <div className="cv-strip" role="status" aria-label="Các nhóm đã gửi">{failedChips}</div>;

  /* ---------- zones ---------- */
  const skipLabel = current?.kind === 'shot' && current.wrong.length === 1 ? `Bỏ qua câu ${current.wrong[0]}` : current?.kind === 'shot' ? 'Bỏ qua tấm này' : 'Bỏ qua nhóm này';
  const skipSub = 'Không chụp, sang phần tiếp theo';
  const sentHere = sent;
  const zoneBase = { phone, disabled: !canRead, clarity, onAdd: onAddFiles, onActivate: onActivateZone, onRemove, onEdit: onEditPhoto, onMove: onMovePhoto };
  const zonesView = current && canRead && (twoZones && !phone ? (
    <div className="cv-zones">
      <CaptureZone {...zoneBase} zone="passage" num={1} title="Đoạn văn" items={zones.passage} active={activeZone === 'passage'} onSwitchZone={onSwitchZone}
        emptyText={activeZone === 'passage' ? 'Thả ảnh vào đây' : 'Chưa có ảnh'} />
      <CaptureZone {...zoneBase} zone="questions" num={2} title="Câu hỏi" items={zones.questions} sent={sentHere} active={activeZone === 'questions'} onSwitchZone={onSwitchZone}
        emptyText={activeZone === 'questions' ? 'Thả ảnh vào đây' : 'Chưa có ảnh'} />
    </div>
  ) : phone && twoZones ? (
    <>
      <div className="cv-seg" role="tablist" aria-label="Ô ảnh">
        <button type="button" role="tab" aria-selected={activeZone === 'passage'} className={activeZone === 'passage' ? 'is-on' : ''} onClick={() => onActivateZone('passage')}>Đoạn văn · {zones.passage.length}</button>
        <button type="button" role="tab" aria-selected={activeZone === 'questions'} className={activeZone === 'questions' ? 'is-on' : ''} onClick={() => onActivateZone('questions')}>Câu hỏi · {zones.questions.length + sentHere.length}</button>
      </div>
      <CaptureZone {...zoneBase} zone={activeZone} title={activeZone === 'passage' ? 'Đoạn văn' : 'Câu hỏi'} active items={zones[activeZone]} sent={activeZone === 'questions' ? sentHere : undefined}
        headRight={<PaperToggle on={photoMode} onChange={onPhotoMode} />} onPreview={(z, index) => setPreview({ zone: z, index })} onSwitchZone={onSwitchZone}
        onEmptyTap={() => openCapture(activeZone)}
        emptyText={activeZone === 'passage' ? 'Chụp đoạn văn, không bắt buộc' : `Chụp phần câu hỏi có câu ${current.wrong.join(', ')}`} />
    </>
  ) : (
    <CaptureZone {...zoneBase} zone="questions" title="Ảnh đã chụp" active items={zones.questions} sent={sentHere}
      headRight={phone ? <PaperToggle on={photoMode} onChange={onPhotoMode} /> : undefined} onPreview={(z, index) => setPreview({ zone: z, index })}
      onEmptyTap={() => openCapture('questions')}
      emptyText={phone ? 'Chụp cả trang có câu sai, nhiều trang cũng được' : 'Thả ảnh vào đây'} />
  ));
  const quickBar = current && canRead && !phone && (
    <ScreenshotSuggestBar enabled quick disabled={false} maxAdd={Math.max(0, MAX_CAPTURE_IMAGES - staged)} onAddFiles={receive}
      onPick={() => openCapture(zone)} />
  );

  /* ---------- menus ---------- */
  const menuItems = current ? [
    ...(phone && canRead ? [{ key: 'paste', icon: <ClipboardPaste size={18} />, title: 'Dán ảnh vừa chụp', sub: 'Lấy ảnh bạn vừa chụp màn hình hoặc sao chép', run: () => void pasteFromClipboard() }] : []),
    { key: 'manual', icon: <span>✎</span>, title: current.kind === 'group' || current.wrong.length > 1 ? 'Ghi tay câu này' : 'Ghi tay câu này', sub: 'Gõ số câu và đáp án thay vì chụp', run: onManual },
    ...(canRead ? [{ key: 'skip', icon: <span>⏭</span>, title: skipLabel, sub: skipSub, run: onSkip }] : []),
    ...(current.part === 7 ? [{ key: 'range', icon: <span>↔</span>, title: 'Đổi dải câu', sub: 'Sửa câu bắt đầu và kết thúc của nhóm', run: () => setEditingRange(true) }] : []),
    ...(staged > 0 && reviewCount > 0 ? [{ key: 'review', icon: <Check size={18} />, title: `Soát ${reviewCount} câu`, sub: 'Xem lại các câu Sóc đã đọc', run: onReview }] : []),
    ...(phone && listeningLeft > 0 ? [{ key: 'listening', icon: <span>🎧</span>, title: `Phần Nghe còn ${listeningLeft} câu`, sub: 'Ghi lý do cho các câu Nghe', run: onListening }] : [])
  ] : [];
  const rangeEdit = current?.part === 7 && editingRange && <RangeEditor group={current} onSave={onEditRange} onCancel={() => setEditingRange(false)} />;

  /* ---------- the one primary action ---------- */
  const reviewTone = allDone && !anyReading ? 'rd-btn--green' : 'rd-btn--white';
  const nextWord = !current ? '' : next ? (next.kind === 'group' ? 'Nhóm tiếp' : 'Tấm tiếp') : current.kind === 'group' ? 'Nhóm cuối' : 'Tấm cuối';
  const sendLabel = `Gửi Sóc đọc${next ? ` · ${nextWord}` : current ? ` · ${nextWord}` : ''}`;
  const hasWait = !!job && (job.status === 'waiting' || job.status === 'reading');
  const hint = !staged && !hasWait ? (twoZones ? 'Thêm ảnh câu hỏi để gửi' : 'Thêm ảnh để gửi')
    : staged && !ready ? 'Cần ảnh câu hỏi để gửi' : '';
  const showHero = Boolean(current) && !staged && (saved !== null || (allDone && reviewCount > 0 && currentState === 'done'));
  const hasBlur = Boolean(bad);

  const burstModal = burst && <BurstCameraModal maxPhotos={Math.max(1, MAX_CAPTURE_IMAGES - staged)} title={burst === 'passage' ? 'Đoạn văn' : 'Câu hỏi'}
    onClose={() => setBurst(null)} onComplete={files => { const target = burst; setBurst(null); onCameraAdd(files, target); }} />;
  const hiddenPicker = <input ref={pick} type="file" accept="image/*" multiple hidden aria-label="Chọn ảnh chụp tiếp"
    onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; onAddFiles(files, pickZone.current); }} />;

  const hero = saved
    ? <div className="cv-hero is-saved"><Soc state="yay" size={phone ? 150 : 140} /><div className="wd-conf is-small" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
        <h3>Đã lưu {saved.count} thẻ vào Sổ tay</h3><p>Sóc xếp sẵn lịch ôn cho bạn</p></div>
    : <div className="cv-hero"><Soc state="yay" size={phone ? 150 : 140} /><div className="wd-conf is-small" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
        <h3>{reviewCount} câu sai đã sẵn sàng thành thẻ</h3><p>Soát nhanh rồi lưu vào Sổ tay</p></div>;
  const heroAction = saved
    ? (saved.reviewable > 0
      ? <button type="button" className="rd-btn rd-btn--green wd-main cv-main" onClick={onReviewSaved}>Ôn ngay {saved.reviewable} câu<ArrowRight size={18} aria-hidden="true" /></button>
      : <button type="button" className="rd-btn rd-btn--green wd-main cv-main" onClick={onClose}>Xong</button>)
    : <button type="button" className={`rd-btn ${reviewTone} wd-main cv-main`} onClick={onReview}>Soát {reviewCount} câu<ArrowRight size={18} aria-hidden="true" /></button>;

  /* ---------- phone ---------- */
  if (phone) {
    const title = !current ? 'Cần chụp' : PART_TITLE(current);
    const nav = (
      <div className="cv-nav" role="group" aria-label="Cần chụp">
        {rows.map(({ item, state }) => {
          const on = item.key === current?.key;
          return (
            <button key={item.key} type="button" className={'cv-pill' + (on ? ' is-cur' : '') + (state === 'done' ? ' is-done' : state === 'reading' ? ' is-reading' : '')}
              aria-current={on ? 'step' : undefined} aria-label={`${shotTitle(item)}${stateWord(state)}`} onClick={() => onSelect(item.key)}>
              <i className="cv-sd" aria-hidden="true" />{item.wrong.join('·')}
            </button>
          );
        })}
      </div>
    );
    let primary: ReactNode;
    let under: ReactNode = null;
    if (!canRead && current) primary = <button type="button" className="rd-btn rd-btn--pink cv-wide" onClick={onManual}>✎ Ghi tay</button>;
    else if (showHero) primary = saved
      ? <button type="button" className="rd-btn rd-btn--green cv-wide" onClick={saved.reviewable > 0 ? onReviewSaved : onClose}>{saved.reviewable > 0 ? `Ôn ngay ${saved.reviewable} câu` : 'Xong'}</button>
      : <button type="button" className={`rd-btn ${reviewTone} cv-wide`} onClick={onReview}>Soát {reviewCount} câu</button>;
    else if (!current) primary = reviewCount > 0 ? <button type="button" className={`rd-btn ${reviewTone} cv-wide`} onClick={onReview}>Soát {reviewCount} câu</button> : null;
    else if (hasBlur && bad) {
      const index = allStaged.findIndex(item => item.id === bad.id) + 1;
      primary = <button type="button" className="rd-btn rd-btn--pink cv-wide" onClick={() => { onRemove(badZone, bad.id); openCapture(badZone); }}><Camera size={19} aria-hidden="true" />Chụp lại ảnh {index}</button>;
      under = <p className="cv-under"><span>Ảnh {index} {clarity[bad.id]?.problem === 'dark' ? 'hơi tối' : 'hơi mờ'}</span><button type="button" className="cv-wbtn" disabled={inFlight || !ready} onClick={onSend}>Vẫn gửi</button></p>;
    } else if (ready) {
      primary = <button type="button" className="rd-btn rd-btn--pink cv-wide" disabled={inFlight} onClick={onSend}>{sendLabel}<ArrowRight size={18} aria-hidden="true" /></button>;
      under = <button type="button" className="rd-btn rd-btn--white cv-wide cv-again" disabled={staged >= MAX_CAPTURE_IMAGES} onClick={() => openCapture(zone)}><Camera size={19} aria-hidden="true" />Chụp tiếp</button>;
    } else if (twoZones && staged > 0) {
      primary = <button type="button" className="rd-btn rd-btn--pink cv-wide" onClick={() => { onActivateZone('questions'); openCapture('questions'); }}><Camera size={19} aria-hidden="true" />Chụp câu hỏi</button>;
      under = <p className="cv-tiny">Cần ảnh câu hỏi để gửi</p>;
    } else if (!staged && reviewCount > 0 && allDone) primary = <button type="button" className={`rd-btn ${reviewTone} cv-wide`} onClick={onReview}>Soát {reviewCount} câu</button>;
    else primary = <button type="button" className="rd-btn rd-btn--pink cv-wide" disabled={staged >= MAX_CAPTURE_IMAGES} onClick={() => openCapture(zone)}><Camera size={19} aria-hidden="true" />Chụp hoặc chọn ảnh</button>;
    const previewZone = preview ? zones[preview.zone] : [];
    return (
      <>
        <header className="cv-head is-phone">
          <button type="button" className="cv-hbtn" aria-label="Đóng" onClick={onClose}><X aria-hidden="true" /></button>
          <h2 id="wd-title">{showHero && saved ? 'Đã lưu' : showHero ? 'Xong hết' : title}</h2>
          {menuItems.length > 0 && <button type="button" className="cv-hbtn cv-dots-b" aria-label="Thêm lựa chọn" aria-haspopup="dialog" onClick={() => setSheet(true)}><MoreHorizontal aria-hidden="true" /></button>}
        </header>
        {nav}
        <div className="wd-body cv-body cv-pbody">
          {failedRow}
          {showHero ? hero : <>
            {zonesView}
            {rangeEdit}
            {status}
          </>}
        </div>
        <footer className="cv-pfoot cv-bar">
          {primary}
          {under}
        </footer>
        {sheet && (
          <div className="cv-sheet" onClick={() => setSheet(false)}>
            <div className="cv-sheet-b" role="dialog" aria-label="Thêm lựa chọn" onClick={event => event.stopPropagation()}>
              <span className="cv-grab" aria-hidden="true" />
              {menuItems.map(item => (
                <button key={item.key} type="button" className="cv-mi" onClick={() => { setSheet(false); item.run(); }}>
                  <span className="cv-mi-i" aria-hidden="true">{item.icon}</span>
                  <span className="cv-mi-t"><b>{item.title}</b><small>{item.sub}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}
        {preview && previewZone.length > 0 && (
          <PhotoPreview zone={preview.zone} items={previewZone} start={preview.index} twoZones={twoZones}
            onClose={() => setPreview(null)} onRemove={id => onRemove(preview.zone, id)} onSwitch={id => onSwitchZone(preview.zone, id)}
            onEdit={id => { onEditPhoto(preview.zone, id); }} />
        )}
        {hiddenPicker}{burstModal}
      </>
    );
  }

  /* ---------- desktop ---------- */
  let main: ReactNode;
  if (showHero) main = heroAction;
  else if (staged) main = <button type="button" className="rd-btn rd-btn--pink wd-main cv-main" disabled={inFlight || !ready} onClick={onSend}>{sendLabel}<ArrowRight size={18} aria-hidden="true" /></button>;
  else if (reviewCount > 0) main = <button type="button" className={`rd-btn ${reviewTone} wd-main cv-main`} onClick={onReview}>Soát {reviewCount} câu<ArrowRight size={18} aria-hidden="true" /></button>;
  else main = <button type="button" className="rd-btn rd-btn--pink wd-main cv-main" disabled>{sendLabel}<ArrowRight size={18} aria-hidden="true" /></button>;
  const actionHint = showHero ? '' : !staged && reviewCount > 0 ? '' : hint;
  return (
    <>
      <StepHead phone={false} title="Chụp câu sai" sub={testName} step={3} onClose={onClose} />
      <div className="wd-body cv-body">
        <div className="cv-cap">
          <nav className="cv-list" aria-label="Cần chụp">
            <h3>Cần chụp <span>{done}/{rows.length}</span></h3>
            {listItems}
          </nav>
          {current && (
            <section className="cv-tray" aria-label={PART_TITLE(current)}>
              <div className="cv-trow">
                <h3>{PART_TITLE(current)}</h3>
                <span className="wd-sp" />
                {canRead && !showHero && <PaperToggle on={photoMode} onChange={onPhotoMode} />}
                {canRead && twoZones && !showHero && <span className="cv-hintk">đổi ô <kbd>1</kbd><kbd>2</kbd></span>}
              </div>
              {failedRow}
              {rangeEdit}
              {showHero ? <>{hero}{status}</> : <>
                {blurLine}
                {zonesView}
                {quickBar}
                {missLine}
                {jobLine}
                {job?.note && <p className="wd-note">{job.note}</p>}
                {error && <p className="wd-err" role="alert">{error}</p>}
                {!error && note && <p className="wd-note" role="status">{note}</p>}
                {!canRead && <p className="wd-note">Phiên bản này chưa đọc được ảnh. Ghi tay từng câu bằng Cách khác.</p>}
              </>}
              <div className="cv-act">
                {showHero ? <span /> : <MoreMenu items={menuItems} />}
                <span className="wd-sp" />
                {actionHint && <span className="cv-ahint">{actionHint}</span>}
                {main}
              </div>
            </section>
          )}
        </div>
      </div>
      {hiddenPicker}{burstModal}
    </>
  );
}
