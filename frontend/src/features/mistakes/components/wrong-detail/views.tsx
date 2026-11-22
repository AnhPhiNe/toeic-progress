import { useRef, useState, type ReactNode } from 'react';
import { Camera, Images } from 'lucide-react';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { CHOICE_LETTERS, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { isEmptyForm, openDoubt, type CardForm, type Choice } from '@/features/mistakes/lib/detailForm';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { isExplaining } from '@/features/mistakes/services/explanationQueue';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import type { ClarityResult } from '@/features/mistakes/lib/photoClarity';
import { MAX_CAPTURE_IMAGES } from '@/features/mistakes/lib/captureBatch';
import { partMode, topReason, type PartProgress, type PassageGroup } from '@/features/mistakes/lib/wrongDetail';
import { BurstCameraModal } from './BurstCameraModal';
import { PassageText } from '../PassageText';

export type Zone = 'passage' | 'questions';
export interface Staged { id: string; file: File; url: string }
/** A sent image and its reading: violet while Sóc reads, green with the numbers found, pink when it failed. */
export interface SentThumb { id: string; url: string; label: string; tone: 'read' | 'done' | 'fail' }
interface Common { phone: boolean; testName: string; total: number; doneCount: number; onClose: () => void }

/* ---------- small pieces ---------- */

const REASONS: Array<[ErrorCategory, string]> = [['VOCABULARY_TRAP', 'Từ vựng'], ['ADVANCED_GRAMMAR', 'Ngữ pháp'], ['LISTENING_SPEED', 'Nghe'],
  ['TIME_PRESSURE', 'Hết giờ'], ['CARELESS_DISTRACTION', 'Ẩu'], ['OTHER', 'Khác']];
export const reasonsFor = (part: number) => REASONS.filter(([category]) => part <= 4 || category !== 'LISTENING_SPEED');
export const reasonLabel = (category: ErrorCategory) => REASONS.find(([value]) => value === category)?.[1] ?? 'Khác';
const lettersFor = (part: number) => CHOICE_LETTERS.slice(0, part === 2 ? 3 : 4);
export const chosenOf = (form: CardForm) => form.choice && form.choice !== 'BLANK' ? form.choice : '';
const sheetLabel = (chosen: string, answer: string, blank = false) =>
  [blank ? 'Bỏ trống' : chosen && `Bạn chọn ${chosen}`, answer ? `đáp án ${answer}` : 'chưa có đáp án'].filter(Boolean).join(', ');

function Pill({ done, total }: { done: number; total: number }) {
  return <span className="wd-tot" role="img" aria-label={`Đã ghi ${done} trên ${total} câu`}><i><b style={{ width: `${total ? done / total * 100 : 0}%` }} /></i>{done}/{total} câu</span>;
}

export function Head({ phone, title, sub, back, pill, onClose }: { phone: boolean; title: string; sub: ReactNode; back?: () => void; pill?: ReactNode; onClose: () => void }) {
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

export function ReasonChips({ part, number, value, onPick, big = false }: { part: number; number: number; value: ErrorCategory | ''; onPick: (category: ErrorCategory) => void; big?: boolean }) {
  return (
    <div className={'wd-rs' + (big ? ' is-big' : '')} role="group" aria-label={`Vì sao sai câu ${number}`}>
      {reasonsFor(part).map(([category, label]) => (
        <button key={category} type="button" aria-pressed={value === category} onClick={() => onPick(category)}>{label}</button>
      ))}
    </div>
  );
}

/** Like an answer sheet: the learner's choice in pink, the right answer in green; a tap on another letter sets the answer. */
export function Sheet({ number, part, form, ask, onAnswer }: { number: number; part: number; form: CardForm; ask: boolean; onAnswer: (letter: ChoiceLetter) => void }) {
  const chosen = chosenOf(form);
  return (
    <span className="wd-abc" role="group" aria-label={`Câu ${number}: ${sheetLabel(chosen, form.answer, form.choice === 'BLANK')}`}>
      {lettersFor(part).map(letter => (
        <button key={letter} type="button" disabled={letter === chosen} aria-label={`Đáp án đúng ${letter}`} aria-pressed={letter === form.answer}
          className={letter === form.answer ? 'is-ok' : letter === chosen ? 'is-me' : ask ? 'is-ask' : ''} onClick={() => onAnswer(letter)}>{letter}</button>
      ))}
    </span>
  );
}

export function Letters({ label, part, value, tone, allowBlank = false, onPick }: { label: string; part: number; value: Choice; tone: 'me' | 'ok'; allowBlank?: boolean; onPick: (letter: Choice) => void }) {
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

/** A drop zone with thumbnails; clicking the empty tray opens the picker, and mobile offers side-by-side Burst Camera & multi-select Library. */
export function DropZone({ zone, num, title, note, hint, items, sent = [], big = false, disabled, camera = false, clarity, active = false, onAdd, onCameraAdd, onEdit, onMove, onSwitchZone, onRemove, onActivate }: {
  zone: Zone;
  /** Images already sent from this tray: kept as thumbnails with what Sóc found (capture v2). */
  sent?: readonly SentThumb[]; num?: number; title: string; note?: string; hint?: ReactNode; items: readonly { id: string; url: string }[]; phone: boolean; big?: boolean; disabled: boolean;
  /** Passage groups: the zone every paste, drop, watcher or camera import goes to. */
  active?: boolean;
  /** Passage groups: the visible "Chuyển sang ②/①" control on each thumbnail. */
  onSwitchZone?: (zone: Zone, id: string) => void;
  /** Phones: side-by-side Burst Camera and multi-select Gallery buttons. */
  camera?: boolean;
  clarity?: Record<string, ClarityResult | null>;
  onAdd: (files: File[], zone: Zone) => void;
  onCameraAdd?: (files: File[], zone: Zone) => void;
  onEdit?: (zone: Zone, id: string) => void;
  onMove?: (zone: Zone, id: string, delta: -1 | 1) => void;
  onRemove: (zone: Zone, id: string) => void;
  onActivate: (zone: Zone) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [burstOpen, setBurstOpen] = useState(false);
  const label = zone === 'passage' ? 'Ảnh đoạn văn' : 'Ảnh câu hỏi';
  const remaining = Math.max(1, MAX_CAPTURE_IMAGES - items.length);
  const other = zone === 'passage' ? '②' : '①';
  return (
    <div className={'wd-zn' + (big ? ' is-big' : '') + (disabled ? '' : ' is-click') + (active ? ' is-active' : '')} data-zone={zone} data-active={active || undefined}
      onClick={() => { onActivate(zone); if (!disabled) input.current?.click(); }}
      onDragOver={event => { if (!disabled) { event.preventDefault(); event.stopPropagation(); } }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); onAdd([...event.dataTransfer.files], zone); }}>
      <h5>{num && <em>{num}</em>}{title}{note && <small>{note}</small>}</h5>
      {active && <p className="wd-zn-on">Ảnh dán/chụp sẽ vào ô này</p>}
      <div className="wd-ths">
        {sent.map(item => (
          <span key={item.id} className="wd-pgw" onClick={event => event.stopPropagation()}>
            <span className="wd-pg is-sent"><img src={item.url} alt={`Ảnh đã gửi · ${item.label}`} /><span className={`wd-pg-tag is-${item.tone}`}>{item.label}</span></span>
          </span>
        ))}
        {items.map((item, index) => {
          const problem = clarity?.[item.id]?.problem;
          return (
            <span key={item.id} className="wd-pgw" onClick={event => event.stopPropagation()}>
            <span className={'wd-pg' + (zone === 'questions' ? ' is-q' : '')}>
              <img src={item.url} alt={`${label} ${index + 1}`} title="Bấm để xem to, xoay hoặc cắt ảnh"
                onClick={event => { if (!disabled && onEdit) { event.stopPropagation(); onEdit(zone, item.id); } }} />
              {problem
                ? <span className="wd-pg-warn" title={problem === 'dark' ? 'Ảnh hơi tối' : 'Ảnh hơi mờ'} aria-label={problem === 'dark' ? 'Ảnh hơi tối' : 'Ảnh hơi mờ'}>!</span>
                : items.length > 1 && <span className="wd-pg-num" aria-hidden="true">{index + 1}</span>}
              {onMove && items.length > 1 && (
                <span className="wd-pg-ord">
                  {index > 0 && (
                    <button type="button" className="wd-pg-mv" aria-label={`Đưa ${label.toLowerCase()} ${index + 1} lên trước`} title="Đưa lên trước" disabled={disabled}
                      onClick={event => { event.stopPropagation(); onMove(zone, item.id, -1); }}>‹</button>
                  )}
                  {index < items.length - 1 && (
                    <button type="button" className="wd-pg-mv" aria-label={`Đưa ${label.toLowerCase()} ${index + 1} ra sau`} title="Đưa ra sau" disabled={disabled}
                      onClick={event => { event.stopPropagation(); onMove(zone, item.id, 1); }}>›</button>
                  )}
                </span>
              )}
              {onEdit && (
                <button type="button" className="wd-pg-edit" aria-label={`Chỉnh ${label.toLowerCase()} ${index + 1}`} title="Xoay hoặc cắt ảnh" disabled={disabled}
                  onClick={event => { event.stopPropagation(); onEdit(zone, item.id); }}>✎</button>
              )}
              <button type="button" aria-label={`Bỏ ${label.toLowerCase()} ${index + 1}`} title="Xóa ảnh" disabled={disabled}
                onClick={event => { event.stopPropagation(); onRemove(zone, item.id); }}>×</button>
            </span>
            {onSwitchZone && (
              <button type="button" className="wd-pg-sw" disabled={disabled} title={`Chuyển sang ${other}`}
                aria-label={`Chuyển ${label.toLowerCase()} ${index + 1} sang ô ${other}`}
                onClick={event => { event.stopPropagation(); onSwitchZone(zone, item.id); }}>Chuyển sang {other}</button>
            )}
            </span>
          );
        })}
        {!camera && (
          <button type="button" className="wd-pg is-add" aria-label={`Thêm ${label.toLowerCase()}`} disabled={disabled} onClick={event => { event.stopPropagation(); onActivate(zone); input.current?.click(); }}>+</button>
        )}
      </div>
      {camera && (
        <div className="wd-mob-acts" onClick={event => event.stopPropagation()}>
          <button type="button" className="wd-mob-btn is-cam" aria-label={`Chụp liên tiếp ${label.toLowerCase()}`} disabled={disabled || items.length >= MAX_CAPTURE_IMAGES}
            onClick={() => { onActivate(zone); setBurstOpen(true); }}>
            <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Chụp liên tiếp</span>
          </button>
          <button type="button" className="wd-mob-btn" aria-label={`Chọn nhiều ảnh ${label.toLowerCase()}`} disabled={disabled || items.length >= MAX_CAPTURE_IMAGES}
            onClick={() => { onActivate(zone); input.current?.click(); }}>
            <Images className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Chọn nhiều ảnh</span>
          </button>
        </div>
      )}
      {hint && <p className="wd-zp">{hint}</p>}
      <input ref={input} type="file" accept="image/*" multiple hidden aria-label={label}
        onClick={event => event.stopPropagation()}
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; onAdd(files, zone); }} />
      {burstOpen && (
        <BurstCameraModal
          maxPhotos={remaining}
          title={title}
          onClose={() => setBurstOpen(false)}
          onComplete={picked => { setBurstOpen(false); (onCameraAdd ?? onAdd)(picked, zone); }}
        />
      )}
    </div>
  );
}

