import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './illustrations.css';

/** What a tapped scene object (coin, stone, flag, trophy) tells: a title, one line, and maybe one action. */
export interface PopData {
  key: string;
  title: string;
  sub: ReactNode;
  action?: { label: string; run: (anchor: Element) => void };
}
interface Open extends PopData { anchor: Element; keyboard: boolean }

/**
 * Small popover above a tapped object of an illustrated scene. It is portaled to <body> with fixed positioning, so
 * it is placed correctly inside scaled scenes. Escape or a tap elsewhere closes it; opened from the keyboard, its
 * button takes the focus and Escape returns it to the object.
 */
export function useScenePopover() {
  const [pop, setPop] = useState<Open | null>(null);
  const close = useCallback(() => setPop(null), []);
  const toggle = useCallback((anchor: Element, data: PopData, keyboard: boolean) => {
    setPop(p => (p?.key === data.key ? null : { ...data, anchor, keyboard }));
  }, []);
  const tapProps = (data: PopData, label: string, className = '') => ({
    className: 'il-tap' + (className ? ' ' + className : ''),
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-expanded': pop?.key === data.key,
    onClick: (e: { currentTarget: Element; detail?: number }) => toggle(e.currentTarget, data, e.detail === 0),
    onKeyDown: (e: ReactKeyboardEvent<Element>) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e.currentTarget, data, true); }
    }
  });
  const node = pop ? <ScenePopover pop={pop} onClose={close} /> : null;
  return { tapProps, node, close, openKey: pop?.key ?? null };
}

function ScenePopover({ pop, onClose }: { pop: Open; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = pop.anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const below = r.top - h - 16 < 8;
    const x = Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, r.left + r.width / 2));
    setAt({ x, y: below ? r.bottom + 12 : r.top - 12, below });
  }, [pop]);
  useEffect(() => { if (pop.keyboard) btn.current?.focus({ preventScroll: true }); }, [pop]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onClose();
      if (pop.anchor instanceof HTMLElement || pop.anchor instanceof SVGElement) pop.anchor.focus({ preventScroll: true });
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || pop.anchor.contains(t)) return;
      onClose();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [pop, onClose]);
  return createPortal(
    <div ref={ref} className={'rd il-pop' + (at?.below ? ' is-below' : '')} role="dialog" aria-label={pop.title}
      style={at ? { left: at.x, top: at.y } : { left: -9999, top: 0 }}>
      <b>{pop.title}</b><span>{pop.sub}</span>
      {pop.action && <button ref={btn} type="button" onClick={() => { const a = pop.action!; onClose(); a.run(pop.anchor); }}>{pop.action.label}</button>}
    </div>,
    document.body
  );
}
