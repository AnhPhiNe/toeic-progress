import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Habit } from '@/shared/types';
import { HABIT_TITLE_MAX, MAX_HABITS } from '../lib/habits';

export const HABIT_IDEAS = ['Học 20 từ', 'Nghe 15 phút', 'Ôn 10 câu sai', 'Đọc 1 bài báo', 'Shadowing 10 phút'];
export const SUGGEST_KINDS: Array<[string, string, string]> = [
  ['REVIEW_MISTAKES', 'Ôn câu sai đến hạn', 'từ Sổ tay'],
  ['PART_TIMER', 'Bấm giờ Part yếu nhất', '15–20 phút'],
  ['FULL_TEST', 'Làm đề full', 'khi đã 7 ngày chưa làm đề']
];

interface Props {
  /** The "+ Thêm việc của mình" button: the panel opens to its left, beside the card. */
  anchor: HTMLElement;
  habits: Habit[];
  suggestOff: string[];
  onAdd: (title: string) => void;
  onToggleSuggest: (kind: string) => void;
  onClose: () => void;
}

const norm = (t: string) => t.trim().toLowerCase();

/** Floating panel beside the Hôm nay card: pick an idea or type one, confirm, and choose what Sóc may suggest. */
export function AddHabitPanel({ anchor, habits, suggestOff, onAdd, onToggleSuggest, onClose }: Props) {
  const [pick, setPick] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const box = useRef<HTMLDivElement>(null);
  const full = habits.length >= MAX_HABITS;
  const have = new Set(habits.map(h => norm(h.title)));
  const title = draft.trim() || pick || '';

  useLayoutEffect(() => {
    const place = () => {
      const card = anchor.closest('.td-panel') ?? anchor;
      const r = card.getBoundingClientRect(), a = anchor.getBoundingClientRect();
      const h = box.current?.offsetHeight ?? 420;
      setPos({ left: Math.max(12, r.left - 360 - 14), top: Math.max(12, Math.min(window.innerHeight - h - 12, a.top - 120)) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', down);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', down); };
  }, [anchor, onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title || full || have.has(norm(title))) return;
    onAdd(title);
    onClose();
  };

  return createPortal(
    <div ref={box} className="rd td-ahp" role="dialog" aria-label="Thêm việc của mình" style={{ left: pos.left, top: pos.top }}>
      <form onSubmit={submit}>
        <h4>Thêm việc của mình<small>{full ? 'đã đủ 3 việc' : `tối đa ${MAX_HABITS} việc, còn ${MAX_HABITS - habits.length} chỗ`}</small></h4>
        <div className="td-ahp-chips">
          {HABIT_IDEAS.map(idea => {
            const owned = have.has(norm(idea));
            return (
              <button key={idea} type="button" disabled={owned || full} aria-pressed={pick === idea && !draft}
                className={'td-ahp-chip' + (pick === idea && !draft ? ' is-on' : '')}
                onClick={() => { setPick(idea); setDraft(''); }}>
                {owned && '✓ '}{idea}{owned && <i>đã có</i>}
              </button>
            );
          })}
        </div>
        <input value={draft} maxLength={HABIT_TITLE_MAX} disabled={full} onChange={e => setDraft(e.target.value)}
          placeholder="Hoặc tự gõ: ví dụ Học 20 từ Mochi" aria-label="Tên việc của mình" />
        {full && <p className="td-ahp-full">Bỏ bớt một việc (dấu ×) để thêm việc mới.</p>}
        <div className="td-ahp-foot">
          <button type="button" className="td-ahp-ghost" onClick={onClose}>Huỷ</button>
          <button type="submit" className="rd-btn td-ahp-ok" disabled={!title || full || have.has(norm(title))}>
            {title ? `Thêm "${title.length > 22 ? title.slice(0, 21) + '…' : title}"` : 'Chọn một việc'}
          </button>
        </div>
      </form>
      <div className="td-ahp-sep" />
      <h4 className="is-sm">Sóc được gợi ý những việc này</h4>
      {SUGGEST_KINDS.map(([kind, label, sub]) => {
        const on = !suggestOff.includes(kind);
        return (
          <label key={kind} className="td-ahp-sw">
            <span>{label}<small>{sub}</small></span>
            <input type="checkbox" role="switch" checked={on} onChange={() => onToggleSuggest(kind)} />
            <i aria-hidden="true" className={on ? 'is-on' : undefined} />
          </label>
        );
      })}
    </div>,
    document.body
  );
}
