import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '@/shared/hooks/useModalA11y';

interface Transform { scale: number; x: number; y: number }
const MIN = 1, MAX = 5;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Dark full-screen viewer: pinch with two fingers (or wheel / double tap) to zoom, drag to move, × to go back. */
export function PhoneImageViewer({ images, title = 'Ảnh đính kèm', onClose }: { images: Array<{ id: string; url: string }>; title?: string; onClose: () => void }) {
  const ref = useModalA11y(true, onClose);
  const [index, setIndex] = useState(0);
  const [t, setT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  useEffect(() => { setT({ scale: 1, x: 0, y: 0 }); }, [index]);

  const limit = (next: Transform): Transform => {
    const box = stage.current?.getBoundingClientRect();
    const maxX = box ? (box.width * (next.scale - 1)) / 2 : 0, maxY = box ? (box.height * (next.scale - 1)) / 2 : 0;
    return { scale: next.scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  };
  const onDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: t.scale };
    } else if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - last.current < 280) setT(current => current.scale > 1 ? { scale: 1, x: 0, y: 0 } : limit({ scale: 2.5, x: 0, y: 0 }));
      last.current = now;
    }
  };
  const onMove = (event: React.PointerEvent) => {
    const before = pointers.current.get(event.pointerId);
    if (!before) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const scale = clamp(gesture.current.scale * Math.hypot(a.x - b.x, a.y - b.y) / gesture.current.distance, MIN, MAX);
      setT(current => limit({ ...current, scale }));
    } else if (t.scale > 1) {
      setT(current => limit({ ...current, x: current.x + point.x - before.x, y: current.y + point.y - before.y }));
    }
  };
  const onUp = (event: React.PointerEvent) => { pointers.current.delete(event.pointerId); if (pointers.current.size < 2) gesture.current = null; };
  const onWheel = (event: React.WheelEvent) => setT(current => limit({ ...current, scale: clamp(current.scale * (event.deltaY < 0 ? 1.15 : 0.87), MIN, MAX) }));
  const active = images[index];

  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="rd pv">
      <div className="pv-top">
        <button type="button" className="pv-x" aria-label="Đóng ảnh" onClick={onClose}>×</button>
        <b>{title}</b>
        {images.length > 1 && <span className="pv-tabs">{images.map((image, position) => (
          <button key={image.id} type="button" aria-pressed={index === position} onClick={() => setIndex(position)}>{position + 1}</button>))}</span>}
      </div>
      <div ref={stage} className="pv-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
        {active && <img src={active.url} alt={`${title} ${index + 1}`} draggable={false}
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})` }} />}
      </div>
      <p className="pv-hint">Chụm hai ngón để phóng to</p>
    </div>,
    document.body
  );
}
