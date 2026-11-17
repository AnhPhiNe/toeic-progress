import { describe, expect, it } from 'vitest';
import { phoneStairsLayout } from './phoneStairsLayout';

describe('phoneStairsLayout', () => {
  const input = { w: 390, top: 200, base: 560, blocks: 8, cur: 5 };

  it('keeps every bar inside the free area and rising left to right', () => {
    const l = phoneStairsLayout(input);
    expect(l.bars).toHaveLength(8);
    for (const b of l.bars) { expect(b.y).toBeGreaterThanOrEqual(input.top); expect(b.y + b.h).toBeCloseTo(input.base); }
    for (let i = 1; i < l.bars.length; i++) expect(l.bars[i].y).toBeLessThan(l.bars[i - 1].y);
    expect(l.bars[7].x + l.bars[7].w).toBeLessThanOrEqual(input.w);
  });

  it('puts the trophy on screen above the last bar and Sóc on the current bar', () => {
    const l = phoneStairsLayout(input);
    expect(l.cup.left + l.cup.width).toBeLessThanOrEqual(input.w);
    expect(l.cup.top + l.cup.height).toBeLessThanOrEqual(l.bars[7].y);
    const cur = l.bars[5];
    expect(l.soc.left).toBeGreaterThanOrEqual(cur.x - l.soc.width);
    expect(l.soc.top).toBeLessThan(cur.y);
  });

  it('shrinks with the free height instead of overflowing', () => {
    const tall = phoneStairsLayout({ ...input, base: 640 });
    const short = phoneStairsLayout({ ...input, base: 440 });
    expect(short.bars[7].h).toBeLessThan(tall.bars[7].h);
    expect(short.bars[7].y).toBeGreaterThanOrEqual(input.top);
  });

  it('copes with one block and an empty (cur 0) climb', () => {
    const l = phoneStairsLayout({ ...input, blocks: 1, cur: 0 });
    expect(l.bars).toHaveLength(1);
    expect(Number.isFinite(l.soc.top)).toBe(true);
  });
});
