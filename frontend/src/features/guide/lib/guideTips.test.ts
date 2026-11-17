import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimTip, hasSeenTip, markTipSeen, placeCard, readSeenTips, releaseTip, resetTips, shouldShowTip, tipsDisabled } from './guideTips';

describe('seen tips', () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remembers each tip once per owner', () => {
    expect(hasSeenTip('a', 'journey')).toBe(false);
    markTipSeen('a', 'journey');
    markTipSeen('a', 'journey');
    markTipSeen('a', 'notebook');
    expect(readSeenTips('a')).toEqual(['journey', 'notebook']);
    expect(hasSeenTip('b', 'journey')).toBe(false);
    expect(hasSeenTip(null, 'journey')).toBe(false);
    markTipSeen(null, 'practice');
    expect(values.get('rd_guide_tips_seen_v1:guest')).toBe('["practice"]');
  });

  it('"Xem lại" brings every tip back for that owner only', () => {
    markTipSeen('a', 'journey');
    markTipSeen('b', 'journey');
    resetTips('a');
    expect(readSeenTips('a')).toEqual([]);
    expect(readSeenTips('b')).toEqual(['journey']);
  });

  it('ignores unknown or broken values and treats unreadable storage as seen', () => {
    values.set('rd_guide_tips_seen_v1:a', '["journey","other"]');
    expect(readSeenTips('a')).toEqual(['journey']);
    values.set('rd_guide_tips_seen_v1:a', '{broken');
    expect(readSeenTips('a')).toEqual(['journey', 'practice', 'notebook']);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    expect(hasSeenTip('a', 'practice')).toBe(true);
    expect(() => markTipSeen('a', 'practice')).not.toThrow();
    expect(() => resetTips('a')).not.toThrow();
  });
});

describe('when a tip shows', () => {
  const base = { seen: false, ready: true, held: false, disabled: false, otherOpen: false };
  it('shows on a page with content that has not been seen', () => {
    expect(shouldShowTip(base)).toBe(true);
  });
  it('waits while the logger, a run, review, a result or a celebration holds the screen', () => {
    expect(shouldShowTip({ ...base, held: true })).toBe(false);
    expect(shouldShowTip({ ...base, otherOpen: true })).toBe(false);
  });
  it('skips seen tips, empty pages and e2e runs', () => {
    expect(shouldShowTip({ ...base, seen: true })).toBe(false);
    expect(shouldShowTip({ ...base, ready: false })).toBe(false);
    expect(shouldShowTip({ ...base, disabled: true })).toBe(false);
  });
  it('never opens two tips at once', () => {
    expect(claimTip('journey')).toBe(true);
    expect(claimTip('practice')).toBe(false);
    expect(claimTip('journey')).toBe(true);
    releaseTip('practice');
    expect(claimTip('notebook')).toBe(false);
    releaseTip('journey');
    expect(claimTip('notebook')).toBe(true);
    releaseTip('notebook');
  });
  it('is on unless the build turns it off', () => {
    expect(typeof tipsDisabled()).toBe('boolean');
  });
});

describe('card placement', () => {
  const vp = { width: 390, height: 844 };
  const card = { width: 310, height: 120 };
  it('sits below a control near the top, inside the gutter, tail on the control', () => {
    const p = placeCard({ left: 300, top: 90, width: 76, height: 44 }, vp, card);
    expect(p.below).toBe(true);
    expect(p.top).toBe(90 + 44 + 14);
    expect(p.left).toBe(390 - 16 - 310);
    expect(p.left + p.tail).toBeCloseTo(338, 0);
  });
  it('sits above a control near the bottom', () => {
    const p = placeCard({ left: 10, top: 650, width: 370, height: 58 }, vp, card);
    expect(p.below).toBe(false);
    expect(p.top).toBe(650 - 14 - 120);
    expect(p.left).toBe(40);
  });
  it('narrows to the screen on very small phones', () => {
    expect(placeCard({ left: 0, top: 0, width: 20, height: 20 }, { width: 300, height: 600 }, card).width).toBe(268);
  });
  it('keeps clear of neighbouring stakes: slides to the side that hides none', () => {
    const wide = { width: 1440, height: 900 };
    const target = { left: 1056, top: 204, width: 88, height: 126 };
    const stake = { left: 880, top: 330, width: 100, height: 120 };
    const plain = placeCard(target, wide, card);
    const clear = placeCard(target, wide, card, 14, [stake]);
    expect(plain.left).toBeLessThan(stake.left + stake.width);
    expect(clear.left).toBeGreaterThanOrEqual(stake.left + stake.width);
    expect(clear.left + clear.width).toBeLessThanOrEqual(wide.width - 16);
    expect(clear.below).toBe(plain.below);
    expect(clear.left + clear.tail).toBeGreaterThan(target.left);
  });
  it('flips above or below when no sideways slide clears the neighbour', () => {
    const p = placeCard({ left: 100, top: 300, width: 80, height: 40 }, { width: 390, height: 844 }, card, 14, [{ left: 10, top: 354, width: 370, height: 120 }]);
    expect(p.below).toBe(false);
  });
  it('is unchanged when nothing needs avoiding', () => {
    const t = { left: 300, top: 90, width: 76, height: 44 };
    expect(placeCard(t, vp, card, 14, [{ left: 0, top: 700, width: 50, height: 50 }])).toEqual(placeCard(t, vp, card));
  });
});
