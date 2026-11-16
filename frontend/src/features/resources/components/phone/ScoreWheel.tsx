import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { MAX_COUNT } from '../../lib/convert';

const ROW = 40;
const NUMBERS = Array.from({ length: MAX_COUNT + 1 }, (_, i) => i);

interface Props {
  /** Visible name, e.g. "Nghe". */
  label: string;
  /** Small caption line, e.g. "385đ". */
  points: string;
  color: string;
  /** The number shown (0..100). */
  value: number;
  onChange: (next: number) => void;
}

/** iOS-style wheel: a scroll-snap column of 0..100, the row on the highlight is the value. */
export function ScoreWheel({ label, points, color, value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Bring the wheel to a value that changed from outside (picking a test) without echoing it back.
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ROW) !== value) el.scrollTop = value * ROW;
  }, [value]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(MAX_COUNT, Math.round(el.scrollTop / ROW)));
    if (idx !== valueRef.current) onChange(idx);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const jump: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 };
    let next: number | null = null;
    if (event.key in jump) next = value + jump[event.key];
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = MAX_COUNT;
    if (next === null) return;
    event.preventDefault();
    next = Math.max(0, Math.min(MAX_COUNT, next));
    if (ref.current) ref.current.scrollTop = next * ROW;
    onChange(next);
  };

  return (
    <div className="cvp-wheel" style={{ '--c': color } as CSSProperties}>
      <span className="cvp-wheel__cap" aria-hidden="true">{label} · {points}</span>
      <div className="cvp-wheel__mid" aria-hidden="true" />
      <div ref={ref} className="cvp-wheel__list" role="spinbutton" tabIndex={0} aria-label={`${label}: số câu`}
        aria-valuemin={0} aria-valuemax={MAX_COUNT} aria-valuenow={value} aria-valuetext={`${value} câu, ${points}`}
        onScroll={onScroll} onKeyDown={onKey}>
        {NUMBERS.map(n => {
          const d = Math.abs(n - value);
          return <div key={n} aria-hidden="true" className={'cvp-r' + (d === 0 ? ' is-on' : d === 1 ? ' is-near' : '')}>{n}</div>;
        })}
      </div>
    </div>
  );
}
