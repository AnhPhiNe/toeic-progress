import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import type { ClarityResult } from '@/features/mistakes/lib/photoClarity';
import type { SentThumb, Zone } from './views';

/**
 * capture-calm (design/previews/capture-v3): fixed-size thumbnails with one small ×, two rows then a scroll inside the
 * zone with "+N ảnh". Order, crop and zone switching stay on a hover/focus toolbar; the phone taps a thumbnail to preview it.
 */
export interface CaptureZoneProps {
  zone: Zone; num?: number; title: string; phone: boolean; disabled: boolean; active: boolean;
  items: readonly { id: string; url: string }[]; sent?: readonly SentThumb[];
  clarity?: Record<string, ClarityResult | null>;
  /** Phones: the header holds the photo count and `headRight` (the paper toggle) instead of the zone name. */
  headRight?: ReactNode;
  /** Empty hint next to Sóc; a phone tap on the empty area calls `onEmptyTap`. */
  emptyText: string; onEmptyTap?: () => void;
  onAdd: (files: File[], zone: Zone) => void; onActivate: (zone: Zone) => void; onRemove: (zone: Zone, id: string) => void;
  onEdit?: (zone: Zone, id: string) => void; onMove?: (zone: Zone, id: string, delta: -1 | 1) => void;
  onSwitchZone?: (zone: Zone, id: string) => void; onPreview?: (zone: Zone, index: number) => void;
}

const ROWS_SHOWN = 2, THUMB_W = 120, THUMB_GAP = 12;

export function CaptureZone(props: CaptureZoneProps) {
  const { zone, num, title, phone, disabled, active, items, sent = [], clarity, headRight, emptyText, onEmptyTap, onAdd, onActivate, onRemove, onEdit, onMove, onSwitchZone, onPreview } = props;
  const input = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(phone ? 2 : 3);
  const label = zone === 'passage' ? 'Ảnh đoạn văn' : 'Ảnh câu hỏi';
  const other = zone === 'passage' ? '②' : '①';
  const total = sent.length + items.length;
  useLayoutEffect(() => {
    const node = strip.current;
    if (!node || phone) return;
    const measure = () => setCols(Math.max(1, Math.floor((node.clientWidth + THUMB_GAP) / (THUMB_W + THUMB_GAP))));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [phone, total > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const slots = total + (phone ? 0 : 1);
  const hidden = phone ? Math.max(0, total - cols * ROWS_SHOWN) : Math.max(0, slots - cols * ROWS_SHOWN);
  const pick = () => { onActivate(zone); input.current?.click(); };
  return (
    <div className={'cz' + (active ? ' is-active' : '') + (phone ? ' is-phone' : '')} data-zone={zone} data-active={active || undefined}
      onClick={() => onActivate(zone)}
      onDragOver={event => { if (!disabled) { event.preventDefault(); event.stopPropagation(); } }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); onActivate(zone); onAdd([...event.dataTransfer.files], zone); }}>
      <div className="cz-h">
        {!phone && num && <em>{num}</em>}
        {!phone && <b>{title}</b>}
        {phone && <b>{total} ảnh</b>}
        {!phone && total > 0 && <span className="cz-cnt">{total} ảnh{hidden > 0 && <i>+{hidden} ảnh</i>}</span>}
        {phone && hidden > 0 && <span className="cz-cnt"><i>+{hidden} ảnh</i></span>}
        {headRight && <span className="cz-hr">{headRight}</span>}
      </div>
      {total === 0
        ? <div className={'cz-empty' + (phone ? ' is-tap' : '')} role={phone && onEmptyTap ? 'button' : undefined} tabIndex={phone && onEmptyTap ? 0 : undefined}
            aria-label={phone && onEmptyTap ? 'Chụp hoặc chọn ảnh' : undefined}
            onClick={event => { if (phone && onEmptyTap && !disabled) { event.stopPropagation(); onEmptyTap(); } else if (!phone && !disabled) { event.stopPropagation(); pick(); } }}>
            <Soc state="hi" size={phone ? 84 : 52} />
            <p>{emptyText}</p>
          </div>
        : (
          <div ref={strip} className={'cz-ths' + (hidden > 0 ? ' is-scroll' : '')} role="list" aria-label={label}>
            {sent.map(item => (
              <span key={item.id} className="cz-th is-sent" role="listitem">
                <img src={item.url} alt={`Ảnh đã gửi · ${item.label}`} />
                <span className={`wd-pg-tag is-${item.tone}`}>{item.label}</span>
              </span>
            ))}
            {items.map((item, index) => {
              const problem = clarity?.[item.id]?.problem;
              return (
                <span key={item.id} className={'cz-th' + (problem ? ' is-warn' : '')} role="listitem">
                  <img src={item.url} alt={`${label} ${index + 1}`} title={phone ? 'Bấm để xem ảnh' : 'Bấm để xem to, xoay hoặc cắt ảnh'}
                    onClick={event => {
                      event.stopPropagation(); onActivate(zone);
                      if (phone && onPreview) onPreview(zone, index);
                      else if (!disabled && onEdit) onEdit(zone, item.id);
                    }} />
                  {problem && <span className="cz-warn">{problem === 'dark' ? 'Ảnh hơi tối' : 'Ảnh hơi mờ'}</span>}
                  <button type="button" className="cz-x" aria-label={`Bỏ ${label.toLowerCase()} ${index + 1}`} title="Xóa ảnh" disabled={disabled}
                    onClick={event => { event.stopPropagation(); onRemove(zone, item.id); }}>×</button>
                  {!phone && (
                    <span className="cz-tools">
                      {onMove && index > 0 && <button type="button" aria-label={`Đưa ${label.toLowerCase()} ${index + 1} lên trước`} title="Đưa lên trước" disabled={disabled}
                        onClick={event => { event.stopPropagation(); onMove(zone, item.id, -1); }}>‹</button>}
                      {onEdit && <button type="button" aria-label={`Chỉnh ${label.toLowerCase()} ${index + 1}`} title="Xoay hoặc cắt ảnh" disabled={disabled}
                        onClick={event => { event.stopPropagation(); onEdit(zone, item.id); }}>✎</button>}
                      {onSwitchZone && <button type="button" title={`Chuyển sang ${other}`} disabled={disabled}
                        aria-label={`Chuyển ${label.toLowerCase()} ${index + 1} sang ô ${other}`}
                        onClick={event => { event.stopPropagation(); onSwitchZone(zone, item.id); }}>{other}</button>}
                      {onMove && index < items.length - 1 && <button type="button" aria-label={`Đưa ${label.toLowerCase()} ${index + 1} ra sau`} title="Đưa ra sau" disabled={disabled}
                        onClick={event => { event.stopPropagation(); onMove(zone, item.id, 1); }}>›</button>}
                    </span>
                  )}
                </span>
              );
            })}
            {!phone && <button type="button" className="cz-add" aria-label={`Thêm ${label.toLowerCase()}`} disabled={disabled}
              onClick={event => { event.stopPropagation(); pick(); }}>+</button>}
          </div>
        )}
      <input ref={input} type="file" accept="image/*" multiple hidden aria-label={label}
        onClick={event => event.stopPropagation()}
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; onAdd(files, zone); }} />
    </div>
  );
}

