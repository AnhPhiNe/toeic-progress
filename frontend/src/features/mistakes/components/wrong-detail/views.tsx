import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { Soc } from '@/shared/ui/soc/Soc';
import { CHOICE_LETTERS, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { EMPTY_FORM, isEmptyForm, openDoubt, type CardForm } from '@/features/mistakes/lib/detailForm';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { isExplaining } from '@/features/mistakes/services/explanationQueue';
import { ExplanationView } from '@/features/mistakes/components/ExplanationView';
import { PART_ACTION, PART_NAMES, partMode, suggestGroups, topReason, type PartProgress } from '@/features/mistakes/lib/wrongDetail';
import type { ReadingState, Screen } from './WrongDetailFlow';

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
const sheetLabel = (chosen: string, answer: string) => [chosen && `Bạn chọn ${chosen}`, answer ? `đáp án ${answer}` : 'chưa có đáp án'].filter(Boolean).join(', ');

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
    <span className="wd-abc" role="group" aria-label={`Câu ${number}: ${sheetLabel(chosen, form.answer)}`}>
      {lettersFor(part).map(letter => (
        <button key={letter} type="button" disabled={letter === chosen} aria-label={`Đáp án đúng ${letter}`} aria-pressed={letter === form.answer}
          className={letter === chosen ? 'is-me' : letter === form.answer ? 'is-ok' : ask ? 'is-ask' : ''} onClick={() => onAnswer(letter)}>{letter}</button>
      ))}
    </span>
  );
}

function Letters({ label, part, value, tone, onPick }: { label: string; part: number; value: string; tone: 'me' | 'ok'; onPick: (letter: ChoiceLetter | '') => void }) {
  return (
    <div className="wd-lt" role="group" aria-label={label}>
      {lettersFor(part).map(letter => (
        <button key={letter} type="button" aria-pressed={value === letter} className={value === letter ? `is-${tone}` : ''}
          onClick={() => onPick(value === letter ? '' : letter)}>{letter}</button>
      ))}
    </div>
  );
}

function DropZone({ zone, num, title, note, hint, items, big = false, disabled, onAdd, onRemove, onActivate }: {
  zone: Zone; num?: number; title: string; note?: string; hint?: ReactNode; items: Staged[]; phone: boolean; big?: boolean; disabled: boolean;
  onAdd: (files: File[], zone: Zone) => void; onRemove: (zone: Zone, id: string) => void; onActivate: (zone: Zone) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const label = zone === 'passage' ? 'Ảnh đoạn văn' : 'Ảnh câu hỏi';
  return (
    <div className={'wd-zn' + (big ? ' is-big' : '')} onClick={() => onActivate(zone)}
      onDragOver={event => { if (!disabled) { event.preventDefault(); event.stopPropagation(); } }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); onAdd([...event.dataTransfer.files], zone); }}>
      <h5>{num && <em>{num}</em>}{title}{note && <small>{note}</small>}</h5>
      <div className="wd-ths">
        {items.map((item, index) => (
          <span key={item.id} className={'wd-pg' + (zone === 'questions' ? ' is-q' : '')}>
            <img src={item.url} alt={`${label} ${index + 1}`} />
            <button type="button" aria-label={`Bỏ ${label.toLowerCase()} ${index + 1}`} disabled={disabled} onClick={event => { event.stopPropagation(); onRemove(zone, item.id); }}>×</button>
          </span>
        ))}
        <button type="button" className="wd-pg is-add" aria-label={`Thêm ${label.toLowerCase()}`} disabled={disabled} onClick={event => { event.stopPropagation(); onActivate(zone); input.current?.click(); }}>+</button>
      </div>
      {hint && <p className="wd-zp">{hint}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label={label}
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; onAdd(files, zone); }} />
    </div>
  );
}

const pasteHint = (phone: boolean) => phone ? 'Chọn ảnh từ máy.' : <>Thả, dán <span className="wd-kbd">Ctrl+V</span> hoặc chọn ảnh.</>;

/* ---------- 1 · overview ---------- */

