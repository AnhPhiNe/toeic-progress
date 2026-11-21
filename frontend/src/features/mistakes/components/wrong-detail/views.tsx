import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { CHOICE_LETTERS, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { EMPTY_FORM, isEmptyForm, openDoubt, type CardForm, type Choice } from '@/features/mistakes/lib/detailForm';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { isExplaining } from '@/features/mistakes/services/explanationQueue';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { clarityMessage, type ClarityResult } from '@/features/mistakes/lib/photoClarity';
import type { PageRejectionReason } from '@/features/mistakes/services/aiMistakeExtractor';
import { isGroupedPart, PART_ACTION, PART_NAMES, partMode, suggestGroups, topReason, type CustomRangeMap, type PartProgress, type PassageGroup } from '@/features/mistakes/lib/wrongDetail';
import type { ReadJob, Screen } from './WrongDetailFlow';

export type Zone = 'passage' | 'questions';
export interface Staged { id: string; file: File; url: string }
interface Common { phone: boolean; testName: string; total: number; doneCount: number; onClose: () => void }

/* ---------- small pieces ---------- */

const REASONS: Array<[ErrorCategory, string]> = [['VOCABULARY_TRAP', 'Từ vựng'], ['ADVANCED_GRAMMAR', 'Ngữ pháp'], ['LISTENING_SPEED', 'Nghe'],
  ['TIME_PRESSURE', 'Hết giờ'], ['CARELESS_DISTRACTION', 'Ẩu'], ['OTHER', 'Khác']];
const reasonsFor = (part: number) => REASONS.filter(([category]) => part <= 4 || category !== 'LISTENING_SPEED');
export const reasonLabel = (category: ErrorCategory) => REASONS.find(([value]) => value === category)?.[1] ?? 'Khác';
const lettersFor = (part: number) => CHOICE_LETTERS.slice(0, part === 2 ? 3 : 4);
const chosenOf = (form: CardForm) => form.choice && form.choice !== 'BLANK' ? form.choice : '';
const sheetLabel = (chosen: string, answer: string, blank = false) =>
  [blank ? 'Bỏ trống' : chosen && `Bạn chọn ${chosen}`, answer ? `đáp án ${answer}` : 'chưa có đáp án'].filter(Boolean).join(', ');

function Pill({ done, total }: { done: number; total: number }) {
  return <span className="wd-tot" role="img" aria-label={`Đã ghi ${done} trên ${total} câu`}><i><b style={{ width: `${total ? done / total * 100 : 0}%` }} /></i>{done}/{total} câu</span>;
}
function Bar({ done, total }: { done: number; total: number }) {
  return <span className={'wd-bar' + (total && done === total ? ' is-full' : '')}><i><b style={{ width: `${total ? done / total * 100 : 0}%` }} /></i>đã ghi {done}/{total}</span>;
}

function Head({ phone, title, sub, back, pill, onClose }: { phone: boolean; title: string; sub: ReactNode; back?: () => void; pill?: ReactNode; onClose: () => void }) {
  return (
    <header className="wd-head">
      {back && <button type="button" className="wd-back" aria-label="Quay lại" onClick={back}>‹</button>}
      <h2 id="wd-title">{title}<small>{sub}</small></h2>
      <span className="wd-sp" />
      {!phone && pill}
      <button type="button" className="wd-x" aria-label="Đóng" onClick={onClose}>✕</button>
    </header>
  );
}

function ReasonChips({ part, number, value, onPick, big = false }: { part: number; number: number; value: ErrorCategory | ''; onPick: (category: ErrorCategory) => void; big?: boolean }) {
  return (
    <div className={'wd-rs' + (big ? ' is-big' : '')} role="group" aria-label={`Vì sao sai câu ${number}`}>
      {reasonsFor(part).map(([category, label]) => (
        <button key={category} type="button" aria-pressed={value === category} onClick={() => onPick(category)}>{label}</button>
      ))}
    </div>
  );
}

/** Like an answer sheet: the learner's choice in pink, the right answer in green; a tap on another letter sets the answer. */
function Sheet({ number, part, form, ask, onAnswer }: { number: number; part: number; form: CardForm; ask: boolean; onAnswer: (letter: ChoiceLetter) => void }) {
  const chosen = chosenOf(form);
  return (
    <span className="wd-abc" role="group" aria-label={`Câu ${number}: ${sheetLabel(chosen, form.answer, form.choice === 'BLANK')}`}>
      {lettersFor(part).map(letter => (
        <button key={letter} type="button" disabled={letter === chosen} aria-label={`Đáp án đúng ${letter}`} aria-pressed={letter === form.answer}
          className={letter === chosen ? 'is-me' : letter === form.answer ? 'is-ok' : ask ? 'is-ask' : ''} onClick={() => onAnswer(letter)}>{letter}</button>
      ))}
    </span>
  );
}

function Letters({ label, part, value, tone, allowBlank = false, onPick }: { label: string; part: number; value: Choice; tone: 'me' | 'ok'; allowBlank?: boolean; onPick: (letter: Choice) => void }) {
  return (
    <div className="wd-lt" role="group" aria-label={label}>
      {lettersFor(part).map(letter => (
        <button key={letter} type="button" aria-pressed={value === letter} className={value === letter ? `is-${tone}` : ''}
          onClick={() => onPick(value === letter ? '' : letter)}>{letter}</button>
      ))}
      {allowBlank && (
        <button type="button" aria-pressed={value === 'BLANK'} className={value === 'BLANK' ? `is-${tone}` : ''}
          onClick={() => onPick(value === 'BLANK' ? '' : 'BLANK')}>Bỏ trống</button>
      )}
    </div>
  );
}

/** A drop zone with thumbnails; supports optional local PhotoReview editing and mobile camera capture. */
export function DropZone({ zone, num, title, note, hint, items, big = false, disabled, camera = false, clarity, onAdd, onCameraAdd, onEdit, onRemove, onActivate }: {
  zone: Zone; num?: number; title: string; note?: string; hint?: ReactNode; items: readonly { id: string; url: string }[]; phone: boolean; big?: boolean; disabled: boolean;
  /** Phones: a camera tile next to the gallery one. */
  camera?: boolean;
  clarity?: Record<string, ClarityResult | null>;
  onAdd: (files: File[], zone: Zone) => void;
  onCameraAdd?: (files: File[], zone: Zone) => void;
  onEdit?: (zone: Zone, id: string) => void;
  onRemove: (zone: Zone, id: string) => void;
  onActivate: (zone: Zone) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const shoot = useRef<HTMLInputElement>(null);
  const label = zone === 'passage' ? 'Ảnh đoạn văn' : 'Ảnh câu hỏi';
  return (
    <div className={'wd-zn' + (big ? ' is-big' : '')} onClick={() => onActivate(zone)}
      onDragOver={event => { if (!disabled) { event.preventDefault(); event.stopPropagation(); } }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); onAdd([...event.dataTransfer.files], zone); }}>
      <h5>{num && <em>{num}</em>}{title}{note && <small>{note}</small>}</h5>
      <div className="wd-ths">
        {items.map((item, index) => {
          const problem = clarity?.[item.id]?.problem;
          return (
            <span key={item.id} className={'wd-pg' + (zone === 'questions' ? ' is-q' : '')}>
              <img src={item.url} alt={`${label} ${index + 1}`}
                onClick={event => { if (!disabled && onEdit) { event.stopPropagation(); onEdit(zone, item.id); } }} />
              {problem && <span className="wd-pg-warn" title={problem === 'dark' ? 'Ảnh hơi tối' : 'Ảnh hơi mờ'} aria-label={problem === 'dark' ? 'Ảnh hơi tối' : 'Ảnh hơi mờ'}>!</span>}
              {onEdit && (
                <button type="button" className="wd-pg-edit" aria-label={`Chỉnh ${label.toLowerCase()} ${index + 1}`} disabled={disabled}
                  onClick={event => { event.stopPropagation(); onEdit(zone, item.id); }}>✎</button>
              )}
              <button type="button" aria-label={`Bỏ ${label.toLowerCase()} ${index + 1}`} disabled={disabled}
                onClick={event => { event.stopPropagation(); onRemove(zone, item.id); }}>×</button>
            </span>
          );
        })}
        {camera && <button type="button" className="wd-pg is-add is-cam" aria-label={`Chụp ${label.toLowerCase()}`} disabled={disabled} onClick={event => { event.stopPropagation(); onActivate(zone); shoot.current?.click(); }}>📷</button>}
        <button type="button" className="wd-pg is-add" aria-label={`Thêm ${label.toLowerCase()}`} disabled={disabled} onClick={event => { event.stopPropagation(); onActivate(zone); input.current?.click(); }}>+</button>
      </div>
      {camera && <input ref={shoot} type="file" accept="image/*" capture="environment" hidden aria-label={`Chụp ${label.toLowerCase()}`}
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; (onCameraAdd ?? onAdd)(files, zone); }} />}
      {hint && <p className="wd-zp">{hint}</p>}
      <input ref={input} type="file" accept="image/*" multiple hidden aria-label={label}
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; onAdd(files, zone); }} />
    </div>
  );
}

