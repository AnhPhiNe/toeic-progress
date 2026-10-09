import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { testNameKey } from '@/shared/domain/testNames';

interface Props { value: string; onChange: (value: string) => void; names: string[] }

export function AnalyticsScopePicker({ value, onChange, names }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [popupLeft, setPopupLeft] = useState(0);
  const options = useMemo(() => names.map(name => ({ value: testNameKey(name), label: name })), [names]);
  const filtered = options.filter(option => testNameKey(option.label).includes(testNameKey(query)));
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (next: string) => { onChange(next); close(); };
  useLayoutEffect(() => {
    if (!open || !root.current || !popup.current) return;
    const left = root.current.getBoundingClientRect().left;
    const width = popup.current.getBoundingClientRect().width;
    setPopupLeft(Math.max(12, Math.min(left, window.innerWidth - width - 12)) - left);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', resize); };
  }, [open]);
  useEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [open, active, id]);

  return <div ref={root} className="relative min-w-0 max-w-full" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button ref={trigger} type="button" aria-label={`Đề: ${options.find(option => option.value === value)?.label ?? 'Chưa có đề'}`} disabled={!names.length}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => {
        setQuery(''); setActive(Math.max(0, options.findIndex(option => option.value === value))); setOpen(!open);
      }}
      className="flex min-h-11 max-w-full cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:cursor-default disabled:opacity-60 dark:border-slate-600 dark:bg-[#111A2C] dark:text-white">
      <span className="min-w-0 break-words">{options.find(option => option.value === value)?.label ?? 'Chưa có đề'}</span><ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
    {open && <div ref={popup} style={{ left: popupLeft }} className="absolute top-full z-30 mt-2 w-[350px] max-w-[calc(100vw-48px)] rounded-xl border-2 border-slate-900 bg-white p-2 shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-[#111A2C]">
      <div className="relative mb-1"><Search className="absolute left-2.5 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
        <input ref={search} role="combobox" aria-label="Tìm đề" aria-autocomplete="list" aria-expanded="true" aria-controls={id}
          aria-activedescendant={filtered[active] ? `${id}-${active}` : undefined} placeholder="Tìm tên đề…" value={query}
          onChange={event => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); if (filtered.length) setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length);
            } else if (event.key === 'Enter' && filtered[active]) { event.preventDefault(); choose(filtered[active].value); }
          }} className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
      </div>
      <div id={id} role="listbox" aria-label="Chọn đề" className="max-h-72 overflow-y-auto">
        {filtered.map((option, index) => <button type="button" key={option.value} id={`${id}-${index}`} role="option" tabIndex={-1}
          aria-selected={option.value === value} onPointerDown={event => event.preventDefault()} onClick={() => choose(option.value)}
          className={`block min-h-11 w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm break-words ${index === active ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'}`}>{option.label}</button>)}
        {!filtered.length && <p className="p-3 text-sm text-slate-500 dark:text-slate-400">Không có đề khớp tên.</p>}
      </div>
    </div>}
  </div>;
}
