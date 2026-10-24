import { useEffect, useRef } from 'react';
import { compareModalLayers } from './modalLayerOrder';

/**
 * Lets the device Back button (Android, browser Back) close the top dialog or sheet instead of leaving the page.
 *
 * Opening an overlay adds a history entry with the same URL; Back pops it and closes the top overlay. When an
 * overlay closes any other way (X, Escape, Save), its entry stays but is marked spent: the next overlay or page
 * change reuses it, and if Back lands on it the extra step is taken automatically. Nothing navigates on close,
 * so a close never races a reload or a route change.
 */
type Entry = { id: number; close: () => void; element?: () => HTMLElement | null };

const stack: Entry[] = [];
let nextId = 1;
let listening = false;
/** The current history entry belongs to an overlay that has already closed. */
let spentEntry: number | null = null;

const overlayId = (state: unknown) =>
  state && typeof state === 'object' && 'toeicOverlay' in state ? Number((state as { toeicOverlay: unknown }).toeicOverlay) : null;

function onPopState() {
  // A portal child can register effects before its parent. Follow visible DOM layers.
  const top = stack.reduce<Entry | undefined>((current, entry) => {
    const a = current?.element?.();
    const b = entry.element?.();
    return current && a?.isConnected && b?.isConnected && compareModalLayers(a, b) > 0 ? current : entry;
  }, undefined);
  if (top) stack.splice(stack.indexOf(top), 1);
  if (top) { top.close(); return; }
  // Back left a spent overlay entry: we are on the page it was opened from, which looks identical.
  if (spentEntry !== null) { spentEntry = null; window.history.back(); }
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // A reload can land on an overlay entry whose dialog no longer exists.
  if (overlayId(window.history.state) !== null) window.history.replaceState(null, '', window.location.href);
  window.addEventListener('popstate', onPopState);
}

/** Route changes call this: an overlay entry on top is replaced by the new page instead of stacking under it. */
export function navigateFromOverlay(path: string) {
  if (overlayId(window.history.state) === null) return false;
  spentEntry = null;
  window.history.replaceState({}, '', path);
  return true;
}

function openOverlay(close: () => void, element?: () => HTMLElement | null) {
  listen();
  const id = nextId++;
  if (spentEntry !== null && overlayId(window.history.state) === spentEntry) window.history.replaceState({ toeicOverlay: id }, '', window.location.href);
  else window.history.pushState({ toeicOverlay: id }, '', window.location.href);
  spentEntry = null;
  stack.push({ id, close, element });
  return id;
}

function closeOverlay(id: number) {
  const index = stack.findIndex(entry => entry.id === id);
  if (index < 0) return; // Already closed by Back.
  stack.splice(index, 1);
  if (overlayId(window.history.state) === id) spentEntry = id;
}

/** Register an open overlay with the device Back button. */
export function useOverlayHistory(isOpen: boolean, onClose: () => void, element?: { current: HTMLElement | null }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const id = openOverlay(() => onCloseRef.current(), element ? () => element.current : undefined);
    return () => closeOverlay(id);
  }, [isOpen, element]);
}