export const pasteHint = (phone: boolean) => phone ? 'Chọn ảnh từ máy.' : <>Thả, dán <span className="wd-kbd">Ctrl+V</span> hoặc chọn ảnh.</>;

/* ---------- 1 · overview ---------- */

export function Overview({ phone, testName, total, doneCount, onClose, progress, hero, canRead, toast, pendingDrafts, onOpenPart, onShowDrafts, onDiscardDrafts, error, listening }: Common & {
  progress: PartProgress[]; hero: PartProgress | null; canRead: boolean; toast: { id: number; text: string } | null; pendingDrafts: number;
  onOpenPart: (part: PartNumber) => void; onShowDrafts: () => void; onDiscardDrafts: () => void; error: string;
  /** Listening Parts left to do, and whether the learner set them aside. */
  listening: { left: number; skipped: boolean; onToggle: () => void };
}) {
  const heroLeft = hero ? hero.numbers.length - hero.done : 0;
  const most = hero && Math.max(...progress.map(entry => entry.numbers.length)) === hero.numbers.length;
  const heroMode = hero ? partMode(hero.part) : 'page';
  const heroButton = !hero ? '' : heroMode === 'reason' ? `Chọn lý do Part ${hero.part}` : !canRead ? `Ghi tay Part ${hero.part}`
    : hero.done ? `Chụp tiếp Part ${hero.part}` : `Chụp trang chữa bài Part ${hero.part}`;
  const camera = hero && heroMode !== 'reason' && canRead;
  const others = progress.filter(entry => entry.part !== hero?.part);
  return (
    <>
      <Head phone={phone} title="Gỡ câu sai" sub={`${testName} · ${total} câu sai`} pill={<Pill done={doneCount} total={total} />} onClose={onClose} />
      {phone && <div className="wd-ptot"><Pill done={doneCount} total={total} /></div>}
      <div className="wd-body">
        {toast && <div key={toast.id} className="wd-toast is-top" role="status"><i aria-hidden="true">✓</i>{toast.text}</div>}
        {hero && (
          <section className="wd-hero" aria-label={`Part ${hero.part}`}>
            <Soc state="idle" size={phone ? 70 : 96} className="wd-soc" />
            <div className="wd-hero-t">
              <span className="wd-say">{hero.done ? `Xong ${hero.done} câu rồi!` : `Gỡ Part ${hero.part} trước nhé!`}</span>
              <h3>{most && !hero.done ? <>Part {hero.part} sai nhiều nhất: <em>{hero.numbers.length} câu</em></> : <>Part {hero.part} còn <em>{heroLeft} câu</em></>}</h3>
              <Bar done={hero.done} total={hero.numbers.length} />
            </div>
            <button type="button" className="rd-btn rd-btn--pink wd-cta" onClick={() => onOpenPart(hero.part)}>{camera ? <span aria-hidden="true">📸</span> : null}{heroButton}</button>
          </section>
        )}
        <div className="wd-pgrid">
          {others.map(entry => {
            const done = entry.done === entry.numbers.length, mode = partMode(entry.part);
            return (
              <button key={entry.part} type="button" className={'wd-pc' + (done ? ' is-done' : '')} onClick={() => onOpenPart(entry.part)}
                aria-label={`Part ${entry.part} · ${PART_NAMES[entry.part]}, ${entry.numbers.length} câu sai, đã ghi ${entry.done}/${entry.numbers.length}`}>
                <span className="wd-pc-t">Part {entry.part}<span className={entry.part <= 4 ? 'is-l' : 'is-r'}>{entry.part <= 4 ? 'Nghe' : 'Đọc'}</span>{!phone && <em>{entry.numbers.length} câu sai</em>}</span>
                <span className="wd-pc-n">{PART_NAMES[entry.part]}{phone ? ` · ${entry.numbers.length} câu` : ''}</span>
                <Bar done={entry.done} total={entry.numbers.length} />
                <span className="wd-pc-a">{done ? 'Xong' : `${mode === 'reason' || canRead ? PART_ACTION[mode] : 'Ghi tay'} ›`}</span>
              </button>
            );
          })}
        </div>
        {listening.skipped && <p className="wd-skipped">Phần Nghe đã bỏ qua ({listening.left} câu).
          <button type="button" className="wd-lnk" onClick={listening.onToggle}>Ghi lại phần Nghe</button></p>}
        {error && <p className="wd-err" role="alert">{error}</p>}
        {pendingDrafts > 0 && (
          <div className="wd-toast is-drafts" role="status">Còn {pendingDrafts} câu nháp chưa lưu
            <button type="button" onClick={onShowDrafts}>Xem</button><button type="button" className="is-quiet" onClick={onDiscardDrafts}>Bỏ nháp</button></div>
        )}
      </div>
      <footer className="wd-foot">
        <span className="wd-q">{phone ? 'Tiến độ tự lưu.' : 'Câu chưa ghi chờ ở đây, chưa vào Sổ tay. Làm tiếp lúc nào cũng được.'}</span>
        {!listening.skipped && listening.left > 0 && <button type="button" className="wd-quiet" onClick={listening.onToggle}>Bỏ qua phần Nghe</button>}
        <button type="button" className={'wd-quiet' + (!listening.skipped && listening.left > 0 ? ' is-next' : '')} onClick={onClose}>Để sau</button>
      </footer>
    </>
  );
}