export function Overview({ phone, testName, total, doneCount, onClose, progress, hero, canRead, toast, pendingDrafts, onOpenPart, onShowDrafts, onDiscardDrafts, error }: Common & {
  progress: PartProgress[]; hero: PartProgress | null; canRead: boolean; toast: { id: number; text: string } | null; pendingDrafts: number;
  onOpenPart: (part: PartNumber) => void; onShowDrafts: () => void; onDiscardDrafts: () => void; error: string;
}) {
  const heroLeft = hero ? hero.numbers.length - hero.done : 0;
  const most = hero && Math.max(...progress.map(entry => entry.numbers.length)) === hero.numbers.length;
  const heroMode = hero ? partMode(hero.part) : 'page';
  const heroButton = !hero ? '' : heroMode === 'reason' ? `Chọn lý do Part ${hero.part}` : !canRead ? `Ghi tay Part ${hero.part}`
    : heroMode === 'transcript' ? `Chụp transcript Part ${hero.part}` : hero.done ? `Chụp tiếp Part ${hero.part}` : `Chụp trang chữa bài Part ${hero.part}`;
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
        {error && <p className="wd-err" role="alert">{error}</p>}
        {pendingDrafts > 0 && (
          <div className="wd-toast is-drafts" role="status">Còn {pendingDrafts} câu nháp chưa lưu
            <button type="button" onClick={onShowDrafts}>Xem</button><button type="button" className="is-quiet" onClick={onDiscardDrafts}>Bỏ nháp</button></div>
        )}
      </div>
      <footer className="wd-foot">
        <span className="wd-q">{phone ? 'Tiến độ tự lưu.' : 'Câu chưa ghi chờ ở đây, chưa vào Sổ tay. Làm tiếp lúc nào cũng được.'}</span>
        <button type="button" className="wd-quiet" onClick={onClose}>Để sau</button>
      </footer>
    </>
  );
}

/* ---------- 2 · one Part ---------- */

const groupHint = (part: number, passages: number) => part === 6 ? 'Thả ảnh đoạn văn có các chỗ trống. Câu hỏi nằm ngay trong đoạn thì chỉ cần ô ①.'
  : passages === 3 ? 'Đoạn ba: thả cả 3 bài đọc, rồi ảnh câu hỏi. Sóc dùng chung đoạn văn cho cả nhóm.'
    : passages === 2 ? 'Đoạn kép: thả cả 2 bài đọc, rồi ảnh câu hỏi. Sóc dùng chung đoạn văn cho cả nhóm.'
      : 'Thả ảnh bài đọc, rồi ảnh câu hỏi. Câu hỏi cùng ảnh với bài đọc thì chỉ cần ô ①.';

