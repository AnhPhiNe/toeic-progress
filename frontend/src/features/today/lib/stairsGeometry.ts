/** Isometric stairs layout for the Hôm nay scene (scene units, 780×900 viewBox). */
export const SCENE_W = 780;
export const SCENE_H = 900;

export interface StairsGeometry {
  dx: number;
  dy: number;
  /** Half the width / half the height of one block's top diamond. */
  tw: number;
  th: number;
  bx: (i: number) => number;
  by: (i: number) => number;
  /** Block height so every block reaches below the scene floor. */
  bh: (i: number) => number;
  cup: { x: number; y: number };
  /** Top-left of Sóc (78 px wide) standing on block i. */
  soc: (i: number) => { x: number; y: number };
}

/**
 * blocks = number of stair blocks before the trophy; viewW = scene width in units (780 at 1440px, wider on wide
 * windows). The climb always rises about 440 units and spreads to fill the width up to the right-hand panel, so the
 * trophy sits near the panel instead of leaving an empty gap on wide screens.
 */
export function stairsGeometry(blocks: number, viewW: number = SCENE_W): StairsGeometry {
  const n = Math.max(1, blocks);
  const dy = Math.min(110, 440 / n);
  const span = Math.max(420, viewW - 300);
  const dx = Math.min(110, span / n);
  const tw = Math.max(36, Math.min(76, Math.round(dx * 0.66)));
  const th = Math.round(tw * 30 / 58);
  const bx = (i: number) => 135 + i * dx;
  const by = (i: number) => 715 - i * dy;
  return {
    dx, dy, tw, th, bx, by,
    bh: i => 150 + i * dy,
    cup: { x: Math.min(viewW - 110, bx(n) + tw + 16), y: by(n) - 40 },
    soc: i => ({ x: bx(i) - 39, y: by(i) - 80 })
  };
}

const WORDS = ['Không', 'Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười'];
export const countWord = (n: number) => WORDS[n] ?? String(n);