/* ---------- 2 · one Part ---------- */

const groupHint = (part: number, passages: number) => part === 6
  ? 'Thả hoặc chụp toàn bộ ảnh đoạn văn và câu hỏi vào một khay theo thứ tự (chụp gộp 1 trang hay tách trang đều được).'
  : part === 3 || part === 4
    ? 'Thả hoặc chụp ảnh transcript, bảng biểu và 3 câu hỏi của cụm này vào cùng một khay.'
    : passages === 3
      ? 'Đoạn ba: thả/chụp cả 3 bài đọc và ảnh câu hỏi vào cùng khay theo thứ tự. Sóc tự ghép ngữ cảnh.'
      : passages === 2
        ? 'Đoạn kép: thả/chụp cả 2 bài đọc và ảnh câu hỏi vào cùng khay theo thứ tự. Sóc tự ghép ngữ cảnh.'
        : 'Thả hoặc chụp bài đọc và câu hỏi vào cùng khay theo thứ tự — không cần tách 2 ô.';

function RangeEditor({ group, onSave, onCancel }: { group: PassageGroup; onSave: (from: number, to: number) => string | null; onCancel: () => void }) {
  const [fromVal, setFromVal] = useState(String(group.from));
  const [toVal, setToVal] = useState(String(group.to));
  const [err, setErr] = useState('');
  const submit = () => {
    const error = onSave(Number(fromVal), Number(toVal));
    if (error) setErr(error); else onCancel();
  };
  return (
    <div className="wd-range-bar" role="group" aria-label="Đổi dải câu Part 7">
      <span>Từ</span>
      <input type="number" min={147} max={200} value={fromVal} aria-label="Từ câu" onChange={e => { setFromVal(e.target.value); setErr(''); }} />
      <span>đến</span>
      <input type="number" min={147} max={200} value={toVal} aria-label="Đến câu" onChange={e => { setToVal(e.target.value); setErr(''); }} />
      <button type="button" className="wd-chip-btn" onClick={submit}>Áp dụng</button>
      <button type="button" className="wd-lnk is-muted" onClick={onCancel}>Huỷ</button>
      {err && <span className="wd-err" style={{ marginTop: 0, width: '100%' }} role="alert">{err}</span>}
    </div>
  );
}

