import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, X } from 'lucide-react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { dateRangeError, dateRangePreset, formatRangeDate, type DateRange } from '@/shared/domain/dateRange';
import './date-range.css';

interface Props { value: DateRange; today: string; onChange: (value: DateRange) => void }

export function DateRangePicker({ value, today, onChange }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [above, setAbove] = useState(false);
  const [left, setLeft] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const dialog = useModalA11y(open, close);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); };
  }, [open, close]);
  useLayoutEffect(() => {
    if (!open || !root.current || !dialog.current) return;
    const bounds = root.current.getBoundingClientRect();
    const width = Math.min(330, window.innerWidth - 24);
    setLeft(Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12)) - bounds.left);
    const height = dialog.current.getBoundingClientRect().height;
    const isAbove = window.innerHeight - bounds.bottom < height + 12 && bounds.top > height + 12;
    setAbove(isAbove);
    dialog.current.style.maxHeight = `${Math.max(150, isAbove ? bounds.top - 20 : window.innerHeight - bounds.bottom - 20)}px`;
  }, [open, dialog]);
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const message = dateRangeError(draft, today);
    if (message) { setError(message); return; }
    onChange(draft); close();
  };
  return <div ref={root} className="date-range-anchor">
    <button type="button" className="date-range-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { setDraft(value); setError(''); setOpen(current => !current); }}><CalendarDays size={16} aria-hidden="true" /><span>{value.preset ? `${value.preset} ngày gần nhất` : `${formatRangeDate(value.from)} – ${formatRangeDate(value.to)}`}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {open && <div ref={dialog} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} style={{ left }} className={`date-range-popover ${above ? 'is-above' : ''}`}>
      <div className="flex items-center justify-between gap-3"><h3 id={`${id}-title`} className="text-sm font-black">Khoảng thời gian</h3><button type="button" aria-label="Đóng bộ lọc" className="date-range-close" onClick={close}><X size={18} /></button></div>
      <form onSubmit={apply}>
        <div className="date-range-presets">{([7, 14, 30] as const).map(days => <button key={days} type="button" aria-pressed={draft.preset === days} onClick={() => { setDraft(dateRangePreset(today, days)); setError(''); }}>{days} ngày</button>)}</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="date-range-label">Từ ngày<input type="date" required min="0001-01-01" max={today} value={draft.from} onChange={event => { setDraft({ from: event.target.value, to: draft.to, preset: null }); setError(''); }} /></label>
          <label className="date-range-label">Đến ngày<input type="date" required min="0001-01-01" max={today} value={draft.to} onChange={event => { setDraft({ from: draft.from, to: event.target.value, preset: null }); setError(''); }} /></label>
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="date-range-footer"><button type="button" onClick={close}>Hủy</button><button type="submit" className="is-primary">Áp dụng</button></div>
      </form>
    </div>}
  </div>;
}
