import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Camera, ChevronRight, X } from 'lucide-react';
import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import type { ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { isRightForm, openDoubt, type CardForm } from '@/features/mistakes/lib/detailForm';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { LISTENING_REASONS, listeningReasonShort, type Doubt } from '@/features/mistakes/lib/captureShots';
import { chosenOf, ReasonChips, RowDetail, Sheet } from './views';
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
          {category === suggested && <span className="cv-sgb"><Soc state="idle" size={18} className="cv-sg-soc" />Sóc gợi ý</span>}
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
  let action: ReactNode;
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

export function SoatView({ phone, testName, onClose, rows, openRow, setOpenRow, writing, saveCount, error, note, skipped, reasons,
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
  const titleText = `${rows.length} câu sai đã sẵn sàng thành thẻ`;
  return (
    <>
      <StepHead phone={phone} title={phone ? `Soát · ${rows.length} câu` : 'Soát'} sub={phone ? undefined : `${testName} · Reading`} step={4} back={phone ? onMore : undefined} onClose={onClose} />
      <div className="wd-body cv-body">
        {!phone && (
          <div className="cv-shero">
            <div className="wd-conf is-small" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
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
