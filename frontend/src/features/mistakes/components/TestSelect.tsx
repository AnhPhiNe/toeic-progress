import { useId, useState } from 'react';
import { normalizeTestName, testNameKey, uniqueTestNames } from '@/features/mistakes/lib/sourceTests';

interface Props {
  value: string;
  names: readonly string[];
  onChange: (name: string) => void;
  /** `field`: a grey box with the small label inside (capture). `bare`: only the box, the dialog writes the label (typing a card). */
  variant?: 'field' | 'bare';
  disabled?: boolean;
}

const NEW = '__new__';

/** The test a card belongs to: known names in a list, or a new name typed in. */
export function TestSelect({ value, names, onChange, variant = 'field', disabled = false }: Props) {
  const id = useId();
  const list = uniqueTestNames([...names, value]);
  const [typing, setTyping] = useState(false);
  if (typing || !list.length) {
    return (
      <div className={'cap-field is-input' + (variant === 'bare' ? ' is-bare' : '')}>
        <label htmlFor={id}>{variant === 'field' && <small>Đề</small>}
          <input id={id} autoFocus={typing} value={value} maxLength={300} placeholder="Tên đề, ví dụ ETS 2024 Test 11" disabled={disabled}
            onChange={event => onChange(event.target.value)} onBlur={() => { onChange(normalizeTestName(value)); if (list.length) setTyping(false); }} />
        </label>
        {list.length > 0 && <button type="button" className="cap-link" onClick={() => setTyping(false)}>Chọn đề có sẵn</button>}
      </div>
    );
  }
  const current = list.find(name => testNameKey(name) === testNameKey(value)) ?? '';
  return (
    <label className={'cap-field' + (variant === 'bare' ? ' is-bare' : '')}>
      <span className="cap-field-text">{variant === 'field' && <small>Đề</small>}<b>{current || 'Chọn đề'}</b></span>
      <span className="cap-link" aria-hidden="true">{variant === 'field' ? 'Đổi ▾' : '▾'}</span>
      <select aria-label="Đề" value={current} disabled={disabled}
        onChange={event => { if (event.target.value === NEW) { setTyping(true); onChange(''); } else onChange(event.target.value); }}>
        {!current && <option value="">Chọn đề</option>}
        {list.map(name => <option key={name} value={name}>{name}</option>)}
        <option value={NEW}>＋ Đề khác…</option>
      </select>
    </label>
  );
}