export function PartView({ phone, testName, total, doneCount, onClose, part, cards, recorded, forms, groupFrom, setGroupFrom, customPart7Ranges, onEditPart7Range,
  zones, setActiveZone, onAddFiles, onCameraAdd, onEditPhoto, onRemove, clarity, photoMode, setPhotoMode, listeningPhoto, setListeningPhoto,
  jobs, now, onRetry, onOpenJob, error, note, draftState, canRead, onSend, onSendNext, onBack, onManual, onUpdate, onSaveReasons, saveCount, onShowDrafts }: Common & {
  part: PartNumber; cards: MistakeEntry[]; recorded: (card: MistakeEntry) => boolean; forms: Record<string, CardForm>; dirty: Set<string>;
  groupFrom: number | null; setGroupFrom: (from: number) => void;
  customPart7Ranges: CustomRangeMap; onEditPart7Range: (oldFrom: number, from: number, to: number) => string | null;
  zones: Record<Zone, Staged[]>; activeZone: Zone | null; setActiveZone: (zone: Zone) => void;
  onAddFiles: (files: File[], zone?: Zone) => void;
  onCameraAdd: (files: File[], zone?: Zone) => void;
  onEditPhoto: (zone: Zone, id: string) => void;
  onRemove: (zone: Zone, id: string) => void;
  clarity: Record<string, ClarityResult | null>;
  photoMode: boolean; setPhotoMode: (value: boolean) => void;
  listeningPhoto: boolean; setListeningPhoto: (value: boolean) => void;
  jobs: Record<string, ReadJob>; now: number; onRetry: (key: string) => void; onOpenJob: (key: string) => void;
  error: string; note: string; draftState: string; canRead: boolean;
  onSend: () => void; onSendNext: (nextFrom: number) => void; onBack: () => void; onManual: (number: number) => void;
  onUpdate: (id: string, patch: Partial<CardForm>) => void; onSaveReasons: () => void; saveCount: number; onShowDrafts: () => void;
}) {
  const [editingRange, setEditingRange] = useState(false);
  const mode = partMode(part), numbers = cards.map(card => card.questionNumber!);
  const usePhotoMode = mode === 'page' || listeningPhoto;
  const grouped = usePhotoMode && isGroupedPart(part);
  const done = cards.filter(recorded).length;
  const jobOf = (key: string) => jobs[key];
  const isBusy = (job?: ReadJob) => job?.status === 'reading' || job?.status === 'waiting';
  const seconds = (job: ReadJob) => job.startedAt ? Math.max(0, Math.round((now - job.startedAt) / 1000)) : 0;
  const selectedKey = grouped ? `g${groupFrom}` : `p${part}`;
  const current = jobOf(selectedKey), busy = isBusy(current);
  const allStaged = [...zones.passage, ...zones.questions];
  const badPhotoIndex = allStaged.findIndex(item => clarity[item.id]?.problem);
  const badPhoto = badPhotoIndex >= 0 ? allStaged[badPhotoIndex] : null;
  const badClarity = badPhoto ? clarityMessage(badPhotoIndex + 1, clarity[badPhoto.id]!.problem!) : null;
  const badZone: Zone = badPhoto && zones.passage.some(item => item.id === badPhoto.id) ? 'passage' : 'questions';

  /** What happens to one capture: waiting, read so far, read (open it), or failed (try again). */
  const jobLine = (job: ReadJob | undefined) => !job ? null
    : isBusy(job) ? <p className="wd-reading" role="status"><Soc state="think" size={40} />{job.status === 'waiting' ? `${job.label} chờ đọc…`
      : `Đang đọc ${job.label.replace(/^Nhóm/, 'nhóm')}${job.total > 1 ? ` · lượt ${Math.min(job.done + 1, job.total)}/${job.total}` : ''} · ${seconds(job)} giây`}</p>
      : job.status === 'failed' ? (
        <div className="wd-err" role="alert">
          {job.label}: {job.error} <button type="button" className="wd-lnk" onClick={() => onRetry(job.key)}>Thử lại</button>
          {job.rejectionReasons.length > 0 && (
            <ul className="wd-reasons">{job.rejectionReasons.map((r, i) => <li key={`${r.number ?? 'x'}-${i}`}>{r.detail}</li>)}</ul>
          )}
        </div>
      )
        : <p className="wd-note" role="status">Đã đọc {job.label.replace(/^Nhóm/, 'nhóm')}: {job.readIds.length} câu. <button type="button" className="wd-lnk" onClick={() => onOpenJob(job.key)}>Xem và lưu</button></p>;
  const firstOpen = (list: number[]) => list.find(number => !recorded(cards.find(card => card.questionNumber === number)!)) ?? list[0];
  const title = `Part ${part} · ${PART_NAMES[part]}`;
  const sub = phone ? `${numbers.length} câu sai · đã ghi ${done}/${numbers.length}` : `${testName} · ${numbers.length} câu sai`;
  const head = <Head phone={phone} title={title} sub={sub} back={onBack} pill={<Pill done={doneCount} total={total} />} onClose={onClose} />;
  const clarityBanner = badPhoto && badClarity && (
    <div className="wd-clarity" role="status">
      <span><b>{badClarity.head}</b>{badClarity.rest}</span>
      <button type="button" className="wd-chip-btn" onClick={() => onEditPhoto(badZone, badPhoto.id)}>Chỉnh / cắt ảnh</button>
      <button type="button" className="wd-lnk is-muted" onClick={() => onRemove(badZone, badPhoto.id)}>Bỏ ảnh</button>
    </div>
  );
  const paperToggle = (
    <button type="button" className="wd-paper-pill" aria-pressed={photoMode} onClick={() => setPhotoMode(!photoMode)}>
      📄 Ảnh chụp giấy{photoMode ? ': Bật' : ''}
    </button>
  );
  const status = (
    <>
      {clarityBanner}
      {jobLine(current)}
      {current?.note && <p className="wd-note">{current.note}</p>}
      {error && <p className="wd-err" role="alert">{error}</p>}
      {!error && note && <p className="wd-note" role="status">{note}</p>}
      {saveCount > 0 && usePhotoMode && current?.status !== 'done' && (
        <div className="wd-all-bar" role="status">
          <span>Đã có {saveCount} câu đọc xong, sẵn sàng lưu vào Sổ tay.</span>
          <button type="button" className="rd-btn rd-btn--pink" style={{ padding: '7px 14px', fontSize: 13.5 }} onClick={onShowDrafts}>Soát &amp; Lưu tất cả ({saveCount})</button>
        </div>
      )}
    </>
  );
  const chips = (list: number[]) => (
    <div className="wd-gq">
      {list.map(number => {
        const card = cards.find(item => item.questionNumber === number)!;
        return <button key={number} type="button" className={'wd-qn' + (recorded(card) ? ' is-d' : '')} onClick={() => onManual(number)}
          aria-label={`Câu ${number}, ${recorded(card) ? 'đã ghi' : 'chưa ghi'}`}>{number}</button>;
      })}
    </div>
  );

  // Listening default: fast reason chips + optional button to switch to photo/transcript capture.
  if (!usePhotoMode) {
    return (
      <>
        {head}
        <div className="wd-body">
          <div className="wd-lead-row">
            <p className="wd-lead">Phần Nghe chỉ cần lý do: chạm một lý do cho từng câu.</p>
            {canRead && (
              <button type="button" className="wd-chip-btn" onClick={() => setListeningPhoto(true)}>
                📸 {part === 1 ? 'Chụp tranh / chữa bài' : 'Chụp trang chữa bài / Transcript'}
              </button>
            )}
          </div>
          <div className="wd-rlist">
            {cards.map(card => (
              <div key={card.id} className="wd-rr is-reason">
                <b className="wd-rn">Câu {card.questionNumber}</b>
                {recorded(card) && <span className="wd-tag">đã ghi</span>}
                <ReasonChips part={part} number={card.questionNumber!} value={(forms[card.id] ?? EMPTY_FORM).category} onPick={category => onUpdate(card.id, { category })} />
              </div>
            ))}
          </div>
          {status}
        </div>
        <footer className="wd-foot">
          <span className="wd-q">{draftState}</span>
          <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!saveCount} onClick={onSaveReasons}>{saveCount ? `Lưu ${saveCount} câu` : 'Lưu'}</button>
        </footer>
      </>
    );
  }

  const zoneProps = { phone, disabled: busy, camera: phone, clarity, onAdd: onAddFiles, onCameraAdd, onEdit: onEditPhoto, onRemove, onActivate: setActiveZone };
  const noImages = !canRead && <p className="wd-note">Phiên bản này chưa đọc được ảnh. Ghi tay từng câu: chạm số câu bên dưới.</p>;
  const backToReasonBar = mode === 'reason' && (
    <div className="wd-lead-row">
      <p className="wd-lead">Chụp trang chữa bài / transcript Part {part} để AI trích câu hỏi &amp; lời giải.</p>
      <button type="button" className="wd-chip-btn" onClick={() => setListeningPhoto(false)}>‹ Quay lại chọn lý do nhanh</button>
    </div>
  );

  // Single-question Parts (Part 1, Part 2, Part 5): one unified zone, parallel auto-chunked for 4+ shots.
  if (!grouped) {
    const count = zones.questions.length;
    const sendLabel = `Gửi Sóc đọc ${count || ''} ảnh`.replace('  ', ' ');
    return (
      <>
        {head}
        <div className="wd-body">
          {backToReasonBar}
          {canRead ? <DropZone {...zoneProps} zone="questions" big title={`Ảnh câu Part ${part}`}
            note={part === 2 ? 'hỗ trợ 3 phương án A–C' : 'mỗi ảnh một hay nhiều câu'}
            items={zones.questions} hint={<>{pasteHint(phone)} Sóc đọc song song tối đa 3 lượt cùng lúc, chỉ lấy câu bạn sai.</>} /> : noImages}
          {canRead && <div className="wd-acts" style={{ marginTop: 10 }}>{paperToggle}</div>}
          <div className="wd-lbl">Câu cần gỡ<span className="wd-lg"><span><i className="is-d" />đã ghi</span><span><i />chưa ghi</span></span></div>
          {chips(numbers)}
          {status}
        </div>
        <footer className="wd-foot">
          {!phone && <span className="wd-q">{canRead ? 'Ảnh gửi nguyên bản; chỉ thu nhỏ khi quá nặng.' : draftState}</span>}
          {phone
            ? <button type="button" className="rd-btn rd-btn--white wd-side" onClick={() => onManual(firstOpen(numbers))}>✎ Ghi tay</button>
            : <button type="button" className="wd-quiet is-pink" onClick={() => onManual(firstOpen(numbers))}>✎ Ghi tay một câu</button>}
          {canRead && <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!count || busy} onClick={onSend}>{sendLabel}</button>}
        </footer>
      </>
    );
  }

  // Grouped Parts (Part 3, 4, 6, 7): 1 unified image tray per group (Module 2.7), Auto-Advance, editable Part 7 range.
  const groups = suggestGroups(part as 3 | 4 | 6 | 7, numbers, part === 7 ? customPart7Ranges : undefined);
  const selected = groups.find(group => group.from === groupFrom) ?? groups[0];
  const selectedIdx = groups.findIndex(group => group.from === selected.from);
  const nextUnread = [...groups.slice(selectedIdx + 1), ...groups.slice(0, selectedIdx)].find(group => {
    const job = jobOf(`g${group.from}`);
    const unrecorded = group.wrong.some(number => !recorded(cards.find(card => card.questionNumber === number)!));
    return unrecorded && !job;
  }) ?? null;

  const unifiedTray = (
    <div className="wd-zones is-single">
      <DropZone
        {...zoneProps}
        zone="questions"
        big={!phone}
        title={part === 7 ? 'Ảnh bài đọc & câu hỏi' : part === 6 ? 'Ảnh đoạn văn & câu hỏi' : 'Ảnh transcript & câu hỏi'}
        note={part === 7 ? `${selected.passages} bài đọc · tối đa 10 ảnh` : undefined}
        items={allStaged}
        hint={<>{pasteHint(phone)} {groupHint(part, selected.passages)}</>}
      />
    </div>
  );
  const groupState = (from: number) => {
    const job = jobOf(`g${from}`);
    return !job ? '' : job.status === 'waiting' ? 'Chờ đọc…' : job.status === 'reading' ? 'Đang đọc…' : job.status === 'failed' ? 'Chưa đọc được · Thử lại' : `Đã đọc ${job.readIds.length} câu · Xem`;
  };
  const groupRow = (group: (typeof groups)[number]) => {
    const on = group.from === selected.from;
    return (
      <div key={group.from} className={'wd-gr' + (on ? ' is-on' : '') + (on && phone ? ' is-wrap' : '')}>
        <button type="button" className="wd-gr-b" aria-pressed={on} onClick={() => { setEditingRange(false); setGroupFrom(group.from); }}>
          <span className="wd-gr-t"><b>Nhóm {group.from}–{group.to}</b><small>{groupState(group.from) || `${group.kind} · sai ${group.wrong.join(', ')}`}</small></span>
          <span className="wd-gq is-sm">{group.wrong.map(number => <span key={number} className={'wd-qn is-sm' + (recorded(cards.find(card => card.questionNumber === number)!) ? ' is-d' : '')}>{number}</span>)}</span>
        </button>
        {on && phone && part === 7 && (
          <div style={{ padding: '0 10px 6px' }}>
            {editingRange
              ? <RangeEditor group={selected} onSave={(f, t) => onEditPart7Range(selected.from, f, t)} onCancel={() => setEditingRange(false)} />
              : <button type="button" className="wd-gr-edit" onClick={() => setEditingRange(true)}>✎ Đổi dải câu</button>}
          </div>
        )}
        {on && phone && canRead && unifiedTray}
      </div>
    );
  };
  const filesCount = allStaged.length;
  if (phone) {
    return (
      <>
        {head}
        <div className="wd-body">
          {backToReasonBar}
          <div className="wd-lbl">Chọn nhóm {part >= 6 ? 'bài đọc' : 'câu nghe'}<small>{groups.length} nhóm</small></div>
          {noImages}
          <div className="wd-glist">{groups.map(groupRow)}</div>
          {canRead && <div className="wd-acts" style={{ marginTop: 10 }}>{paperToggle}</div>}
          {status}
        </div>
        <footer className="wd-foot">
          <button type="button" className="rd-btn rd-btn--white wd-side" onClick={() => onManual(firstOpen(selected.wrong))}>✎ Ghi tay</button>
          {canRead && nextUnread && (
            <button type="button" className="rd-btn rd-btn--white wd-side" disabled={!filesCount || busy} onClick={() => onSendNext(nextUnread.from)}>Gửi &amp; qua tiếp ›</button>
          )}
          {canRead && <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!filesCount || busy} onClick={onSend}>Gửi Sóc đọc {selected.from}–{selected.to}</button>}
        </footer>
      </>
    );
  }
  return (
    <>
      {head}
      <div className="wd-body">
        {backToReasonBar}
        <div className="wd-p7">
          <div className="wd-gcol">
            <div className="wd-lbl is-top">Nhóm {part >= 6 ? 'bài đọc' : 'câu nghe'}<small>{groups.length} nhóm có câu sai</small></div>
            <div className="wd-glist is-scroll">{groups.map(groupRow)}</div>
          </div>
          <section className="wd-gsel" aria-label={`Nhóm ${selected.from}–${selected.to}`}>
            <div className="wd-gsh">
              <Soc state="think" size={54} className="wd-soc" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>
                  Nhóm {selected.from}–{selected.to} · bạn sai {selected.wrong.join(', ')}
                  {part === 7 && !editingRange && (
                    <button type="button" className="wd-gr-edit" onClick={() => setEditingRange(true)}>✎ Đổi dải câu</button>
                  )}
                </b>
                <small>{groupHint(part, selected.passages)}</small>
                {part === 7 && editingRange && (
                  <RangeEditor group={selected} onSave={(f, t) => onEditPart7Range(selected.from, f, t)} onCancel={() => setEditingRange(false)} />
                )}
              </div>
            </div>
            {canRead ? <>
              {unifiedTray}
              <div className="wd-acts">
                <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!filesCount || busy} onClick={onSend}>Gửi Sóc đọc nhóm này</button>
                {nextUnread && (
                  <button type="button" className="rd-btn rd-btn--white wd-side" disabled={!filesCount || busy} onClick={() => onSendNext(nextUnread.from)}>
                    Gửi &amp; qua nhóm tiếp ›
                  </button>
                )}
                {paperToggle}
                <span className="wd-zp">Đọc song song tối đa 3 nhóm; trong lúc chờ, gửi tiếp nhóm khác.</span>
              </div>
            </> : noImages}
            {status}
          </section>
        </div>
      </div>
      <footer className="wd-foot">
        <span className="wd-q">{draftState}</span>
        {saveCount > 0 && (
          <button type="button" className="rd-btn rd-btn--white wd-side" onClick={onShowDrafts}>Soát &amp; Lưu tất cả ({saveCount})</button>
        )}
        <button type="button" className="wd-quiet is-pink" onClick={() => onManual(firstOpen(selected.wrong))}>✎ Ghi tay một câu</button>
      </footer>
    </>
  );
}

