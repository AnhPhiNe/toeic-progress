import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, X } from 'lucide-react';
import { normalizeTestName, testNameKey, uniqueTestNames } from '@/shared/domain/testNames';

interface Props {
  value: string;
  onChange: (name: string) => void;
  suggestions: string[];
  compact?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  label?: string;
}

export function TestNamePicker({ value, onChange, suggestions, compact = false, disabled = false,
  required = false, id, label = 'Tìm hoặc thêm tên đề' }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const beforeEdit = useRef(value);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280, height: 224 });
  const search = compact ? query : value;
  const names = useMemo(() => uniqueTestNames([...suggestions, value]), [suggestions, value]);
  const choices = useMemo(() => {
    // Do not treat the full input's draft text as an already-created name.
    const known = uniqueTestNames([...suggestions, beforeEdit.current]);
    const matching = known.filter(name => testNameKey(name).includes(testNameKey(search)));
    const result = matching.map(name => ({ value: name, label: name, isNew: false }));
    const clean = normalizeTestName(search);
    if (clean && !known.some(name => testNameKey(name) === testNameKey(clean))) {
      result.push({ value: clean, label: `+ Thêm tên đề “${clean}”`, isNew: true });
    }
    if (!required) result.push({ value: '', label: 'Chưa gắn đề', isNew: false });
    return result;
  }, [suggestions, search, required]);

  const finish = (name: string) => {
    const canonical = names.find(existing => testNameKey(existing) === testNameKey(name)) ?? normalizeTestName(name);
    onChange(canonical); setOpen(false); setEditing(false);
    if (compact) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const cancel = () => {
    setOpen(false); setEditing(false);
    if (!compact) onChange(beforeEdit.current);
    if (compact) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (compact && editing) inputRef.current?.focus();
  }, [compact, editing]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  useEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const wantedHeight = Math.min(224, choices.length * 44 + 10);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const flip = below < wantedHeight && above > below;
    const height = Math.max(44, Math.min(wantedHeight, flip ? above : below));
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: flip ? Math.max(8, rect.top - height - 5) : rect.bottom + 5, width, height });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        if (!compact) onChange(normalizeTestName(value));
        setOpen(false); setEditing(false);
      }
    };
    const closeOnScroll = (event: Event) => {
      if (popupRef.current?.contains(event.target as Node)) return;
      setOpen(false); setEditing(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  }, [open, compact, choices.length, onChange, value]);

  const showPicker = () => {
    beforeEdit.current = value; setQuery(''); setEditing(true); setOpen(true); setActive(0);
  };

  return <div ref={rootRef} className={compact ? 'flex min-w-0 items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400' : 'relative'}>
    {compact && <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />}
    {compact && !editing ? <><span className="min-w-0 break-words">{value || 'Chưa gắn đề'}</span>
      <button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded="false" onClick={showPicker}
        className="min-h-9 cursor-pointer px-1 text-[13px] font-semibold text-blue-600 dark:text-blue-400 disabled:opacity-40">{value ? 'Đổi' : 'Gắn đề'}</button></> : <>
      <input ref={inputRef} id={id} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? listId : undefined} aria-activedescendant={open && choices[active] ? `${listId}-${active}` : undefined}
        required={required} disabled={disabled} maxLength={300} value={search} placeholder="Tìm hoặc thêm tên đề…"
        className={`min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-500 focus:outline-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${compact ? 'flex-1' : 'w-full'}`}
        onFocus={() => { if (!open) beforeEdit.current = value; setOpen(true); setActive(0); }}
        onChange={event => { if (compact) setQuery(event.target.value); else onChange(event.target.value); setActive(0); setOpen(true); }}
        onBlur={event => {
          if (popupRef.current?.contains(event.relatedTarget as Node)) return;
          if (!compact) onChange(normalizeTestName(value));
          setOpen(false); setEditing(false);
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            if (choices.length) setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault(); if (choices[active]) finish(choices[active].value);
          } else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); cancel(); }
        }} />
      {compact && <button type="button" disabled={disabled} aria-label="Hủy đổi đề" className="flex min-h-10 min-w-10 cursor-pointer items-center justify-center text-slate-500" onPointerDown={event => event.preventDefault()} onClick={cancel}><X className="h-4 w-4" aria-hidden="true" /></button>}
    </>}
    {open && createPortal(<div ref={popupRef} id={listId} role="listbox" aria-label="Tên đề gợi ý"
      style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.height }}
      className="fixed z-[70] overflow-y-auto rounded-xl border border-slate-300 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-[#111A2C]">
      {choices.map((option, index) => <button type="button" disabled={disabled} role="option" tabIndex={-1} key={option.value} id={`${listId}-${index}`} aria-selected={index === active}
        onPointerDown={event => event.preventDefault()} onClick={() => finish(option.value)}
        className={`block min-h-11 w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm break-words ${index === active ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'} ${option.isNew ? 'border-t border-slate-200 font-semibold dark:border-slate-700' : ''}`}>{option.label}</button>)}
      {!choices.length && <p className="px-3 py-2 text-sm text-slate-500">Nhập tên đề để thêm.</p>}
    </div>, document.body)}
  </div>;
}
