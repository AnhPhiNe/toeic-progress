import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, ChevronRight, ImageIcon, X } from 'lucide-react';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import type { ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { isRightForm, openDoubt, type CardForm } from '@/features/mistakes/lib/detailForm';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { MAX_CAPTURE_IMAGES } from '@/features/mistakes/lib/captureBatch';
import { LISTENING_REASONS, listeningReasonShort, shotRange, shotSub, shotTitle, type Doubt, type ShotItem } from '@/features/mistakes/lib/captureShots';
import { ScreenshotSuggestBar } from './ScreenshotSuggestBar';
import { BurstCameraModal } from './BurstCameraModal';
import { chosenOf, DropZone, ONE_SHOT_HINT, RangeEditor, ReasonChips, RowDetail, Sheet, type SentThumb, type Staged, type Zone } from './views';
import './capture-v2.css';

/**
 * Capture v2 (design/previews/capture-v2): Listening reasons for several numbers at once, the "Cần chụp" shot list
 * with one tray, Part 7 groups sent one after another, and one Soát for everything Sóc read.
 */
interface Base { phone: boolean; testName: string; onClose: () => void }
/** Ghi đề (done) → Nghe → Chụp → Soát. */
export type Step = 2 | 3 | 4;

export function StepHead({ phone, title, sub, step, back, onClose }: { phone: boolean; title: string; sub?: ReactNode; step: Step; back?: () => void; onClose: () => void }) {
  const steps = <span className={phone ? 'cv-dots' : 'cv-steps'} aria-hidden="true">{[1, 2, 3, 4].map(index => <i key={index} className={index <= step ? 'is-on' : ''} />)}</span>;
  if (phone) {
    return (
      <header className="cv-head is-phone">
        <button type="button" className="cv-hbtn" aria-label={back ? 'Quay lại' : 'Đóng'} onClick={back ?? onClose}>{back ? <ArrowLeft aria-hidden="true" /> : <X aria-hidden="true" />}</button>
        <h2 id="wd-title">{title}{sub && <small>{sub}</small>}</h2>
        {steps}
      </header>
    );
  }
  return (
    <>
      <header className="cv-head">
        <h2 id="wd-title">{title}</h2>
        {sub && <span className="cv-sub">{sub}</span>}
        <span className="wd-sp" />
        <button type="button" className="wd-x" aria-label="Đóng" onClick={onClose}><X aria-hidden="true" size={18} /></button>
      </header>
      {steps}
    </>
  );
}

/* ---------- Listening: one reason for several numbers ---------- */

export function ListeningView({ phone, onClose, cards, recorded, suggested, error, onAssign, onSkip }: Base & {
  cards: MistakeEntry[]; recorded: (card: MistakeEntry) => boolean; suggested: ErrorCategory; error: string;
  onAssign: (ids: string[], category: ErrorCategory) => void; onSkip: () => void;
}) {
  const open = useMemo(() => cards.filter(card => !recorded(card)), [cards, recorded]);
  const openKey = open.map(card => card.questionNumber).join(',');
  const [selected, setSelected] = useState<Set<number>>(() => new Set(open.map(card => card.questionNumber!)));
  const [reason, setReason] = useState<ErrorCategory>(suggested);
  const [picking, setPicking] = useState(false);
  // After a group is given its reason, the rest is selected for the next one.
  useEffect(() => { setSelected(new Set(openKey ? openKey.split(',').map(Number) : [])); }, [openKey]);
  const chosen = open.filter(card => selected.has(card.questionNumber!));
  const rest = open.filter(card => !selected.has(card.questionNumber!)).map(card => card.questionNumber!);
  const toggle = (number: number) => setSelected(current => { const next = new Set(current); if (next.has(number)) next.delete(number); else next.add(number); return next; });
  const parts = [1, 2, 3, 4].map(part => ({ part, cards: cards.filter(card => card.part === part) })).filter(entry => entry.cards.length);
  const assign = () => { if (chosen.length) onAssign(chosen.map(card => card.id), reason); };
  const grid = (
    <div className="cv-lgrid">
      {parts.map(({ part, cards: list }) => (
        <div key={part} className="cv-lrow">
          <b>Part {part}</b>
          <div className="cv-nums" role="group" aria-label={`Part ${part}`}>
            {list.map(card => recorded(card)
              ? <span key={card.id} className="cv-num is-done" aria-label={`Câu ${card.questionNumber}, đã ghi lý do`}>{card.questionNumber}<small>{listeningReasonShort(card.category)}</small></span>
              : <button key={card.id} type="button" className="cv-num" aria-pressed={selected.has(card.questionNumber!)} aria-label={`Câu ${card.questionNumber}`}
                  onClick={() => toggle(card.questionNumber!)}>{card.questionNumber}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
  const reasons = (
    <div className={'cv-reasons' + (phone ? ' is-col' : '')} role="group" aria-label="Lý do sai">
      {LISTENING_REASONS.map(([category, label]) => (
        <button key={category} type="button" className="cv-reason" aria-pressed={reason === category} onClick={() => setReason(category)}>
          <span>{label}</span>
          {category === suggested && <span className="cv-sg"><Soc state="idle" size={18} className="cv-sg-soc" />Sóc gợi ý</span>}
        </button>
      ))}
    </div>
  );
  const assignLabel = `Gán cho ${chosen.length} câu`;
  const restLine = rest.length ? `Còn câu ${rest.join(', ')}` : '';
  if (phone) {
    return (
      <>
        <StepHead phone title="Listening" step={2} onClose={onClose} />
        <div className="wd-body cv-body">
          {picking ? <>
            <h3 className="cv-ask">Chọn câu cùng lý do</h3>
            {grid}
          </> : <>
            <div className="cv-chosen">
              <span>Đã chọn</span>
              <span className="cv-chosen-n">{chosen.map(card => <b key={card.id}>{card.questionNumber}</b>)}</span>
              <button type="button" className="cv-link" onClick={() => setPicking(true)}>Đổi</button>
            </div>
            <h3 className="cv-ask">Sai vì sao?</h3>
            {reasons}
          </>}
          {error && <p className="wd-err" role="alert">{error}</p>}
        </div>
        <footer className="cv-pfoot">
          {picking
            ? <button type="button" className="rd-btn rd-btn--pink cv-wide" disabled={!chosen.length} onClick={() => setPicking(false)}>Xong · {chosen.length} câu</button>
            : <button type="button" className="rd-btn rd-btn--pink cv-wide" disabled={!chosen.length} onClick={assign}>{assignLabel}</button>}
          <div className="cv-prow">{restLine && <span className="cv-rest">{restLine}</span>}<button type="button" className="cv-link is-mut" onClick={onSkip}>Bỏ qua phần Nghe</button></div>
        </footer>
      </>
    );
  }
  return (
    <>
      <StepHead phone={false} title="Listening" sub={`${cards.length} câu sai · chỉ ghi lý do`} step={2} onClose={onClose} />
      <div className="wd-body cv-body">
        <div className="cv-lhero">
          <Soc state="hi" size={70} />
          <div><h3>Chọn các câu sai cùng một lý do</h3><p>Chọn xong một lý do là gán cho cả nhóm.</p></div>
        </div>
        {grid}
        <h4 className="cv-lq">{chosen.length} câu này sai vì...</h4>
        {reasons}
        {error && <p className="wd-err" role="alert">{error}</p>}
      </div>
      <footer className="cv-foot">
        <span className="cv-rest">{restLine}</span>
        <button type="button" className="cv-link is-mut" onClick={onSkip}>Bỏ qua phần Nghe</button>
        <span className="wd-sp" />
        <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!chosen.length} onClick={assign}>{assignLabel}</button>
      </footer>
    </>
  );
}

/* ---------- Cần chụp: the shot list and one tray ---------- */

export type ShotState = 'done' | 'reading' | 'failed' | 'skipped' | 'open';
export interface ShotRow { item: ShotItem; state: ShotState }
export interface StripChip { key: string; label: string; status: 'reading' | 'done' | 'failed'; count: number }
export interface CurrentJob { status: 'waiting' | 'reading' | 'done' | 'failed'; seconds: number; done: number; total: number; error: string; note: string; reasons: string[] }

const nextLabel = (item: ShotItem) => item.kind === 'group' ? `Nhóm tiếp: ${shotRange(item)}` : `Tấm tiếp: câu ${shotRange(item)}`;

export function CaptureView(props: Base & {
  rows: ShotRow[]; current: ShotItem | null; currentState: ShotState; next: ShotItem | null;
  /** Part 5's numbers still to capture (the tray title). */
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
  error: string; note: string;
}) {
  const { phone, testName, onClose, rows, current, currentState, next, part5Open, zones, activeZone, onActivateZone, sent, clarity, photoMode, onPhotoMode,
    onAddFiles, onCameraAdd, onEditPhoto, onMovePhoto, onSwitchZone, onRemove, canRead, inFlight, job, strip, onRetry, missing, onCaptureMissing,
    reviewCount, allDone, anyReading, onSelect, onSend, onSkip, onManual, onReview, onEditRange, listeningLeft, onListening, error, note } = props;
  const [list, setList] = useState(false);
  const [burst, setBurst] = useState<Zone | null>(null);
  const [editingRange, setEditingRange] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const pickZone = useRef<Zone>('questions');
  useEffect(() => { setEditingRange(false); }, [current?.key]);
  const staged = zones.passage.length + zones.questions.length;
  const done = rows.filter(row => row.state === 'done').length;
  const twoZones = current?.part === 7;
  const cameraZone: Zone = twoZones ? activeZone : 'questions';
  const openCapture = (zone: Zone) => {
    if (phone) setBurst(zone);
    else { pickZone.current = zone; pick.current?.click(); }
  };
  const captureMissing = () => {
    const item = onCaptureMissing();
    if (!item) return;
    setList(false);
    openCapture(item.part === 7 ? 'questions' : 'questions');
  };

  /* list */
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
                const cls = state === 'done' ? ' is-done' : state === 'reading' ? ' is-reading' : state === 'skipped' ? ' is-skipped' : on ? (item.kind === 'group' ? ' is-active' : ' is-next') : '';
                const sub = shotSub(item);
                return (
                  <li key={item.key}>
                    <button type="button" className={'cv-si' + cls} aria-current={on ? 'step' : undefined}
                      aria-label={`${shotTitle(item)}${state === 'done' ? ', xong' : state === 'reading' ? ', Sóc đang đọc' : state === 'failed' ? ', chưa đọc được' : state === 'skipped' ? ', bỏ qua' : ''}`}
                      onClick={() => { onSelect(item.key); setList(false); }}>
                      <span className={'cv-tk' + (state === 'done' ? ' is-on' : state === 'reading' ? ' is-rd' : '')} aria-hidden="true">
                        {state === 'done' ? <Check size={16} strokeWidth={3} /> : state === 'reading' ? <Soc state="think" size={30} /> : null}
                      </span>
                      <span className="cv-si-t"><b>{shotTitle(item)}</b>{sub && <small>{sub}</small>}</span>
                      {state === 'reading' ? <em className="is-rdg">Sóc đang đọc…</em>
                        : state === 'failed' ? <em className="is-fail">Thử lại</em>
                        : state === 'skipped' ? <em className="is-skip">bỏ qua</em>
                        : on && state === 'open' ? (item.kind === 'group' ? <em className="is-now">đang chụp</em> : <em className="is-nx">tiếp theo</em>) : null}
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

  /* tray */
  const allStaged = [...zones.passage, ...zones.questions];
  const badIndex = allStaged.findIndex(item => clarity[item.id]?.problem);
  const bad = badIndex >= 0 ? allStaged[badIndex] : null;
  const badText = bad ? clarityMessage(badIndex + 1, clarity[bad.id]!.problem!) : null;
  const badZone: Zone = bad && zones.passage.some(item => item.id === bad.id) ? 'passage' : 'questions';
  const zoneProps = { phone, disabled: !canRead, camera: false, clarity, onAdd: onAddFiles, onCameraAdd, onEdit: onEditPhoto, onMove: onMovePhoto, onRemove, onActivate: onActivateZone };
  const stripRow = (strip.length > 0 || phone) && (
    <div className="cv-strip" role="status" aria-label="Các nhóm đã gửi">
      {phone && <button type="button" className="cv-chip is-prog" onClick={() => setList(true)}>Cần chụp {done}/{rows.length}</button>}
      {strip.map(chip => chip.status === 'failed'
        ? <button key={chip.key} type="button" className="cv-chip is-fail" onClick={() => onRetry(chip.key)}>{chip.label} · Thử lại</button>
        : chip.status === 'reading'
          ? <span key={chip.key} className="cv-chip is-rd"><Soc state="think" size={22} className="cv-chip-soc" />{chip.label} · Sóc đang đọc<i className="cv-dots3" aria-hidden="true"><b /><b /><b /></i></span>
          : <span key={chip.key} className="cv-chip is-ok"><span className="cv-chip-tk" aria-hidden="true"><Check size={12} strokeWidth={3.4} /></span>{chip.label} · {chip.count} câu</span>)}
    </div>
  );
  const jobLine = job && (job.status === 'waiting' || job.status === 'reading')
    ? <p className="wd-reading" role="status"><Soc state="think" size={34} />{job.status === 'waiting' ? 'Chờ Sóc đọc…' : `Sóc đang đọc${job.total > 1 ? ` · lượt ${Math.min(job.done + 1, job.total)}/${job.total}` : ''} · ${job.seconds} giây`}</p>
    : job?.status === 'failed' ? <div className="wd-err" role="alert">{job.error}{job.reasons.length > 0 && <ul className="wd-reasons">{job.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}</div> : null;
  const title = !current ? '' : current.part === 5 ? 'Part 5' : shotTitle(current);
  const sub = !current ? '' : current.part === 5 ? (part5Open.length ? `câu ${part5Open.join(', ')}` : 'xong') : shotSub(current);
  const paper = (
    <button type="button" className="wd-paper-pill" aria-pressed={photoMode} onClick={() => onPhotoMode(!photoMode)}>
      <span className="wd-sw" aria-hidden="true"><i /></span><span>Ảnh chụp giấy</span>
    </button>
  );
  const zonesView = current && canRead && (twoZones ? (
    <>
      <div className={'cv-zones' + (phone ? ' is-stacked' : '')}>
        <DropZone {...zoneProps} zone="passage" num={1} title="Đoạn văn" note={zones.passage.length ? `${zones.passage.length} ảnh` : 'không bắt buộc'}
          items={zones.passage} active={activeZone === 'passage'} onSwitchZone={onSwitchZone} />
        <DropZone {...zoneProps} zone="questions" num={2} title="Câu hỏi" items={zones.questions} sent={sent} active={activeZone === 'questions'} onSwitchZone={onSwitchZone}
          hint={!zones.questions.length && !sent.length ? `${phone ? 'Chụp' : 'Dán ảnh'} câu ${shotRange(current)} vào đây.` : undefined} />
      </div>
      <p className="cv-tip"><ImageIcon size={15} aria-hidden="true" />{phone ? <>Cả đoạn văn và câu hỏi trong một ảnh? Chụp vào <b className="cv-c2">2</b> là được.</> : ONE_SHOT_HINT}</p>
    </>
  ) : (
    <DropZone {...zoneProps} zone="questions" big={!phone} title={current.part === 6 ? 'Ảnh đoạn văn & câu hỏi' : `Ảnh câu Part ${current.part}`}
      items={zones.questions} sent={sent} hint={phone ? 'Chạm ô để chọn ảnh có sẵn.' : 'Thả, dán hoặc chọn ảnh. Một tấm có nhiều câu cũng được.'} />
  ));
  const missBanner = missing.length > 0 && (
    <div className="cv-miss" role="status">
      <Soc state="surprised" size={phone ? 38 : 46} />
      <span className="cv-miss-t">Còn thiếu: <b>{missing.join(', ')}</b></span>
      {!phone && <button type="button" className="rd-btn rd-btn--pink cv-sm" onClick={captureMissing}><Camera size={17} aria-hidden="true" />Chụp tiếp</button>}
    </div>
  );
  const status = (
    <>
      {bad && badText && (
        <div className="wd-clarity" role="status"><span><b>{badText.head}</b>{badText.rest}</span>
          <button type="button" className="wd-chip-btn" onClick={() => onEditPhoto(badZone, bad.id)}>Chỉnh / cắt ảnh</button>
          <button type="button" className="wd-lnk is-muted" onClick={() => onRemove(badZone, bad.id)}>Bỏ ảnh</button></div>
      )}
      {jobLine}
      {job?.note && <p className="wd-note">{job.note}</p>}
      {error && <p className="wd-err" role="alert">{error}</p>}
      {!error && note && <p className="wd-note" role="status">{note}</p>}
      {!canRead && <p className="wd-note">Phiên bản này chưa đọc được ảnh. Ghi tay từng câu bằng nút Ghi tay.</p>}
    </>
  );
  const rangeEdit = current?.part === 7 && (editingRange
    ? <RangeEditor group={current} onSave={onEditRange} onCancel={() => setEditingRange(false)} />
    : <button type="button" className="wd-gr-edit" onClick={() => setEditingRange(true)}>✎ Đổi dải câu</button>);
  const reviewTone = allDone && !anyReading ? 'rd-btn--pink' : 'rd-btn--white';
  const lastLabel = current?.kind === 'group' ? 'Xong nhóm cuối' : 'Xong tấm cuối';
  const skipLabel = current?.kind === 'shot' && current.wrong.length === 1 ? `Bỏ qua câu ${current.wrong[0]}` : current?.kind === 'shot' ? 'Bỏ qua tấm này' : 'Bỏ qua nhóm này';
  const hiddenPicker = <input ref={pick} type="file" accept="image/*" multiple hidden aria-label="Chọn ảnh chụp tiếp"
    onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; onAddFiles(files, pickZone.current); }} />;
  const burstModal = burst && <BurstCameraModal maxPhotos={Math.max(1, MAX_CAPTURE_IMAGES - staged)} title={burst === 'passage' ? 'Đoạn văn' : 'Câu hỏi'}
    onClose={() => setBurst(null)} onComplete={files => { const zone = burst; setBurst(null); onCameraAdd(files, zone); }} />;

  if (phone && (list || !current)) {
    return (
      <>
        <StepHead phone title="Cần chụp" step={3} onClose={onClose} />
        <div className="wd-body cv-body"><div className="cv-plist">{listItems}</div></div>
        <footer className="cv-pfoot">
          {missing.length > 0 && <div className="cv-pmiss"><Soc state="surprised" size={34} />Còn thiếu: <b>{missing.join(', ')}</b></div>}
          {missing.length > 0 && canRead
            ? <button type="button" className="rd-btn rd-btn--pink cv-wide" onClick={captureMissing}><Camera size={19} aria-hidden="true" />Chụp tiếp</button>
            : reviewCount > 0 && (allDone || !current)
              ? <button type="button" className={`rd-btn ${reviewTone} cv-wide`} onClick={onReview}>Soát {reviewCount} câu</button>
              : current && <button type="button" className="rd-btn rd-btn--pink cv-wide" onClick={() => setList(false)}>Chụp {shotTitle(current)}</button>}
        </footer>
        {hiddenPicker}{burstModal}
      </>
    );
  }

  if (phone && current) {
    const sendLabel = current.kind === 'group' ? 'Xong nhóm' : 'Xong tấm';
    return (
      <>
        <StepHead phone title={shotTitle(current).replace(/^Tấm \d+ · /, '')} sub={current.kind === 'group' ? `câu ${current.wrong.join(', ')}` : `Tấm ${current.index}`} step={3}
          back={() => setList(true)} onClose={onClose} />
        <div className="wd-body cv-body">
          {stripRow}
          {currentState === 'done' && !staged && <p className="cv-donebar"><Check size={16} strokeWidth={3} aria-hidden="true" />Sóc đã đọc đủ {current.kind === 'group' ? 'nhóm' : 'tấm'} này.</p>}
          {zonesView}
          {missBanner}
          {status}
          {canRead && <div className="cv-row">{paper}{rangeEdit}</div>}
        </div>
        <footer className="cv-pfoot">
          {allDone && !staged && reviewCount > 0
            ? <button type="button" className={`rd-btn ${reviewTone} cv-wide`} onClick={onReview}>Soát {reviewCount} câu</button>
            : <div className="cv-prow2">
                <button type="button" className="rd-btn rd-btn--white cv-half" disabled={!staged || inFlight} onClick={onSend}>{sendLabel}</button>
                {canRead
                  ? <button type="button" className="rd-btn rd-btn--pink cv-half is-main" disabled={staged >= MAX_CAPTURE_IMAGES} onClick={() => openCapture(cameraZone)}>
                      <Camera size={19} aria-hidden="true" />{twoZones ? <>Chụp vào <b className="cv-c2 is-w">{cameraZone === 'passage' ? 1 : 2}</b></> : 'Chụp ảnh'}</button>
                  : <button type="button" className="rd-btn rd-btn--pink cv-half is-main" onClick={onManual}>✎ Ghi tay</button>}
              </div>}
          <div className="cv-prow">
            {canRead && <button type="button" className="cv-link is-mut" onClick={onManual}>✎ Ghi tay</button>}
            <button type="button" className="cv-link is-mut" onClick={onSkip}>{skipLabel}</button>
            {!allDone && reviewCount > 0 && <button type="button" className="cv-link" onClick={onReview}>Soát {reviewCount} câu</button>}
          </div>
        </footer>
        {hiddenPicker}{burstModal}
      </>
    );
  }

  let main: ReactNode;
  if (staged) {
    main = <button type="button" className="rd-btn rd-btn--pink wd-main cv-main" disabled={inFlight} onClick={onSend}>{next ? nextLabel(next) : lastLabel}<ArrowRight size={18} aria-hidden="true" /></button>;
  } else if (reviewCount > 0) {
    main = <button type="button" className={`rd-btn ${reviewTone} wd-main cv-main`} onClick={onReview}>Soát {reviewCount} câu<ArrowRight size={18} aria-hidden="true" /></button>;
  } else {
    main = <button type="button" className="rd-btn rd-btn--pink wd-main cv-main" disabled>{next ? nextLabel(next) : lastLabel}<ArrowRight size={18} aria-hidden="true" /></button>;
  }
  return (
    <>
      <StepHead phone={false} title="Chụp câu sai" sub={testName} step={3} onClose={onClose} />
      <div className="wd-body cv-body">
        <div className="cv-cap">
          <nav className="cv-list" aria-label="Cần chụp">
            <h3>Cần chụp <span>{done}/{rows.length} {rows.some(row => row.item.kind === 'group') ? 'mục' : 'tấm'}</span></h3>
            {listItems}
          </nav>
          {current && (
            <section className="cv-tray" aria-label={title}>
              {canRead && <ScreenshotSuggestBar enabled disabled={false} maxAdd={Math.max(0, MAX_CAPTURE_IMAGES - staged)} onAddFiles={files => onAddFiles(files)} />}
              {stripRow}
              <div className="cv-trow">
                <h3>{title}<small>{sub}</small></h3>
                {rangeEdit}
                <span className="wd-sp" />
                {canRead && <span className="cv-hintk">Dán <kbd>Ctrl+V</kbd>{twoZones && <> · đổi ô bằng phím <kbd>1</kbd><kbd>2</kbd></>}</span>}
              </div>
              {currentState === 'done' && !staged && <p className="cv-donebar"><Check size={16} strokeWidth={3} aria-hidden="true" />Sóc đã đọc đủ {current.kind === 'group' ? 'nhóm' : 'tấm'} này. Chọn mục khác bên trái hoặc thêm ảnh.</p>}
              {zonesView}
              {missBanner}
              {status}
              {canRead && <div className="cv-row">{paper}</div>}
            </section>
          )}
        </div>
      </div>
      <footer className="cv-foot">
        {current && <button type="button" className="cv-link is-mut" onClick={onSkip}>{skipLabel}</button>}
        {current && <button type="button" className="cv-link is-mut" onClick={onManual}>✎ Ghi tay</button>}
        <span className="wd-sp" />
        {staged > 0 && reviewCount > 0 && <button type="button" className="cv-link" onClick={onReview}>Soát {reviewCount} câu</button>}
        {main}
      </footer>
      {hiddenPicker}{burstModal}
    </>
  );
}

/* ---------- Soát: doubtful rows open, the rest folded ---------- */

export interface SoatRow { id: string; card: MistakeEntry; form: CardForm; doubt: Doubt | null; choices: number[] }

const optionsOf = (form: CardForm) => form.ai?.options ?? [];
function Options({ form }: { form: CardForm }) {
  const chosen = chosenOf(form);
  return (
    <ul className="cv-opts">
      {optionsOf(form).map(option => {
        const letter = optionLetter(option);
        return (
          <li key={option} className={letter === form.answer ? 'is-ok' : letter === chosen ? 'is-me' : ''}>
            <span>{option}</span>
            {letter === chosen && <em className="is-me">bạn chọn</em>}
            {letter === form.answer && <em className="is-ok">đáp án</em>}
          </li>
        );
      })}
    </ul>
  );
}

function DoubtCard({ row, phone, onUpdate, onConfirm, onPickNumber, onMore }: { row: SoatRow; phone: boolean;
  onUpdate: (patch: Partial<CardForm>) => void; onConfirm: () => void; onPickNumber: (number: number) => string | null; onMore: () => void }) {
  const { card, form, doubt } = row;
  const number = card.questionNumber!;
  const [other, setOther] = useState(false);
  const [otherValue, setOtherValue] = useState('');
  const [otherError, setOtherError] = useState('');
  const question = form.ai?.question?.trim() ?? '';
  const aiDoubt = openDoubt(form);
  let head: ReactNode;
  let action: ReactNode = null;
  switch (doubt?.kind) {
    case 'number':
      head = <>Sóc đoán là câu {number}</>;
      action = (
        <div className="cv-numpick" role="group" aria-label="Câu số">
          <span>Câu số:</span>
          {row.choices.map(value => (
            <button key={value} type="button" className={'cv-nchip' + (value === number ? ' is-on' : '')} aria-pressed={value === number}
              onClick={() => { if (value === number) onConfirm(); else onPickNumber(value); }}>{value}</button>
          ))}
          {other
            ? <form className="cv-other" onSubmit={event => { event.preventDefault(); const error = onPickNumber(Number(otherValue)); setOtherError(error ?? ''); if (!error) setOther(false); }}>
                <input type="number" min={101} max={200} value={otherValue} aria-label="Số câu khác" autoFocus onChange={event => { setOtherValue(event.target.value); setOtherError(''); }} />
                <button type="submit" className="cv-nchip">Đổi</button>
              </form>
            : <button type="button" className="cv-nchip is-more" onClick={() => setOther(true)}>Số khác…</button>}
          {otherError && <span className="wd-err cv-inline-err" role="alert">{otherError}</span>}
        </div>
      );
      break;
    case 'answer':
      head = <>Câu {number}: Sóc giải ra {aiDoubt}, trang đề ghi {form.answer}</>;
      action = <div className="cv-acts"><button type="button" className="cv-nchip" onClick={() => onUpdate({ answer: aiDoubt as ChoiceLetter })}>Đổi sang {aiDoubt}</button>
        <button type="button" className="cv-nchip" onClick={() => form.ai && onUpdate({ ai: { ...form.ai, answerDoubt: '' } })}>Giữ {form.answer}</button></div>;
      break;
    case 'key':
      head = <>Câu {number}: đáp án khác lần trước ({doubt.detail})</>;
      action = <div className="cv-acts"><button type="button" className="cv-nchip" onClick={() => { onUpdate({ answer: doubt.detail as ChoiceLetter }); onConfirm(); }}>Dùng {doubt.detail}</button>
        <button type="button" className="cv-nchip" onClick={onConfirm}>Giữ {form.answer}</button></div>;
      break;
    case 'missingAnswer':
      head = <>Câu {number}: chưa có đáp án</>;
      action = <div className="cv-acts"><span className="cv-acts-l">Chạm đáp án đúng:</span><Sheet number={number} part={card.part} form={form} ask onAnswer={letter => onUpdate({ answer: letter })} /></div>;
      break;
    case 'context':
      head = <>Câu {number}: thiếu ảnh đoạn văn</>;
      action = <div className="cv-acts"><button type="button" className="cv-nchip" onClick={onMore}>Chụp thêm</button><button type="button" className="cv-nchip" onClick={onConfirm}>Giữ vậy</button></div>;
      break;
    default:
      head = <>Câu {number}: {doubt?.detail}</>;
      action = <div className="cv-acts"><button type="button" className="cv-nchip" onClick={onMore}>Chụp lại</button><button type="button" className="cv-nchip" onClick={onConfirm}>Vẫn giữ</button></div>;
  }
  return (
    <section className="cv-doubt" aria-label={`Kiểm lại câu ${number}`}>
      <div className="cv-doubt-h"><span className="cv-pill">Kiểm lại</span><b>{head}</b></div>
      {question && <p className="cv-q">{phone ? question : question.split('\n')[0]}</p>}
      {optionsOf(form).length > 0 && <Options form={form} />}
      {action}
    </section>
  );
}

function FoldRow({ row, phone, open, onToggle, onUpdate }: { row: SoatRow; phone: boolean; open: boolean; onToggle: () => void; onUpdate: (patch: Partial<CardForm>) => void }) {
  const { card, form } = row;
  const number = card.questionNumber!, chosen = chosenOf(form), right = isRightForm(form);
  const snippet = card.part === 6 && !form.ai?.question?.trim() ? `Đoạn ${number}` : (form.ai?.question?.trim().split('\n')[0] ?? 'Chưa có câu hỏi');
  return (
    <li className={'cv-fr' + (open ? ' is-open' : '')}>
      <button type="button" className="cv-fr-b" aria-expanded={open} aria-label={`Mở câu ${number}`} onClick={onToggle}>
        <b className="cv-fr-n">{number}</b>
        <span className="cv-part">P{card.part}</span>
        {!phone && <span className="cv-fr-q">{snippet}</span>}
        {phone && <span className="wd-sp" />}
        {right ? <span className="cv-pp is-right">làm đúng</span> : <>
          {form.choice === 'BLANK' ? <span className="cv-pp is-me">trống</span> : chosen && <span className="cv-pp is-me" aria-label={`bạn chọn ${chosen}`}>{chosen}</span>}
          {form.answer ? <span className="cv-pp is-ok" aria-label={`đáp án ${form.answer}`}>{form.answer}</span> : <span className="wd-spin" role="img" aria-label="Sóc đang giải đáp án" />}
        </>}
        <ChevronRight className="cv-chev" size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="cv-fr-d">
          {!right && <ReasonChips part={card.part} number={number} value={form.category} onPick={category => onUpdate({ category })} />}
          <RowDetail card={card} form={form} phone={phone} onUpdate={onUpdate} />
        </div>
      )}
    </li>
  );
}

export function SoatView({ phone, testName, onClose, rows, read, openRow, setOpenRow, writing, saveCount, error, note, skipped, reasons,
  onUpdate, onConfirm, onPickNumber, onMore, onSave, onDiscard }: Base & {
  rows: SoatRow[]; read: boolean; openRow: string; setOpenRow: (id: string) => void; writing: number; saveCount: number; error: string; note: string;
  skipped: number[]; reasons: string[];
  onUpdate: (id: string, patch: Partial<CardForm>) => void; onConfirm: (id: string) => void; onPickNumber: (id: string, number: number) => string | null;
  onMore: () => void; onSave: () => void;
  /** Rows restored from an earlier sitting can be dropped. */
  onDiscard?: () => void;
}) {
  const doubts = rows.filter(row => row.doubt), sure = rows.filter(row => !row.doubt);
  const lead = !doubts.length ? 'Sóc chắc cả rồi, bạn lướt lại rồi lưu nhé.'
    : doubts.length === 1 ? 'Chỉ một câu Sóc chưa chắc, bạn xem giúp nhé.' : `Có ${doubts.length} câu Sóc chưa chắc, bạn xem giúp nhé.`;
  const titleText = read ? `Sóc đọc xong ${rows.length} câu` : `${rows.length} câu chưa lưu`;
  return (
    <>
      <StepHead phone={phone} title={phone ? `Soát · ${rows.length} câu` : 'Soát'} sub={phone ? undefined : `${testName} · Reading`} step={4} back={phone ? onMore : undefined} onClose={onClose} />
      <div className="wd-body cv-body">
        {!phone && (
          <div className="cv-shero">
            <Soc state={doubts.length ? 'idle' : 'yay'} size={74} />
            <div><h3>{titleText}</h3><p>{lead}</p></div>
          </div>
        )}
        {doubts.map(row => <DoubtCard key={row.id} row={row} phone={phone} onUpdate={patch => onUpdate(row.id, patch)} onConfirm={() => onConfirm(row.id)}
          onPickNumber={number => onPickNumber(row.id, number)} onMore={onMore} />)}
        {sure.length > 0 && <>
          <div className="cv-sure-h"><b>Sóc chắc chắn</b><span>{sure.length} câu</span><span className="wd-sp" /><span className="cv-pp is-me is-key">bạn chọn</span><span className="cv-pp is-ok is-key">đáp án</span></div>
          <ul className="cv-fold">
            {sure.map(row => <FoldRow key={row.id} row={row} phone={phone} open={openRow === row.id} onToggle={() => setOpenRow(openRow === row.id ? '' : row.id)}
              onUpdate={patch => onUpdate(row.id, patch)} />)}
          </ul>
        </>}
        {skipped.length > 0 && <p className="wd-skip cv-skip">Câu {skipped.join(', ')}: bạn làm đúng, Sóc bỏ qua.</p>}
        {reasons.length > 0 && <ul className="wd-reasons" role="status">{reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
        {error && <p className="wd-err" role="alert">{error}</p>}
        {!error && note && <p className="wd-note" role="status">{note}</p>}
      </div>
      <footer className={phone ? 'cv-pfoot' : 'cv-foot'}>
        {writing > 0 && <span className="wd-wr" role="status"><i className="wd-spin" aria-hidden="true" />Đang viết lời giải {writing} câu{phone ? '' : '. Lưu ngay cũng được.'}</span>}
        {!phone && <button type="button" className="cv-link is-mut" onClick={onMore}><Camera size={16} aria-hidden="true" />Chụp thêm</button>}
        {onDiscard && <button type="button" className="cv-link is-mut" onClick={onDiscard}>Bỏ nháp</button>}
        {!phone && <span className="wd-sp" />}
        <button type="button" className={'rd-btn rd-btn--pink ' + (phone ? 'cv-wide' : 'wd-main')} disabled={!saveCount} onClick={onSave}>Lưu tất cả ({saveCount})</button>
      </footer>
    </>
  );
}
