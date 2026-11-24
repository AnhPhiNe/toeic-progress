import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Folder, Search, X } from 'lucide-react';
import './test-name-picker.css';
import { normalizeTestName, testNameKey, uniqueTestNames } from '@/shared/domain/testNames';

interface Props {
  value: string;
  onChange: (name: string) => void;
  suggestions: string[];
  compact?: boolean;
  field?: boolean;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  label?: string;
}

export function TestNamePicker({ value, onChange, suggestions, compact = false, field = false, disabled = false,
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
  const searchInPopup = compact && field;
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
    const anchor = searchInPopup ? triggerRef.current : inputRef.current;
    if (!anchor) return;
    const wantedHeight = Math.min(224, Math.max(44, choices.length * 44) + 10) + (searchInPopup ? 60 : 0);
    let frame = 0;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const flip = below < wantedHeight && above > below;
      const height = Math.max(44, Math.min(wantedHeight, flip ? above : below));
      const width = Math.min(Math.max(rect.width, searchInPopup ? 300 : 260), window.innerWidth - 16);
      const next = { left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: flip ? Math.max(8, rect.top - height - 5) : rect.bottom + 5, width, height };
      setPosition(current => Object.keys(next).every(key => Math.abs(current[key as keyof typeof next] - next[key as keyof typeof next]) < 0.5) ? current : next);
      // A slide-in dialog moves without resizing the input. Track its transform
      // while the popup is open so an early measurement cannot cover the footer.
      frame = requestAnimationFrame(place);
    };
    place();
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
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  }, [open, compact, searchInPopup, choices.length, onChange, value]);

  const showPicker = () => {
    beforeEdit.current = value; setQuery(''); setEditing(true); setOpen(true); setActive(0);
  };

  const searchInput = <input ref={inputRef} id={id} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open}
        aria-controls={open ? listId : undefined} aria-activedescendant={open && choices[active] ? `${listId}-${active}` : undefined}
        required={required} disabled={disabled} maxLength={300} value={search} placeholder={searchInPopup ? 'Tìm hoặc thêm đề…' : 'Tìm hoặc thêm tên đề…'}
        className={`tnp-field ${searchInPopup ? 'w-full !pl-9' : compact ? 'flex-1' : 'w-full'}`}
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
        }} />;

  const optionList = <div id={listId} role="listbox" aria-label="Tên đề gợi ý" className={searchInPopup ? 'min-h-0 overflow-y-auto p-1' : ''}>
      {choices.map((option, index) => {
        const selected = testNameKey(option.value) === testNameKey(value);
        return <button type="button" disabled={disabled} role="option" tabIndex={-1} key={option.value} id={`${listId}-${index}`} aria-selected={searchInPopup ? selected : index === active}
          onPointerDown={event => event.preventDefault()} onClick={() => finish(option.value)}
          className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm break-words ${index === active ? 'bg-[#e7f6ea] font-extrabold text-[#2f8a42]' : 'text-[#2f3a33] hover:bg-[#f6f8f6]'} ${option.isNew ? 'border-t-2 border-[#e6e9e6] font-extrabold' : ''}`}><span className="min-w-0">{option.label}</span>{searchInPopup && selected && <Check className="h-4 w-4 shrink-0 text-[#46b35a]" aria-hidden="true" />}</button>;
      })}
      {!choices.length && <p className="px-3 py-2 text-sm font-bold text-[#7a857e]">Nhập tên đề để thêm.</p>}
    </div>;

  return <div ref={rootRef} className={compact ? 'flex min-w-0 items-center gap-2 text-[13px] font-bold text-[#7a857e]' : 'relative'}>
    {compact && !field && <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />}
    {searchInPopup ? <button ref={triggerRef} type="button" disabled={disabled} aria-label="Chọn đề" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      onPointerDown={event => { if (open) event.preventDefault(); }} onClick={() => { if (open) cancel(); else showPicker(); }}
      className="tnp-field flex w-full cursor-pointer items-center justify-between gap-2 text-left">
      <span className="truncate">{value || (required ? 'Chọn đề' : 'Chọn đề (tùy chọn)')}</span><ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
    </button> : compact && !editing ? <><span className="min-w-0 break-words">{value || 'Chưa gắn đề'}</span>
      <button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded="false" onClick={showPicker}
        className="min-h-9 cursor-pointer px-1 text-[13px] font-black text-[#2f8a42] disabled:opacity-40">{value ? 'Đổi' : 'Gắn đề'}</button></> : <>
      {searchInput}
      {compact && <button type="button" disabled={disabled} aria-label="Hủy đổi đề" className="flex min-h-10 min-w-10 cursor-pointer items-center justify-center text-[#7a857e]" onPointerDown={event => event.preventDefault()} onClick={cancel}><X className="h-4 w-4" aria-hidden="true" /></button>}
    </>}
    {open && createPortal(<div ref={popupRef} data-modal-owner={listId}
      style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.height }}
      className={`tnp-pop fixed z-[70] ${searchInPopup ? 'flex flex-col overflow-hidden' : 'overflow-y-auto p-1'}`}>
      {searchInPopup && <div className="relative shrink-0 border-b-2 border-[#e6e9e6] p-2"><Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b3bab4]" aria-hidden="true" />{searchInput}</div>}
      {optionList}
    </div>, searchInPopup ? rootRef.current?.closest('[role="dialog"]') ?? document.body : document.body)}
  </div>;
}
