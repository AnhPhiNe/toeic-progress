import { useRef } from 'react';
import { Calendar } from 'lucide-react';
import './dateField.css';

/** Formats an ISO `YYYY-MM-DD` date string into Vietnamese `dd/mm/yyyy`. */
export function formatVnDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export interface DateFieldProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Displays a date in Vietnamese `dd/mm/yyyy` regardless of browser/OS locale,
 * while keeping a real native `<input type="date">` for calendar picking, keyboard input, and a11y.
 */
export function DateField({
  id,
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  ariaLabel,
  placeholder = 'dd/mm/yyyy',
  className = ''
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = inputRef.current;
    if (!el || disabled) return;
    try { el.showPicker?.(); } catch { /* Native date click already opens or browser disallows programmatic showPicker. */ }
  };

  return (
    <span className={`rd-date${className ? ` ${className}` : ''}${disabled ? ' is-off' : ''}`}>
      <span className={`rd-date-val${!value ? ' is-empty' : ''}`} aria-hidden="true">
        {value ? formatVnDate(value) : placeholder}
      </span>
      <Calendar className="rd-date-ico" size={16} aria-hidden="true" />
      <input
        ref={inputRef}
        id={id}
        type="date"
        aria-label={ariaLabel}
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        onClick={openPicker}
        onChange={event => onChange(event.target.value)}
        className="rd-date-in"
      />
    </span>
  );
}