export const pasteHint = (phone: boolean) => phone ? 'Mẹo: chụp sẵn bằng Camera máy rồi bấm Chọn nhiều ảnh nếu chữ sách nhỏ.' : <>Thả, dán <span className="wd-kbd">Ctrl+V</span> hoặc chọn ảnh.</>;

/* ---------- 2 · one Part ---------- */

export const groupHint = (part: number, passages: number) => part === 6
  ? 'Thả hoặc chụp ảnh đoạn văn và câu hỏi của nhóm theo thứ tự, Sóc đọc cả nhóm cùng lúc.'
  : part === 3 || part === 4
    ? 'Thả hoặc chụp ảnh transcript, bảng biểu và 3 câu hỏi của cụm theo thứ tự.'
    : passages === 3
      ? 'Đoạn ba: cả 3 bài đọc vào ô ①, câu hỏi vào ô ②.'
      : passages === 2
        ? 'Đoạn kép: cả 2 bài đọc vào ô ①, câu hỏi vào ô ②.'
        : 'Bài đọc vào ô ①, câu hỏi vào ô ②.';
/** ① is optional: a screenshot with both passage and questions goes in ② alone. */
export const ONE_SHOT_HINT = 'Ảnh có cả đoạn văn và câu hỏi? Thả vào ② là được.';
/** How the learner changes the zone imports go to. */
export const zoneSwitchHint = (phone: boolean) => phone ? 'Chạm vào ô để đổi ô.' : <>Bấm vào ô hoặc phím <span className="wd-kbd">1</span>/<span className="wd-kbd">2</span> để đổi ô.</>;

export function RangeEditor({ group, onSave, onCancel }: { group: Pick<PassageGroup, 'from' | 'to'>; onSave: (from: number, to: number) => string | null; onCancel: () => void }) {
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

/* ---------- an opened row ---------- */

/** The opened row: the passage, the options with what was chosen and what is right, the pickers and the explanation. */
export function RowDetail({ card, form, phone, onUpdate }: { card: MistakeEntry; form: CardForm; phone: boolean; onUpdate: (patch: Partial<CardForm>) => void }) {
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
        {showPassage && <PassageText className="wd-passage" text={ai.context} />}
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