export function PartView({ phone, testName, total, doneCount, onClose, part, cards, recorded, forms, groupFrom, setGroupFrom, zones, setActiveZone, onAddFiles, onRemove,
  reading, elapsed, error, note, draftState, canRead, onSend, onBack, onManual, onUpdate, onSaveReasons, saveCount, onShowDrafts }: Common & {
  part: PartNumber; cards: MistakeEntry[]; recorded: (card: MistakeEntry) => boolean; forms: Record<string, CardForm>; dirty: Set<string>;
  groupFrom: number | null; setGroupFrom: (from: number) => void; zones: Record<Zone, Staged[]>; activeZone: Zone | null; setActiveZone: (zone: Zone) => void;
  onAddFiles: (files: File[], zone?: Zone) => void; onRemove: (zone: Zone, id: string) => void; reading: ReadingState | null; elapsed: number;
  error: string; note: string; draftState: string; canRead: boolean; onSend: () => void; onBack: () => void; onManual: (number: number) => void;
  onUpdate: (id: string, patch: Partial<CardForm>) => void; onSaveReasons: () => void; saveCount: number; onShowDrafts: () => void;
}) {
  const mode = partMode(part), numbers = cards.map(card => card.questionNumber!);
  const done = cards.filter(recorded).length, busy = reading !== null;
  const firstOpen = (list: number[]) => list.find(number => !recorded(cards.find(card => card.questionNumber === number)!)) ?? list[0];
  const title = `Part ${part} · ${PART_NAMES[part]}`;
  const sub = phone ? `${numbers.length} câu sai · đã ghi ${done}/${numbers.length}` : `${testName} · ${numbers.length} câu sai`;
  const head = <Head phone={phone} title={title} sub={sub} back={busy ? undefined : onBack} pill={<Pill done={doneCount} total={total} />} onClose={onClose} />;
  const status = (
    <>
      {busy && <p className="wd-reading" role="status"><Soc state="think" size={40} />Sóc đang đọc{reading.total > 1 ? ` lượt ${Math.min(reading.done + 1, reading.total)}/${reading.total}` : ' ảnh'} · {elapsed} giây</p>}
      {error && <p className="wd-err" role="alert">{error}</p>}
      {!error && note && <p className="wd-note" role="status">{note}</p>}
      {!busy && saveCount > 0 && mode !== 'reason' && <p className="wd-note">{saveCount} câu đã đọc, chưa lưu. <button type="button" className="wd-lnk" onClick={onShowDrafts}>Xem và lưu</button></p>}
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

  // Part 1–2: only the reason.
  if (mode === 'reason') {
    return (
      <>
        {head}
        <div className="wd-body">
          <p className="wd-lead">Part {part} không có chữ để chụp. Chọn vì sao bạn sai từng câu.</p>
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

  const zoneProps = { phone, disabled: busy, onAdd: onAddFiles, onRemove, onActivate: setActiveZone };
  const noImages = !canRead && <p className="wd-note">Phiên bản này chưa đọc được ảnh. Ghi tay từng câu: chạm số câu bên dưới.</p>;

  // Part 3–5: one zone; each image is read on its own.
  if (part <= 5) {
    const count = zones.questions.length;
    const sendLabel = `Gửi Sóc đọc ${count || ''} ảnh`.replace('  ', ' ');
    return (
      <>
        {head}
        <div className="wd-body">
          {canRead ? <DropZone {...zoneProps} zone="questions" big title={mode === 'transcript' ? `Ảnh transcript Part ${part}` : `Ảnh câu Part ${part}`} note="mỗi ảnh một hay nhiều câu"
            items={zones.questions} hint={<>{pasteHint(phone)} Sóc đọc từng ảnh riêng, chỉ lấy câu bạn sai.</>} /> : noImages}
          <div className="wd-lbl">Câu cần gỡ<span className="wd-lg"><span><i className="is-d" />đã ghi</span><span><i />chưa ghi</span></span></div>
          {chips(numbers)}
          {status}
        </div>
        <footer className="wd-foot">
          {!phone && <span className="wd-q">{canRead ? 'Ảnh nén trên máy (JPEG, cạnh dài khoảng 2000px).' : draftState}</span>}
          {phone
            ? <button type="button" className="rd-btn rd-btn--white wd-side" onClick={() => onManual(firstOpen(numbers))}>✎ Ghi tay</button>
            : <button type="button" className="wd-quiet is-pink" onClick={() => onManual(firstOpen(numbers))}>✎ Ghi tay một câu</button>}
          {canRead && <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!count || busy} onClick={onSend}>{sendLabel}</button>}
        </footer>
      </>
    );
  }

  // Part 6–7: a passage group at a time; its passage and question images are read together.
  const groups = suggestGroups(part as 6 | 7, numbers);
  const selected = groups.find(group => group.from === groupFrom) ?? groups[0];
  const zonesFor = (stacked: boolean) => (
    <div className={'wd-zones' + (stacked ? ' is-stacked' : '')}>
      <DropZone {...zoneProps} zone="passage" num={1} title="Đoạn văn" note={part === 7 ? `${selected.passages} bài đọc` : undefined} items={zones.passage} />
      <DropZone {...zoneProps} zone="questions" num={2} title="Câu hỏi" items={zones.questions} hint={stacked ? undefined : pasteHint(false)} />
    </div>
  );
  const groupRow = (group: (typeof groups)[number]) => {
    const on = group.from === selected.from;
    return (
      <div key={group.from} className={'wd-gr' + (on ? ' is-on' : '') + (on && phone ? ' is-wrap' : '')}>
        <button type="button" className="wd-gr-b" aria-pressed={on} onClick={() => setGroupFrom(group.from)} disabled={busy}>
          <span className="wd-gr-t"><b>Nhóm {group.from}–{group.to}</b><small>{group.kind} · sai {group.wrong.join(', ')}</small></span>
          <span className="wd-gq is-sm">{group.wrong.map(number => <span key={number} className={'wd-qn is-sm' + (recorded(cards.find(card => card.questionNumber === number)!) ? ' is-d' : '')}>{number}</span>)}</span>
        </button>
        {on && phone && canRead && zonesFor(true)}
      </div>
    );
  };
  const filesCount = zones.passage.length + zones.questions.length;
  if (phone) {
    return (
      <>
        {head}
        <div className="wd-body">
          <div className="wd-lbl">Chọn nhóm bài đọc<small>{groups.length} nhóm</small></div>
          {noImages}
          <div className="wd-glist">{groups.map(groupRow)}</div>
          {status}
        </div>
        <footer className="wd-foot">
          <button type="button" className="rd-btn rd-btn--white wd-side" onClick={() => onManual(firstOpen(selected.wrong))}>✎ Ghi tay</button>
          {canRead && <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!filesCount || busy} onClick={onSend}>Gửi Sóc đọc {selected.from}–{selected.to}</button>}
        </footer>
      </>
    );
  }
  return (
    <>
      {head}
      <div className="wd-body">
        <div className="wd-p7">
          <div className="wd-gcol">
            <div className="wd-lbl is-top">Nhóm bài đọc<small>{groups.length} nhóm có câu sai</small></div>
            <div className="wd-glist is-scroll">{groups.map(groupRow)}</div>
          </div>
          <section className="wd-gsel" aria-label={`Nhóm ${selected.from}–${selected.to}`}>
            <div className="wd-gsh">
              <Soc state="think" size={54} className="wd-soc" />
              <div><b>Nhóm {selected.from}–{selected.to} · bạn sai {selected.wrong.join(', ')}</b><small>{groupHint(part, selected.passages)}</small></div>
            </div>
            {canRead ? <>
              {zonesFor(false)}
              <div className="wd-acts">
                <button type="button" className="rd-btn rd-btn--pink wd-main" disabled={!filesCount || busy} onClick={onSend}>Gửi Sóc đọc nhóm này</button>
                <span className="wd-zp">Ảnh nén trên máy trước khi gửi.</span>
              </div>
            </> : noImages}
            {status}
          </section>
        </div>
      </div>
      <footer className="wd-foot">
        <span className="wd-q">{draftState}</span>
        <button type="button" className="wd-quiet is-pink" onClick={() => onManual(firstOpen(selected.wrong))}>✎ Ghi tay một câu</button>
      </footer>
    </>
  );
}

/* ---------- 3 · after a capture ---------- */

export function ReviewView({ phone, testName, total, doneCount, onClose, screen, cards, forms, openRow, setOpenRow, writing, saveCount, error, note, wrongTotal, onUpdate,
  canAddImages, onBack, onSave }: Common & {
  screen: Extract<Screen, { name: 'review' }>; cards: Map<string, MistakeEntry>; forms: Record<string, CardForm>; openRow: string; setOpenRow: (id: string) => void;
  writing: number; saveCount: number; error: string; note: string; wrongTotal: number; onUpdate: (id: string, patch: Partial<CardForm>) => void;
  canAddImages: boolean; onBack: () => void; onSave: () => void;
}) {
  const read = screen.ids.length + screen.skipped.length;
  const title = screen.part ? `Sóc đọc được ${read} câu` : `${screen.ids.length} câu chưa lưu`;
  const sub = screen.part ? <>Part {screen.part} · lý do Sóc chọn sẵn, chạm để đổi{!phone && <> · <span className="wd-key is-me">■</span> bạn chọn <span className="wd-key is-ok">■</span> đáp án</>}</>
    : `${testName} · kiểm tra rồi lưu`;
  const groupTo = screen.group ? (screen.part === 6 ? screen.group + 3 : suggestGroups(7, [screen.group])[0]?.to) : undefined;
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
            {canAddImages && <button type="button" className="wd-lnk" onClick={onBack}>{groupTo ? `Thêm ảnh câu hỏi nhóm ${screen.group}–${groupTo}` : 'Thêm ảnh'}</button>}</p>}
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
        : ask ? <div className="wd-un"><span className="wd-pl">chưa chắc</span>Ảnh không có đáp án. Chạm chữ cái đúng.</div> : null}
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
      {ai?.context?.trim() && card.part >= 6 && <div>
        <button type="button" className="wd-lnk is-muted" aria-expanded={showPassage} onClick={() => setShowPassage(value => !value)}>
          {showPassage ? '▾' : '▸'} Đoạn văn: {ai.context.trim().split('\n')[0]}</button>
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
        <span>Bạn chọn</span><Letters label="Bạn chọn" part={card.part} value={chosen} tone="me" onPick={letter => onUpdate({ choice: letter })} />
        <span>Đáp án</span><Letters label="Đáp án" part={card.part} value={form.answer} tone="ok" onPick={letter => onUpdate({ answer: letter })} />
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
          <Letters label="Bạn chọn" part={part} value={chosenOf(form)} tone="me" onPick={letter => onUpdate({ choice: letter })} />
          <div className="wd-fl">ĐÁP ÁN ĐÚNG</div>
          <Letters label="Đáp án" part={part} value={form.answer} tone="ok" onPick={letter => onUpdate({ answer: letter })} />
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