/* ---------- 3 · after a capture ---------- */

export function ReviewView({ phone, testName, total, doneCount, onClose, screen, cards, forms, openRow, setOpenRow, writing, saveCount, error, note, rejectionReasons = [], wrongTotal, onUpdate,
  canAddImages, onBack, onSave }: Common & {
  screen: Extract<Screen, { name: 'review' }>; cards: Map<string, MistakeEntry>; forms: Record<string, CardForm>; openRow: string; setOpenRow: (id: string) => void;
  writing: number; saveCount: number; error: string; note: string; rejectionReasons?: PageRejectionReason[]; wrongTotal: number; onUpdate: (id: string, patch: Partial<CardForm>) => void;
  canAddImages: boolean; onBack: () => void; onSave: () => void;
}) {
  const read = screen.ids.length + screen.skipped.length;
  const title = screen.part ? `Sóc đọc được ${read} câu` : `${screen.ids.length} câu chưa lưu`;
  const sub = screen.part ? <>Part {screen.part} · lý do Sóc chọn sẵn, chạm để đổi{!phone && <> · <span className="wd-key is-me">■</span> bạn chọn <span className="wd-key is-ok">■</span> đáp án</>}</>
    : `${testName} · kiểm tra rồi lưu`;
  const groupTo = screen.group ? (screen.part === 6 ? screen.group + 3 : screen.part === 3 || screen.part === 4 ? screen.group + 2 : suggestGroups(7, [screen.group])[0]?.to) : undefined;
  return (
    <>
      <Head phone={phone} title={title} sub={sub} back={onBack} pill={<Pill done={doneCount} total={total} />} onClose={onClose} />
      <div className="wd-body">
        <div className="wd-rlist">
          {screen.ids.map(id => <ReviewRow key={id} card={cards.get(id)!} form={forms[id] ?? EMPTY_FORM} open={openRow === id} phone={phone}
            onToggle={() => setOpenRow(openRow === id ? '' : id)} onUpdate={patch => onUpdate(id, patch)} />)}
          {screen.skipped.map(number => (
            <div key={number} className="wd-skip"><b>Câu {number}</b>bạn làm đúng, bỏ qua{!phone && <s>không thuộc {wrongTotal} câu sai</s>}</div>
          ))}
          {screen.missing.length > 0 && <p className="wd-miss">Chưa thấy câu {screen.missing.join(', ')} trong ảnh.{' '}
            {canAddImages && <button type="button" className="wd-lnk" onClick={onBack}>{groupTo ? `Thêm ảnh nhóm ${screen.group}–${groupTo}` : 'Thêm ảnh'}</button>}</p>}
          {rejectionReasons.length > 0 && (
            <ul className="wd-reasons" role="status">
              {rejectionReasons.map((reason, idx) => <li key={`${reason.number ?? 'x'}-${idx}`}>{reason.detail}</li>)}
            </ul>
          )}
        </div>
        {error && <p className="wd-err" role="alert">{error}</p>}
        {!error && note && <p className="wd-note" role="status">{note}</p>}
      </div>
      <footer className={'wd-foot' + (phone ? ' is-stack' : '')}>
        {writing > 0 && <span className="wd-wr" role="status"><i className="wd-spin" aria-hidden="true" />Đang viết lời giải {writing} câu{phone ? '' : '. Lưu ngay cũng được.'}</span>}
        <span className="wd-sp" />
        <div className="wd-foot-acts">
          {canAddImages && <button type="button" className="rd-btn rd-btn--white wd-side" onClick={onBack}>{phone ? '+ Ảnh' : '+ Thêm ảnh'}</button>}
          <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!saveCount} onClick={onSave}>{saveCount ? `Lưu ${saveCount} câu` : 'Lưu'}</button>
        </div>
      </footer>
    </>
  );
}

