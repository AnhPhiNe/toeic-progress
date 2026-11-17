import { useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';

const ROW = 40;

interface Props {
  label: string;
  caption: string;
  color: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
}

/** Scroll-snap wheel: the row on the highlight is the value. Keys: arrows 1 step, PageUp/Down 10 steps. */
export function WheelPicker({ label, caption, color, min, max, step, value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const values = useMemo(() => Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step), [min, max, step]);
  const indexOf = (v: number) => Math.max(0, Math.min(values.length - 1, Math.round((v - min) / step)));

  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ROW) !== indexOf(value)) el.scrollTop = indexOf(value) * ROW;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, values]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const next = values[Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW)))];
    if (next !== valueRef.current) onChange(next);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const jump: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 };
    let index: number | null = null;
    if (event.key in jump) index = indexOf(value) + jump[event.key];
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = values.length - 1;
    if (index === null) return;
    event.preventDefault();
    index = Math.max(0, Math.min(values.length - 1, index));
    if (ref.current) ref.current.scrollTop = index * ROW;
    onChange(values[index]);
  };

  return (
    <div className="pl-wheel" style={{ '--c': color } as CSSProperties}>
      <span className="pl-wheel__cap" aria-hidden="true">{caption}</span>
      <div className="pl-wheel__mid" aria-hidden="true" />
      <div ref={ref} className="pl-wheel__list" role="spinbutton" tabIndex={0} aria-label={label}
        aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} onScroll={onScroll} onKeyDown={onKey}>
        {values.map(n => {
          const d = Math.abs(n - value) / step;
          return <div key={n} aria-hidden="true" className={'pl-r' + (d === 0 ? ' is-on' : d === 1 ? ' is-near' : '')}>{n}</div>;
        })}
      </div>
    </div>
  );
}
