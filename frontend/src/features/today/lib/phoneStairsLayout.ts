/** Pixel layout of the flat phone stairs (bars + Sóc + trophy), recomputed from the height left above the task panel. */
export interface PhoneStairsInput {
  /** Scene width in px. */
  w: number;
  /** Top of the free area (below the heading). */
  top: number;
  /** Floor line of the stairs (just under the top edge of the panel). */
  base: number;
  /** Bars before the trophy. */
  blocks: number;
  /** Index of the bar Sóc stands on (0 when there is no test yet). */
  cur: number;
}

export interface Bar { x: number; y: number; w: number; h: number }
export interface PhoneStairsLayout {
  bars: Bar[];
  barW: number;
  soc: { left: number; top: number; width: number };
  cup: { left: number; top: number; width: number; height: number };
}

const SX = 14;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function phoneStairsLayout({ w, top, base, blocks, cur }: PhoneStairsInput): PhoneStairsLayout {
  const n = Math.max(1, blocks);
  const avail = Math.max(90, base - top - 10);
  const scale = clamp((base - top) / 420, 0.6, 0.95);
  const cupW = 90 * scale, cupH = 100 * scale;
  const barW = clamp((w - SX - 12 - cupW / 2 - 6) / (n - 0.5), 18, 52);
  const h0 = Math.max(18, avail * 0.16);
  const rise = n > 1 ? Math.max(5, ((avail - h0 - 40) / (n - 1)) * 0.92) : 0;
  const bars: Bar[] = Array.from({ length: n }, (_, i) => {
    const h = h0 + rise * i;
    return { x: SX + i * barW, y: base - h, w: barW, h };
  });
  const at = bars[clamp(cur, 0, n - 1)];
  const socW = clamp(rise * 1.7, 40, 60);
  const cupCenter = Math.min(w - 12 - cupW / 2, SX + (n - 0.5) * barW + 6);
  return {
    bars,
    barW,
    soc: { left: at.x + barW / 2 - socW * 0.47, top: at.y - socW * 1.08 + 4, width: socW },
    cup: { left: cupCenter - cupW / 2, top: bars[n - 1].y - cupH - 6, width: cupW, height: cupH }
  };
}
