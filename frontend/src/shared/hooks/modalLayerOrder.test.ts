import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareModalLayers } from './modalLayerOrder';

type FakeNode = { parentElement: FakeNode | null; order: number; position: string; zIndex: string; contains: (node: FakeNode) => boolean; compareDocumentPosition: (node: FakeNode) => number };
const node = (parent: FakeNode | null, order: number, zIndex = 'auto'): FakeNode => ({
  parentElement: parent, order, position: zIndex === 'auto' ? 'static' : 'fixed', zIndex,
  contains(other) { for (let current: FakeNode | null = other; current; current = current.parentElement) if (current === this) return true; return false; },
  compareDocumentPosition(other) { return other.order > this.order ? 4 : 2; }
});
const compare = (a: FakeNode, b: FakeNode) => compareModalLayers(a as unknown as HTMLElement, b as unknown as HTMLElement);
afterEach(() => vi.unstubAllGlobals());
function setup() {
  vi.stubGlobal('getComputedStyle', (element: FakeNode) => element);
  vi.stubGlobal('Node', { DOCUMENT_POSITION_FOLLOWING: 4 });
  return node(null, 0);
}
describe('modal visual order', () => {
  it('keeps a nested sheet above its parent, regardless of hook effect order', () => {
    const body = setup();
    const parent = node(body, 1, '50');
    const child = node(parent, 2, '60');
    expect(compare(parent, child)).toBeLessThan(0);
    expect(compare(child, parent)).toBeGreaterThan(0);
  });
  it('uses the portal stacking level before document insertion order', () => {
    const body = setup();
    const topPortal = node(body, 1, '70');
    const parentPortal = node(body, 3, '50');
    const top = node(topPortal, 2);
    const parent = node(parentPortal, 4);
    expect(compare(top, parent)).toBeGreaterThan(0);
  });
  it('uses DOM order for equal-level portals, not registration order', () => {
    const body = setup();
    const oldDialog = node(node(body, 1, '60'), 2);
    const newDialog = node(node(body, 3, '60'), 4);
    expect(compare(oldDialog, newDialog)).toBeLessThan(0);
    expect(compare(newDialog, oldDialog)).toBeGreaterThan(0);
  });
  it('does not let an inner z-index escape its parent stacking context', () => {
    const body = setup();
    const lowerContext = node(body, 1, '50');
    const dialog = node(lowerContext, 2, '999');
    const higherPortal = node(body, 3, '60');
    expect(compare(dialog, higherPortal)).toBeLessThan(0);
  });
});
