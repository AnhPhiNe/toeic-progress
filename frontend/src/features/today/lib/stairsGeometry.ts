/** Isometric stairs layout for the Hôm nay scene (scene units, 780×900 viewBox). */
export const SCENE_W = 780;
export const SCENE_H = 900;
export const TILE_W = 58;
export const TILE_H = 30;

export interface StairsGeometry {
  dx: number;
  dy: number;
  bx: (i: number) => number;
  by: (i: number) => number;
  /** Block height so every block reaches below the scene floor. */
  bh: (i: number) => number;
  cup: { x: number; y: number };
  /** Top-left of Sóc (78 px wide) standing on block i. */
  soc: (i: number) => { x: number; y: number };
}

/** blocks = number of stair blocks before the trophy. Spacing shrinks so the trophy stays in view. */
export function stairsGeometry(blocks: number): StairsGeometry {
  const n = Math.max(1, blocks);
  const dy = Math.min(70, 520 / n);
  const dx = dy * 66 / 70;
  const bx = (i: number) => 120 + i * dx;
  const by = (i: number) => 760 - i * dy;
  return {
    dx, dy, bx, by,
    bh: i => 150 + i * dy,
    cup: { x: bx(n) + 70, y: by(n) - 40 },
    soc: i => ({ x: bx(i) - 39, y: by(i) - 80 })
  };
}

const WORDS = ['Không', 'Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười'];
export const countWord = (n: number) => WORDS[n] ?? String(n);