function ReviewRow({ card, form, open, phone, onToggle, onUpdate }: { card: MistakeEntry; form: CardForm; open: boolean; phone: boolean;
  onToggle: () => void; onUpdate: (patch: Partial<CardForm>) => void }) {
  const number = card.questionNumber!, doubt = openDoubt(form), ask = Boolean(form.ai) && !form.answer;
  const question = form.ai?.question?.trim().split('\n')[0] ?? '';
  const reasons = reasonsFor(card.part).map(([category]) => category);
  const keys = (event: KeyboardEvent) => {
    const digit = Number(event.key);
    if ((event.target as HTMLElement).tagName === 'TEXTAREA' || !(digit >= 1 && digit <= reasons.length)) return;
    event.preventDefault(); onUpdate({ category: reasons[digit - 1] });
  };
  return (
    <div className={'wd-rr' + (doubt || ask ? ' is-unsure' : '') + (open ? ' is-open' : '') + (phone ? ' is-phone' : '')} onKeyDown={keys}>
      <b className="wd-rn">Câu {number}</b>
      <button type="button" className="wd-qt" aria-expanded={open} onClick={onToggle} aria-label={`Mở câu ${number}`}>{question || 'Chưa có câu hỏi · chạm để điền'}</button>
      <span className="wd-sheet">
        <Sheet number={number} part={card.part} form={form} ask={ask} onAnswer={letter => onUpdate({ answer: letter })} />
        {isExplaining(card.id) && <span className="wd-spin" role="img" aria-label="Đang viết lời giải" />}
      </span>
      <ReasonChips part={card.part} number={number} value={form.category} onPick={category => onUpdate({ category })} />
      {doubt ? <div className="wd-un"><span className="wd-pl">chưa chắc</span>Sóc giải ra {doubt}, trang đề ghi {form.answer}
          <button type="button" onClick={() => onUpdate({ answer: doubt })}>Đổi sang {doubt}</button>
          <button type="button" onClick={() => form.ai && onUpdate({ ai: { ...form.ai, answerDoubt: '' } })}>Giữ {form.answer}</button></div>
        : ask ? <div className="wd-un"><span className="wd-pl">chưa chắc</span>Ảnh không có đáp án. Chạm chữ cái đúng.{isExplaining(card.id) ? ' (Sóc đang tự giải…)' : ''}</div> : null}
      {Boolean(form.ai) && !form.choice && (
        <div className="wd-un" role="group" aria-label={`Chọn nhanh câu ${number} bạn chọn`}>
          <span className="wd-pl">bạn chọn?</span>Ảnh chưa có dấu chọn:
          {lettersFor(card.part).map(letter => (
            <button key={letter} type="button" disabled={letter === form.answer} onClick={() => onUpdate({ choice: letter })}>{letter}</button>
          ))}
          <button type="button" onClick={() => onUpdate({ choice: 'BLANK' })}>Bỏ trống</button>
        </div>
      )}
      {open && <RowDetail card={card} form={form} phone={phone} onUpdate={onUpdate} />}
    </div>
  );
}

