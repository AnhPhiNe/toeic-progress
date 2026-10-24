/** DOM/stacking order, rather than effect registration order, decides which dialog is on top. */
export function compareModalLayers(a: HTMLElement, b: HTMLElement): number {
  if (a === b) return 0;
  if (a.contains(b)) return -1;
  if (b.contains(a)) return 1;
  const path = (node: HTMLElement) => {
    const nodes: HTMLElement[] = [];
    for (let current: HTMLElement | null = node; current; current = current.parentElement) nodes.unshift(current);
    return nodes;
  };
  const aPath = path(a);
  const bPath = path(b);
  let index = 0;
  while (aPath[index] === bPath[index]) index++;
  const level = (nodes: HTMLElement[]) => {
    for (const node of nodes.slice(index)) {
      const style = getComputedStyle(node);
      if (style.zIndex !== 'auto' && style.position !== 'static') return Number(style.zIndex) || 0;
    }
    return 0;
  };
  const difference = level(aPath) - level(bPath);
  if (difference) return difference;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
