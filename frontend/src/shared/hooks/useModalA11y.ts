import { useEffect, useRef } from 'react';
import { useOverlayHistory } from './overlayHistory';
import { compareModalLayers } from './modalLayerOrder';

const FOCUSABLE_SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
function ownedPopoverRoots(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[aria-controls][aria-expanded="true"]'))
    .flatMap(control => (control.getAttribute('aria-controls') ?? '').split(/\s+/))
    .map(id => {
      const controlled = document.getElementById(id);
      const portal = controlled?.closest<HTMLElement>('[data-modal-owner]');
      return portal?.dataset.modalOwner === id ? portal : controlled;
    }).filter((element): element is HTMLElement => !!element && !container.contains(element));
}
function modalContains(container: HTMLElement, target: Node | null) {
  return container.contains(target) || ownedPopoverRoots(container).some(popup => popup.contains(target));
}
function focusableElements(container: HTMLElement): HTMLElement[] {
  const roots = [container, ...ownedPopoverRoots(container)];
  return Array.from(new Set(roots.flatMap(root => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))))).filter(el => el.tabIndex >= 0
    && !el.closest('[inert], [aria-hidden="true"], [hidden]')
    && getComputedStyle(el).visibility !== 'hidden' && (el.offsetParent !== null || el === document.activeElement));
}

type Layer = { node: HTMLElement; close: () => void };
const layers: Layer[] = [];
const isolated = new Map<HTMLElement, boolean>();
let originalOverflow = '';
let activeLayer: Layer | undefined;
function topLayer() {
  const connected = layers.filter(layer => layer.node.isConnected)
    .sort((a, b) => compareModalLayers(a.node, b.node));
  return connected[connected.length - 1];
}
function restoreIsolation() {
  for (const [node, inert] of isolated) node.inert = inert;
  isolated.clear();
}
function isolateBackground() {
  restoreIsolation();
  activeLayer = topLayer();
  let active: HTMLElement | null = activeLayer?.node ?? null;
  const popovers = active ? ownedPopoverRoots(active) : [];
  // Disable sibling branches, including sibling portals and obscured parent controls,
  // without ever making an ancestor of the active dialog inert.
  while (active && active !== document.body) {
    for (const sibling of Array.from(active.parentElement?.children ?? [])) {
      if (sibling instanceof HTMLElement && sibling !== active && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) {
        // A non-tabbable close backdrop belongs to this active modal, not the page
        // behind it. Keep pointer dismissal while excluding it from the focus loop.
        if (active === topLayer()?.node && sibling.matches('button[tabindex="-1"][aria-label="Đóng"]')) continue;
        if (popovers.some(popup => sibling === popup || sibling.contains(popup))) continue;
        isolated.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    active = active.parentElement;
  }
}
function focusInside(node: HTMLElement) {
  if (!node.hasAttribute('tabindex')) node.tabIndex = -1;
  (focusableElements(node)[0] ?? node).focus({ preventScroll: true });
}
function handleKeyDown(event: KeyboardEvent) {
  const top = topLayer();
  if (!top) return;
  if (event.key === 'Escape') {
    if (event.target instanceof Element && event.target.closest('[role="combobox"][aria-expanded="true"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    top.close();
  } else if (event.key === 'Tab') {
    const focusables = focusableElements(top.node);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement;
    if (!first || !last) { event.preventDefault(); top.node.focus(); }
    else if (event.shiftKey && (active === first || !focusables.includes(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || !focusables.includes(active))) { event.preventDefault(); first.focus(); }
  }
}
function handleFocusIn(event: FocusEvent) {
  const top = topLayer();
  if (top && event.target instanceof Node && !modalContains(top.node, event.target)) focusInside(top.node);
}

/** One focus/Escape owner for the visually top dialog; lower layers are inert. */
export function useModalA11y(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useOverlayHistory(isOpen, onClose, containerRef);
  useEffect(() => {
    const node = containerRef.current;
    if (!isOpen || !node) return;
    const previous = document.activeElement as HTMLElement | null;
    const layer = { node, close: () => closeRef.current() };
    if (!layers.length) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('focusin', handleFocusIn, true);
    }
    layers.push(layer);
    isolateBackground();
    // Wait until every effect in a portal tree has registered before initial focus.
    queueMicrotask(() => { if (layers.includes(layer) && topLayer() === layer && !modalContains(node, document.activeElement)) focusInside(node); });
    return () => {
      // Passive cleanup can run after React has detached the element.
      const wasTop = activeLayer === layer;
      layers.splice(layers.indexOf(layer), 1);
      isolateBackground();
      if (!layers.length) {
        document.body.style.overflow = originalOverflow;
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('focusin', handleFocusIn, true);
      }
      if (wasTop) queueMicrotask(() => {
        const top = topLayer();
        if (previous?.isConnected && !previous.closest('[inert]') && (!top || modalContains(top.node, previous))) previous.focus({ preventScroll: true });
        else if (top && !modalContains(top.node, document.activeElement)) focusInside(top.node);
      });
    };
  }, [isOpen]);
  return containerRef;
}
