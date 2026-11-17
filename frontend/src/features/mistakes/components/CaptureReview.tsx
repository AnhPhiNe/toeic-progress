import { useEffect, useRef, useState } from 'react';
import type { ErrorCategory } from '@/shared/types';
import { CATEGORY_CHOICES } from '@/features/mistakes/lib/categoryChoices';
import { CHOICE_LETTERS, parsePastedQuestion, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';
import { optionLetter } from '@/features/mistakes/lib/userChoice';
import { questionPreview, rowStatus, whyLine, isUnreadable, type CaptureItem } from '@/features/mistakes/lib/captureBatch';
import { withLetters } from '@/features/mistakes/lib/multiQuestion';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';

type ItemPatch = Partial<Pick<CaptureItem, 'draft' | 'category' | 'checked'>>;

interface ListProps {
  items: readonly CaptureItem[];
  onToggle: (id: string) => void;
  onPatch: (id: string, patch: ItemPatch) => void;
  onRemove: (id: string) => void;
  /** What a row that lacks a choice or a key says; Sóc is unsure only about rows it read itself. */
  unsureLabel?: string;
}

/** The review rows shared by a screenshot capture and a paste of several questions. */
export function ReviewList({ items, onToggle, onPatch, onRemove, unsureLabel = 'Sóc chưa chắc' }: ListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ul className="cap-rows" aria-label="Các câu sai Sóc đã tìm thấy">
      {items.map(item => {
        const status = rowStatus(item);
        const choice = item.draft.userChoice || '?';
        const answer = optionLetter(item.draft.correctAnswer) || '?';
        const why = whyLine(item.draft);
        const open = editing === item.id;
        return (
          <li key={item.id} className={'cap-row' + (status === 'unsure' ? ' is-unsure' : '') + (item.checked ? '' : ' is-off')}>
            <button type="button" role="checkbox" aria-checked={item.checked} className="cap-ck" aria-label={`Lưu câu ${item.number}`} onClick={() => onToggle(item.id)}>
              {item.checked ? '✓' : ''}
            </button>
            <div className="cap-row-body">
              <b>Part {item.part} · câu {item.number}</b>
              <p>{questionPreview(item.draft)}</p>
              <div className="cap-chips">
                <span className="is-me">bạn chọn {choice}</span>
                <span className="is-ok">đúng {answer}</span>
                {status === 'unsure' && <span className="is-unsure">{unsureLabel}</span>}
              </div>
              {why && <p className="cap-why"><b>Sai vì:</b> {why}</p>}
              {open && <RowEditor item={item} onClose={() => setEditing(null)} onPatch={patch => onPatch(item.id, patch)} onRemove={() => { setEditing(null); onRemove(item.id); }} />}
            </div>
            <button type="button" className="cap-link" aria-expanded={open} aria-label={`Sửa câu ${item.number}`} onClick={() => setEditing(open ? null : item.id)}>{open ? 'Đóng' : 'Sửa'}</button>
          </li>
        );
      })}
    </ul>
  );
}

const optionLines = (draft: AIMistakeParseResult) => [draft.question ?? '', ...draft.options].filter(Boolean).join('\n');

function RowEditor({ item, onClose, onPatch, onRemove }: { item: CaptureItem; onClose: () => void; onPatch: (patch: ItemPatch) => void; onRemove: () => void }) {
  const [text, setText] = useState(optionLines(item.draft));
  const [choice, setChoice] = useState<ChoiceLetter | ''>(item.draft.userChoice as ChoiceLetter | '');
  const [answer, setAnswer] = useState<ChoiceLetter | ''>(optionLetter(item.draft.correctAnswer));
  const [reason, setReason] = useState(item.draft.userReason ?? '');
  const [category, setCategory] = useState<ErrorCategory>(item.category);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  // The editor opens inside a scrolling list: bring it into view.
  useEffect(() => { box.current?.scrollIntoView({ block: 'nearest' }); }, []);
  const letters = CHOICE_LETTERS.filter(letter => item.draft.options.some(option => option.startsWith(`(${letter})`)) || isUnreadable(item.draft));
  const apply = () => {
    let draft = item.draft;
    if (text !== optionLines(item.draft)) {
      const parsed = parsePastedQuestion(text, item.part);
      if (parsed.error) { setError(parsed.error); return; }
      draft = { ...draft, question: parsed.question, options: parsed.options, questionContext: [parsed.question, draft.context ?? ''].filter(Boolean).join('\n\n') };
    }
    if ((choice && !draft.options.some(option => option.startsWith(`(${choice})`))) || (answer && !draft.options.some(option => option.startsWith(`(${answer})`)))) {
      setError('Lựa chọn chưa khớp phương án. Kiểm tra lại nội dung.'); return;
    }
    if (choice && choice === answer) { setError('Đáp án bạn chọn trùng đáp án đúng.'); return; }
    draft = { ...withLetters(draft, choice, answer), userReason: reason };
    onPatch({ draft, category, ...(isUnreadable(item.draft) && !isUnreadable(draft) ? { checked: true } : {}) });
    onClose();
  };
  const chips = (label: string, value: ChoiceLetter | '', set: (letter: ChoiceLetter | '') => void) => (
    <div className="cap-abcd" role="group" aria-label={label}>
      <b>{label}</b>
      {CHOICE_LETTERS.map(letter => (
        <button key={letter} type="button" aria-pressed={value === letter} disabled={!letters.includes(letter)}
          className={label === 'Mình chọn' ? 'is-me' : 'is-ok'} aria-label={`${label}: ${letter}`} onClick={() => set(value === letter ? '' : letter)}>{letter}</button>
      ))}
    </div>
  );
  return (
    <div className="cap-edit" ref={box}>
      <label>Câu hỏi và các phương án
        <textarea value={text} rows={Math.min(7, Math.max(3, text.split('\n').length))} spellCheck={false} maxLength={8000} onChange={event => { setText(event.target.value); setError(''); }} />
      </label>
      {chips('Mình chọn', choice, setChoice)}
      {chips('Đáp án đúng', answer, setAnswer)}
      <div className="cap-edit-two">
        <label>Lý do bạn chọn <small>không bắt buộc</small>
          <input value={reason} maxLength={2000} placeholder="Mình chọn vì…" onChange={event => setReason(event.target.value)} />
        </label>
        <label>Loại lỗi <small>không bắt buộc</small>
          <select value={category} onChange={event => setCategory(event.target.value as ErrorCategory)}>
            {Object.entries(CATEGORY_CHOICES).filter(([value]) => value !== 'LISTENING_SPEED').map(([value, label]) => <option key={value} value={value}>{value === 'OTHER' ? 'Chưa chọn' : label}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="cap-error">{error}</p>}
      <div className="cap-edit-acts">
        <button type="button" className="cap-link is-danger" onClick={onRemove}>Bỏ câu này</button>
        <span />
        <button type="button" className="rd-btn rd-btn--white cap-sm" onClick={onClose}>Hủy</button>
        <button type="button" className="rd-btn rd-btn--pink cap-sm" onClick={apply}>Xong</button>
      </div>
    </div>
  );
}
