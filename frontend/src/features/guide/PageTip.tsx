import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { Soc } from '@/shared/ui/soc/Soc';
import { useTipsHeld } from './GuideContext';
import { TIPS, claimTip, hasSeenTip, markTipSeen, placeCard, releaseTip, shouldShowTip, tipsDisabled, type TipId } from './lib/guideTips';
import './guide.css';

type Box = { left: number; top: number; width: number; height: number; radius: string };

const PAD = 6;
const CARD_W = 310;
// Anything else that holds the screen: dialogs, sheets and the streak celebration.
const OTHER_OVERLAY = '[role="dialog"]:not([data-guide-tip]), [aria-modal="true"]:not([data-guide-tip]), .streak-celebration, .ph-sheet-root';

const findTarget = (id: TipId) => document.querySelector<Element>(`[data-guide="${id}"]`);

function boxOf(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const radius = el instanceof HTMLElement ? getComputedStyle(el).borderRadius : '';
  const px = parseFloat(radius);
  return { left: r.left, top: r.top, width: r.width, height: r.height, radius: px ? `${px + PAD}px` : '16px' };
}

/** Things next to the target that the card should not cover, marked data-guide-avoid="<id>". */
const avoidRects = (id: TipId) => [...document.querySelectorAll<Element>(`[data-guide-avoid="${id}"]`)].map(el => el.getBoundingClientRect()).filter(r => r.width > 0 || r.height > 0)
  .map(r => ({ left: r.left, top: r.top, width: r.width, height: r.height }));

const sameBox = (a: Box | null, b: Box | null) => !!a && !!b && Math.abs(a.left - b.left) < .5 && Math.abs(a.top - b.top) < .5 && Math.abs(a.width - b.width) < .5 && Math.abs(a.height - b.height) < .5;

/**
 * First-visit tip for one page: the rest of the screen dims, the control marked data-guide="<id>" is spotlighted,
 * and Sóc says one line. Shows once per owner, only when `ready` (the page is not in its empty state),
 * waits while anything else holds the screen, and closes on "Hiểu rồi", ✕, Esc or a tap anywhere.
 */
export function PageTip({ id, ready = true }: { id: TipId; ready?: boolean }) {
  const held = useTipsHeld();
  const owner = getActiveAccountId();
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(120);
  const card = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const textId = useId();

  const close = useCallback(() => {
    setOpen(false);
    releaseTip(id);
    const back = restoreTo.current;
    restoreTo.current = null;
    if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
  }, [id]);

  // Wait for the target to be on screen and nothing else open, then show (and remember it straight away).
  useEffect(() => {
    if (open || !shouldShowTip({ seen: hasSeenTip(owner, id), ready, held, disabled: tipsDisabled(), otherOpen: false })) return;
    let timer = 0;
    const tryOpen = () => {
      const el = findTarget(id);
      const b = el && boxOf(el);
      if (el && b && !document.querySelector(OTHER_OVERLAY) && !hasSeenTip(owner, id) && claimTip(id)) {
        if (b.top < 0 || b.top + b.height > window.innerHeight) el.scrollIntoView({ block: 'center' });
        markTipSeen(owner, id);
        restoreTo.current = document.activeElement;
        setBox(boxOf(el));
        setOpen(true);
        return;
      }
      timer = window.setTimeout(tryOpen, 300);
    };
    timer = window.setTimeout(tryOpen, 600);
    return () => window.clearTimeout(timer);
  }, [open, ready, held, owner, id]);

  // Something else took the screen: step aside (the tip was already counted as seen).
  useEffect(() => { if (open && held) close(); }, [open, held, close]);
  useEffect(() => () => releaseTip(id), [id]);

  // Follow the control while it settles (stakes drop in, the page scrolls, the window resizes).
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let last: Box | null = null;
    const tick = () => {
      const el = findTarget(id);
      const b = el && boxOf(el);
      if (!b) { close(); return; }
      if (!sameBox(b, last)) { last = b; setBox(b); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open, id, close]);

  useLayoutEffect(() => {
    if (open && card.current) setCardH(card.current.offsetHeight);
  }, [open, box?.width]);
  // The card takes focus (no ring on a button the learner did not reach by keyboard); Tab moves to ✕ and Hiểu rồi.
  useEffect(() => { if (open) card.current?.focus({ preventScroll: true }); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  if (!open || !box) return null;

  const tip = TIPS[id];
  const spot = { left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
  const place = placeCard(spot, { width: window.innerWidth, height: window.innerHeight }, { width: CARD_W, height: cardH }, 14, avoidRects(id));
  // Two buttons: keep Tab inside the card.
  const trap = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = card.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!items?.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className="rd gt-root" data-guide-tip="" onClick={close}>
      <div className="gt-spot" style={{ ...spot, borderRadius: box.radius }} aria-hidden="true" />
      <div ref={card} className={'gt-card ' + (place.below ? 'is-below' : 'is-above')} role="dialog" aria-modal="true" aria-describedby={textId} aria-label="Gợi ý của Sóc"
        data-guide-tip="" data-tip={id} tabIndex={-1} onKeyDown={trap}
        style={{ left: place.left, top: place.top, width: place.width, '--tail': `${place.tail}px` } as CSSProperties}>
        <Soc state="idle" size={64} className="gt-soc" />
        <button type="button" className="gt-x" aria-label="Đóng gợi ý" onClick={close}>✕</button>
        <p id={textId}>{tip.before}<b>{tip.bold}</b>{tip.after}</p>
        <button type="button" className="gt-ok" style={{ background: tip.ok, boxShadow: `0 3px 0 ${tip.okLip}` }} onClick={close}>Hiểu rồi</button>
      </div>
    </div>,
    document.body
  );
}
