import { useEffect, useRef, useState } from 'react';
import { SOC_COATS, coatSwatch, type SocCoatId } from '@/shared/ui/soc/socCoat';
import { DEFAULT_SOC_NAME, SOC_NAME_MAX, cleanSocName } from '@/shared/ui/soc/socIdentity';
import './socCoatPicker.css';

interface Props {
  coat: SocCoatId;
  name: string;
  onCoat: (coat: SocCoatId) => void;
  /** Called with the tidied name when the field is left, on Enter, or when the picker closes with an edit pending. */
  onName: (name: string) => void;
  /** Small line under the name field. */
  nameHint?: string;
  className?: string;
}

/** "Sóc của bạn": five coat swatches and the name field (welcome step and Tủ đồ). */
export function SocCoatPicker({ coat, name, onCoat, onName, nameHint, className }: Props) {
  const [draft, setDraft] = useState(name === DEFAULT_SOC_NAME ? '' : name);
  const saved = useRef(name);
  saved.current = name;
  const pending = useRef({ draft, onName });
  pending.current = { draft, onName };
  const commit = (value: string) => {
    const next = cleanSocName(value) || DEFAULT_SOC_NAME;
    if (next !== saved.current) onName(next);
  };
  // Closing a sheet with Esc never blurs the field: keep what was typed.
  useEffect(() => () => {
    const { draft: last, onName: save } = pending.current;
    const next = cleanSocName(last) || DEFAULT_SOC_NAME;
    if (next !== saved.current) save(next);
  }, []);

  return (
    <div className={'scp' + (className ? ' ' + className : '')}>
      <div className="scp-sw" role="radiogroup" aria-label="Màu lông của Sóc">
        {SOC_COATS.map(c => (
          <button key={c.id} type="button" role="radio" aria-checked={c.id === coat} className={'scp-it' + (c.id === coat ? ' is-on' : '')}
            onClick={() => onCoat(c.id)}>
            <i style={{ background: coatSwatch(c) }} aria-hidden="true" />{c.label}
          </button>
        ))}
      </div>
      <label className="scp-nm">
        <span>Tên Sóc</span>
        <input value={draft} maxLength={SOC_NAME_MAX + 4} placeholder={DEFAULT_SOC_NAME} autoComplete="off" spellCheck={false}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(draft); e.currentTarget.blur(); } }} />
        {nameHint && <small>{nameHint}</small>}
      </label>
    </div>
  );
}