/** The opened row: the passage, the options with what was chosen and what is right, the pickers and the explanation. */
function RowDetail({ card, form, phone, onUpdate }: { card: MistakeEntry; form: CardForm; phone: boolean; onUpdate: (patch: Partial<CardForm>) => void }) {
  const [showPassage, setShowPassage] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const ai = form.ai, chosen = chosenOf(form), doubt = openDoubt(form);
  const editing = editOpen || !ai || !form.answer;
  const question = ai?.question?.trim() ?? '';
  return (
    <div className="wd-detail">
      {ai?.context?.trim() && (card.part === 3 || card.part === 4 || card.part >= 6) && <div>
        <button type="button" className="wd-lnk is-muted" aria-expanded={showPassage} onClick={() => setShowPassage(value => !value)}>
          {showPassage ? '▾' : '▸'} {card.part <= 4 ? 'Transcript' : 'Đoạn văn'}: {ai.context.trim().split('\n')[0]}</button>
        {showPassage && <p className="wd-passage">{ai.context}</p>}
      </div>}
      {question.length > (phone ? 40 : 80) && <p className="wd-fullq">{question}</p>}
      {ai && ai.options.length > 0 && <ul className="wd-opts">
        {ai.options.map(option => {
          const letter = optionLetter(option);
          return <li key={option} className={letter === form.answer ? 'is-ok' : letter === chosen ? 'is-me' : ''}>
            <span>{option}</span>
            {doubt && letter === doubt && <em>AI chọn</em>}
            {doubt && letter === form.answer && <em className="is-ok">Trang đề</em>}
          </li>;
        })}
      </ul>}
      {!ai && <p className="wd-note">Câu này chưa có trong ảnh nào. Thêm ảnh, chọn đáp án bên dưới, hoặc chỉ chọn lý do.</p>}
      {editing && <div className="wd-pick">
        <span>Bạn chọn</span><Letters label="Bạn chọn" part={card.part} value={form.choice} tone="me" allowBlank onPick={letter => onUpdate({ choice: letter })} />
        <span>Đáp án</span><Letters label="Đáp án" part={card.part} value={form.answer} tone="ok" onPick={letter => onUpdate({ answer: letter === 'BLANK' ? '' : letter })} />
      </div>}
      {ai?.explanation?.quickTip?.trim()
        ? <ExplanationView explanation={ai.explanation} trapTip={ai.trapTip}
            optionMeanings={resolveQuizOptions({ ...card, options: ai.options, optionNotes: ai.optionNotes, correctAnswer: ai.correctAnswer }).options} />
        : isExplaining(card.id) ? <p className="wd-wr">Đang viết lời giải…</p>
          : ai && <p className="wd-note">Chưa có lời giải phù hợp với thông tin hiện tại. Lưu thẻ rồi chọn Giải thích với AI.</p>}
      {!editing && !doubt && <button type="button" className="wd-lnk" onClick={() => setEditOpen(true)}>Sửa đáp án</button>}
    </div>
  );
}

