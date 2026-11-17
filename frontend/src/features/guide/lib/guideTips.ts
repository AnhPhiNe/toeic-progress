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
export type Rect = { left: number; top: number; width: number; height: number };

const overlapArea = (a: Rect, b: Rect) => {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

/**
 * Where the card sits next to the spotlighted control: below it when there is room, otherwise above,
 * centred on it and kept inside a 16px gutter. `tail` is the arrow's x inside the card.
 *
 * `avoid` lists neighbouring things the card should not hide (the other stakes on the Hành trình page).
 * The card then slides to whichever side of the control, or flips above/below, covers the least of them;
 * on a tie the default placement above wins. `tail` still points at the control.
 */
export function placeCard(target: Rect, viewport: { width: number; height: number }, card: { width: number; height: number }, gap = 14, avoid: Rect[] = []): Placement {
  const gutter = 16;
  const width = Math.min(card.width, viewport.width - gutter * 2);
  const cx = target.left + target.width / 2;
  const clampLeft = (left: number) => Math.round(Math.min(Math.max(left, gutter), viewport.width - gutter - width));
  const roomBelow = viewport.height - (target.top + target.height) - gap;
  const roomAbove = target.top - gap;
  const preferBelow = roomBelow >= card.height + gutter || roomBelow >= roomAbove;
  const build = (below: boolean, left: number): Placement => {
    const top = below ? target.top + target.height + gap : target.top - gap - card.height;
    return { left, top: Math.round(Math.max(gutter, top)), width, below, tail: Math.round(Math.min(Math.max(cx - left, 26), width - 26)) };
  };
  const first = build(preferBelow, clampLeft(cx - width / 2));
  if (!avoid.length) return first;
  const lefts = [first.left, clampLeft(target.left), clampLeft(target.left + target.width - width)];
  const candidates = [first, ...[preferBelow, !preferBelow].flatMap(below => lefts.map(left => build(below, left)))];
  const fits = (p: Placement) => p.below ? p.top + card.height <= viewport.height : p.top >= 0;
  const cost = (p: Placement) => {
    const box = { left: p.left, top: p.top, width: p.width, height: card.height };
    return avoid.reduce((sum, rect) => sum + overlapArea(box, rect), 0) + (fits(p) ? 0 : 1e9);
  };
  return candidates.reduce((best, p) => cost(p) < cost(best) ? p : best, first);
}