/** Phone full-screen preview of the photos in one zone: swipe, Xoá, "Chuyển sang" on Part 7, Xong. */
export function PhotoPreview({ zone, items, start, twoZones, onClose, onRemove, onSwitch, onEdit }: {
  zone: Zone; items: readonly { id: string; url: string }[]; start: number; twoZones: boolean;
  onClose: () => void; onRemove: (id: string) => void; onSwitch: (id: string) => void; onEdit: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(Math.min(start, Math.max(0, items.length - 1)));
  const at = Math.min(index, Math.max(0, items.length - 1));
  useLayoutEffect(() => { const node = scroller.current; if (node) node.scrollLeft = at * node.clientWidth; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!items.length) onClose(); }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (to: number) => {
    const node = scroller.current;
    if (!node || to < 0 || to >= items.length) return;
    node.scrollTo({ left: to * node.clientWidth, behavior: 'smooth' });
    setIndex(to);
  };
  const current = items[at];
  if (!current) return null;
  const target = zone === 'passage' ? 'Câu hỏi' : 'Đoạn văn';
  return (
    <div className="cv-pv" role="dialog" aria-label={`Xem ảnh ${at + 1}/${items.length}`}>
      <div className="cv-pv-h"><b>Ảnh {at + 1}/{items.length}</b><button type="button" className="cv-pv-tag" onClick={() => onEdit(current.id)}>{zone === 'passage' ? 'Đoạn văn' : twoZones ? 'Câu hỏi' : 'Ảnh'} · Cắt / xoay</button></div>
      <div className="cv-pv-m">
        <div ref={scroller} className="cv-pv-s" onScroll={event => { const node = event.currentTarget; setIndex(Math.round(node.scrollLeft / Math.max(1, node.clientWidth))); }}>
          {items.map((item, number) => <div key={item.id} className="cv-pv-i"><img src={item.url} alt={`Ảnh ${number + 1}`} /></div>)}
        </div>
        {at > 0 && <button type="button" className="cv-pv-ch is-l" aria-label="Ảnh trước" onClick={() => go(at - 1)}>‹</button>}
        {at < items.length - 1 && <button type="button" className="cv-pv-ch is-r" aria-label="Ảnh sau" onClick={() => go(at + 1)}>›</button>}
      </div>
      <div className="cv-pv-d" aria-hidden="true">{items.map((item, number) => <i key={item.id} className={number === at ? 'is-on' : ''} />)}</div>
      <p className="cv-pv-hint">Vuốt ngang để xem ảnh khác</p>
      <div className="cv-pv-row">
        <button type="button" className="cv-pv-b is-del" onClick={() => onRemove(current.id)}>Xoá</button>
        {twoZones && <button type="button" className="cv-pv-b" onClick={() => onSwitch(current.id)}>Chuyển sang {target}</button>}
      </div>
      <button type="button" className="rd-btn rd-btn--pink cv-wide" onClick={onClose}>Xong</button>
    </div>
  );
}
