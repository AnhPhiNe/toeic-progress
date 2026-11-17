/** First-visit page tips and the "Cách dùng app" page. Sketch: design/previews/mock-guide.html */

export type TipId = 'journey' | 'practice' | 'notebook';
export const TIP_IDS: readonly TipId[] = ['journey', 'practice', 'notebook'];

export interface TipCopy {
  /** Sentence before and after the bold words. */
  before: string;
  bold: string;
  after: string;
  /** "Hiểu rồi" colour, taken from the page's own main control. */
  ok: string;
  okLip: string;
}

export const TIPS: Record<TipId, TipCopy> = {
  journey: { before: 'Mỗi ', bold: 'cọc', after: ' là một đề bạn đã ghi. Chạm vào cọc để xem điểm từng phần.', ok: '#e0a400', okLip: '#b98700' },
  practice: { before: 'Chọn một chiếc bánh (một Part), rồi ', bold: 'Bật lò', after: ' để bấm giờ. Làm đề ở sách hay web nào cũng được.', ok: '#ff7a3d', okLip: '#d9533f' },
  notebook: { before: 'Chữa đề xong, ', bold: 'chụp trang chữa bài', after: '. Sóc tách từng câu sai thành thẻ để ôn lại.', ok: '#ff7a9c', okLip: '#d6416a' }
};

const seenKey = (owner: string | null) => `rd_guide_tips_seen_v1:${owner ?? 'guest'}`;

export function readSeenTips(owner: string | null): TipId[] {
  try {
    const raw = localStorage.getItem(seenKey(owner));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? TIP_IDS.filter(id => list.includes(id)) : [];
  } catch {
    // Unreadable storage: treat every tip as seen so nothing nags on each visit.
    return [...TIP_IDS];
  }
}

export function hasSeenTip(owner: string | null, id: TipId): boolean {
  return readSeenTips(owner).includes(id);
}

export function markTipSeen(owner: string | null, id: TipId): void {
  try {
    const seen = new Set(readSeenTips(owner));
    seen.add(id);
    localStorage.setItem(seenKey(owner), JSON.stringify(TIP_IDS.filter(t => seen.has(t))));
  } catch { /* The tip may show again; harmless. */ }
}

/** "Xem lại": every page shows its tip again on the next visit. */
export function resetTips(owner: string | null): void {
  try { localStorage.removeItem(seenKey(owner)); } catch { /* Nothing to reset. */ }
}

/**
 * E2E runs set VITE_GUIDE_TIPS=off so the tips never cover the page under test;
 * a spec turns them back on with window.__GUIDE_TIPS__ = true in an init script.
 */
export function tipsDisabled(): boolean {
  const forced = typeof window !== 'undefined' && (window as unknown as { __GUIDE_TIPS__?: boolean }).__GUIDE_TIPS__ === true;
  return import.meta.env.VITE_GUIDE_TIPS === 'off' && !forced;
}

/** A tip shows when the page has real content, the learner has not seen it, and nothing else holds the screen. */
export function shouldShowTip(input: { seen: boolean; ready: boolean; held: boolean; disabled: boolean; otherOpen: boolean }): boolean {
  return input.ready && !input.seen && !input.held && !input.disabled && !input.otherOpen;
}

// Never two tips at once: the first tip to open holds this until it closes.
let openTip: TipId | null = null;
export function claimTip(id: TipId): boolean {
  if (openTip && openTip !== id) return false;
  openTip = id;
  return true;
}
export function releaseTip(id: TipId): void {
  if (openTip === id) openTip = null;
}

export type Placement = { left: number; top: number; width: number; below: boolean; tail: number };

/**
 * Where the card sits next to the spotlighted control: below it when there is room, otherwise above,
 * centred on it and kept inside a 16px gutter. `tail` is the arrow's x inside the card.
 */
export function placeCard(target: { left: number; top: number; width: number; height: number }, viewport: { width: number; height: number }, card: { width: number; height: number }, gap = 14): Placement {
  const gutter = 16;
  const width = Math.min(card.width, viewport.width - gutter * 2);
  const cx = target.left + target.width / 2;
  const left = Math.round(Math.min(Math.max(cx - width / 2, gutter), viewport.width - gutter - width));
  const roomBelow = viewport.height - (target.top + target.height) - gap;
  const roomAbove = target.top - gap;
  const below = roomBelow >= card.height + gutter || roomBelow >= roomAbove;
  const top = below ? target.top + target.height + gap : target.top - gap - card.height;
  const tail = Math.round(Math.min(Math.max(cx - left, 26), width - 26));
  return { left, top: Math.round(Math.max(gutter, top)), width, below, tail };
}