/* ---------- 4 · done ---------- */

export function DoneView({ phone, testName, total, onClose, progress, cards, reviewIds, onReview }: Common & {
  progress: PartProgress[]; cards: MistakeEntry[]; reviewIds: string[]; onReview: () => void;
}) {
  const top = topReason(cards);
  return (
    <>
      <Head phone={phone} title="Gỡ câu sai" sub={phone ? testName : `${testName} · ${total} câu sai`} pill={<Pill done={total} total={total} />} onClose={onClose} />
      <div className="wd-body">
        <div className="wd-conf" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
        <section className="wd-done">
          <Soc state="idle" size={phone ? 150 : 160} className="wd-soc" />
          <div>
            <h3>Gỡ xong {total} câu!</h3>
            <p>Cả {total} câu đã vào Sổ tay.{top && <> Lỗi bạn gặp nhiều nhất là <b>{reasonLabel(top.category)}</b> ({top.count} câu).</>}</p>
            {!phone && <div className="wd-acts">
              {reviewIds.length > 0 && <button type="button" className="rd-btn rd-btn--pink wd-main" onClick={onReview}>Ôn {reviewIds.length} câu trong Sổ tay</button>}
              <button type="button" className="wd-quiet" onClick={onClose}>Đóng</button>
            </div>}
          </div>
        </section>
        <div className="wd-mini">
          {progress.map(entry => <div key={entry.part}>{phone ? 'P' : 'Part '}{entry.part}<small>{entry.done}/{entry.numbers.length}</small><i /></div>)}
        </div>
      </div>
      {phone
        ? <footer className="wd-foot is-stack">
            {reviewIds.length > 0 && <button type="button" className="rd-btn rd-btn--pink wd-main" onClick={onReview}>Ôn {reviewIds.length} câu trong Sổ tay</button>}
            <button type="button" className="wd-quiet is-center" onClick={onClose}>Đóng</button>
          </footer>
        : <footer className="wd-foot"><span className="wd-q">Sóc sẽ nhắc ôn lại từng câu theo lịch.</span></footer>}
    </>
  );
}

/* ---------- 5 · one question by hand ---------- */

export function ManualCard({ phone, part, number, numbers, form, error, onPick, onUpdate, onSave, onCancel }: {
  phone: boolean; part: PartNumber; number: number; numbers: number[]; form: CardForm; error: string;
  onPick: (number: number) => void; onUpdate: (patch: Partial<CardForm>) => void; onSave: () => void; onCancel: () => void;
}) {
  const [extra, setExtra] = useState(Boolean(form.raw));
  const reasonOnly = partMode(part) === 'reason';
  return (
    <>
      <div className="wd-mdim" onClick={onCancel} aria-hidden="true" />
      <div className={phone ? 'wd-psheet' : 'wd-mc'} role="group" aria-label="Ghi tay một câu">
        {phone && <span className="wd-grab" aria-hidden="true" />}
        <div className="wd-hh"><b>Ghi tay một câu</b><button type="button" className="wd-x is-sm" aria-label="Đóng ghi tay" onClick={onCancel}>✕</button></div>
        <div className="wd-fl">CÂU NÀO?</div>
        <div className="wd-nums">
          {numbers.map(value => <button key={value} type="button" className={'wd-qn' + (value === number ? ' is-sel' : '')} aria-pressed={value === number} onClick={() => onPick(value)}>{value}</button>)}
        </div>
        {!reasonOnly && <>
          <div className="wd-fl">BẠN CHỌN</div>
          <Letters label="Bạn chọn" part={part} value={form.choice} tone="me" allowBlank onPick={letter => onUpdate({ choice: letter })} />
          <div className="wd-fl">ĐÁP ÁN ĐÚNG</div>
          <Letters label="Đáp án" part={part} value={form.answer} tone="ok" onPick={letter => onUpdate({ answer: letter === 'BLANK' ? '' : letter })} />
        </>}
        <div className="wd-fl">VÌ SAO SAI?</div>
        <ReasonChips part={part} number={number} value={form.category} big={!phone} onPick={category => onUpdate({ category })} />
        {!reasonOnly && (extra
          ? <label className="wd-raw"><span className="wd-fl">CÂU HỎI VÀ PHƯƠNG ÁN</span>
              <textarea value={form.raw} rows={4} placeholder={'Dán câu hỏi và các phương án\n(A) …\n(B) …'} onChange={event => onUpdate({ raw: event.target.value })} /></label>
          : <button type="button" className="wd-opt" onClick={() => setExtra(true)}>+ Câu hỏi và phương án <span>(không bắt buộc)</span></button>)}
        {error && <p className="wd-err" role="alert">{error}</p>}
        <div className="wd-mact">
          <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={isEmptyForm(form)} onClick={onSave}>Lưu câu {number}</button>
          {!phone && <button type="button" className="wd-quiet" onClick={onCancel}>Huỷ</button>}
        </div>
      </div>
    </>
  );
}
