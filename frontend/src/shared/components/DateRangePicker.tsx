import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
import { calendarDayIndex, dateRangeError, dateRangePreset, formatRangeDate, validCalendarDate, type DateRange } from '@/shared/domain/dateRange';
import './date-range.css';

interface Props { value: DateRange; today: string; onChange: (value: DateRange) => void }

export function DateRangePicker({ value, today, onChange }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const error = dateRangeError(draft, today);
  const latestEnd = validCalendarDate(draft.from) ? new Date((calendarDayIndex(draft.from) + 29) * 86400000).toISOString().slice(0, 10) : today;
  const maximumEnd = latestEnd < today ? latestEnd : today;
  const [above, setAbove] = useState(false);
  const [left, setLeft] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const dialog = useModalA11y(open, close);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, close]);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!root.current || !dialog.current) return;
      const bounds = root.current.getBoundingClientRect();
      const width = Math.min(330, window.innerWidth - 24);
      setLeft(Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12)) - bounds.left);
      const height = Math.max(dialog.current.scrollHeight + 4, dialog.current.getBoundingClientRect().height);
      const isAbove = window.innerHeight - bounds.bottom < height + 12 && bounds.top > height + 12;
      setAbove(isAbove);
      dialog.current.style.maxHeight = `${Math.max(150, isAbove ? bounds.top - 20 : window.innerHeight - bounds.bottom - 20)}px`;
    };
    position();
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [open, dialog, error]);
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    if (dateRangeError(draft, today)) return;
    onChange(draft); close();
  };
  return <div ref={root} className="date-range-anchor">
    <select aria-label="Phạm vi từ vựng" className="date-range-trigger" value={value.preset ? String(value.preset) : 'CUSTOM_APPLIED'} title={value.preset ? `${value.preset} ngày gần nhất` : `${formatRangeDate(value.from)} – ${formatRangeDate(value.to)}`} onChange={event => {
      event.currentTarget.focus();
      if (event.target.value === 'CUSTOM') { setDraft({ ...value, preset: null }); setOpen(true); }
      else { onChange(dateRangePreset(today, Number(event.target.value) as 7 | 14 | 30)); close(); }
    }}>
      {!value.preset && <option value="CUSTOM_APPLIED" hidden disabled>{formatRangeDate(value.from)} – {formatRangeDate(value.to)}</option>}
      <option value="7">7 ngày gần nhất</option><option value="14">14 ngày gần nhất</option><option value="30">30 ngày gần nhất</option><option value="CUSTOM">Chọn khoảng ngày…</option>
    </select>
    {open && <div ref={dialog} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} style={{ left }} className={`date-range-popover ${above ? 'is-above' : ''}`}>
      <div className="flex items-center justify-between gap-3"><h3 id={`${id}-title`} className="text-sm font-black">Khoảng thời gian</h3><button type="button" aria-label="Đóng bộ lọc" className="date-range-close" onClick={close}><X size={18} /></button></div>
      <form onSubmit={apply}>
        <div className="date-range-dates">
          <label className="date-range-label">Từ ngày<input type="date" required min="0001-01-01" max={today} value={draft.from} aria-invalid={!!error} aria-describedby={`${id}-help`} onChange={event => setDraft({ from: event.target.value, to: draft.to, preset: null })} /></label>
          <label className="date-range-label">Đến ngày<input type="date" required min={validCalendarDate(draft.from) ? draft.from : '0001-01-01'} max={maximumEnd} value={draft.to} aria-invalid={!!error} aria-describedby={`${id}-help`} onChange={event => setDraft({ from: draft.from, to: event.target.value, preset: null })} /></label>
        </div>
        <p id={`${id}-help`} role={error ? 'alert' : undefined} className={`date-range-help ${error ? 'is-error' : ''}`}>{error || 'Tối đa 30 ngày, tính cả ngày bắt đầu và kết thúc.'}</p>
        <div className="date-range-footer"><button type="button" onClick={close}>Hủy</button><button type="submit" className="is-primary" disabled={!!error}>Áp dụng</button></div>
      </form>
    </div>}
  </div>;
}
