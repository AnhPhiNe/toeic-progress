import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { Habit } from '@/shared/types';
import { PhoneSheet } from '@/app/components/phone';
import { HABIT_TITLE_MAX, MAX_HABITS } from '../../lib/habits';
import { HABIT_IDEAS, SUGGEST_KINDS } from '../AddHabitPanel';

interface Props {
  habits: Habit[];
  suggestOff: string[];
  onAdd: (title: string) => void;
  onRemove: (id: string) => void;
  onToggleSuggest: (kind: string) => void;
  onClose: () => void;
}

const norm = (t: string) => t.trim().toLowerCase();

/** Phone version of the add-habit panel: idea chips, input + Thêm, own habits (with ×), and Sóc's suggestion switches. */
export function AddHabitSheet({ habits, suggestOff, onAdd, onRemove, onToggleSuggest, onClose }: Props) {
  const [pick, setPick] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const full = habits.length >= MAX_HABITS;
  const have = new Set(habits.map(h => norm(h.title)));
  const title = draft.trim() || pick || '';
  const blocked = !title || full || have.has(norm(title));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    onAdd(title);
    onClose();
  };

  return (
    <PhoneSheet title="Thêm việc của mình" onClose={onClose}>
      <p className="tp-sub">{full ? 'Đã đủ 3 việc. Bỏ bớt một việc (dấu ×) để thêm việc mới.' : `Còn thêm được ${MAX_HABITS - habits.length} việc (tối đa ${MAX_HABITS})`}</p>
      {habits.length > 0 && <ul className="tp-own">
        {habits.map(h => (
          <li key={h.id}><span>{h.title}</span>
            <button type="button" aria-label={`Bỏ việc "${h.title}"`} onClick={() => onRemove(h.id)}><X size={18} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>}
      {!full && <form onSubmit={submit}>
        <div className="tp-ideas">
          {HABIT_IDEAS.map(idea => {
            const owned = have.has(norm(idea));
            const on = pick === idea && !draft;
            return (
              <button key={idea} type="button" disabled={owned || full} aria-pressed={on} className={'tp-idea' + (on ? ' is-on' : '')}
                onClick={() => { setPick(idea); setDraft(''); }}>{idea}{owned && <i>đã có</i>}</button>
            );
          })}
        </div>
        <div className="tp-inp">
          <input value={draft} maxLength={HABIT_TITLE_MAX} disabled={full} onChange={e => setDraft(e.target.value)}
            placeholder={pick ?? 'Hoặc tự gõ việc của bạn'} aria-label="Tên việc của mình" />
          <button type="submit" className="tp-addbtn" disabled={blocked}>Thêm</button>
        </div>
      </form>}
      <h3 className="tp-h3">SÓC GỢI Ý MỖI NGÀY</h3>
      {SUGGEST_KINDS.map(([kind, label, sub]) => {
        const on = !suggestOff.includes(kind);
        return (
          <label key={kind} className="tp-sw">
            <span>{label}<small>{sub}</small></span>
            <input type="checkbox" role="switch" checked={on} onChange={() => onToggleSuggest(kind)} />
            <i aria-hidden="true" className={on ? 'is-on' : undefined} />
          </label>
        );
      })}
    </PhoneSheet>
  );
}
