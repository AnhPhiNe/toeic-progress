import { describe, expect, it } from 'vitest';
import { compressTogether, findCut, planPieces, QUALITY_STEPS, scaledSize, sliceAllowance, sliceBands, withinBudget, type Piece, type SourceMeta } from './imageCompress';

/** A fake encoder: a kept file keeps its size; a redrawn one scales with the drawn area and the JPEG quality. */
const fake = (bytesAt2400: number) => async (source: { meta: SourceMeta }, piece: Piece, quality: number) => {
  const height = piece.kind === 'slice' ? piece.height : source.meta.height;
  const size = scaledSize(source.meta.width, height);
  const bytes = piece.kind === 'keep' ? source.meta.bytes : Math.round(bytesAt2400 * (size.width * size.height) / (2400 * 1350) * (quality / 0.85));
  return { id: piece.kind, name: 'x', dataUrl: `data:image/${piece.kind === 'keep' ? 'png' : 'jpeg'};base64,` + 'A'.repeat(Math.ceil(bytes / 3) * 4) };
};
const shot = (width: number, height: number, bytes: number) => ({ meta: { width, height, bytes, type: 'image/png' } });
const MB = 1024 * 1024;

describe('image preparation', () => {
  it('sends screenshots as they are when the group fits (PNG kept)', async () => {
    expect(planPieces({ width: 2560, height: 1440, bytes: 2 * MB })).toEqual([{ kind: 'keep' }]);
    const result = await compressTogether([shot(2560, 1440, 2 * MB), shot(1600, 900, 400_000)], fake(500_000));
    expect(result).toMatchObject({ fits: true, compressed: false, quality: null });
    expect(result.groups.flat().every(image => image.dataUrl.startsWith('data:image/png'))).toBe(true);
  });

  it('cuts a very tall page into ~1600 px parts at blank bands when the group is too heavy', async () => {
    const tall = { width: 1080, height: 4000, bytes: 9 * MB };
    expect(planPieces(tall)).toHaveLength(3);
    expect(sliceBands(1500)).toEqual([{ top: 0, height: 1500 }]);
    // Without row scores the cuts sit on the targets, each part starting 80 px above the previous cut.
    expect(sliceBands(4000)).toEqual([{ top: 0, height: 1600 }, { top: 1520, height: 1600 }, { top: 3040, height: 960 }]);
    const result = await compressTogether([{ meta: tall }], fake(500_000));
    expect(result.compressed).toBe(true);
    expect(result.groups[0]).toHaveLength(3);
    // Slices stay within a zone's images: the tallest page is shrunk instead first.
    expect(sliceAllowance([{ width: 1080, height: 4000, bytes: 1 }, { width: 1080, height: 3000, bytes: 1 }], 3)).toEqual([false, true]);
  });

  it('finds the quiet band nearest the target so lines, tables and figures are not cut', () => {
    // A synthetic page: text lines of 30 px with 10 px gaps, a 300 px table from 1450 to 1750, a blank band at 1420–1440.
    const height = 4000, busy = new Float32Array(height);
    for (let y = 0; y < height; y++) busy[y] = y % 40 < 30 ? 60 : 2;
    for (let y = 1450; y < 1750; y++) busy[y] = 80;
    for (let y = 1420; y < 1440; y++) busy[y] = 0;
    expect(findCut(busy, 1600, height)).toBe(1439);
    // Plain lines: the gap row closest to the target.
    expect(busy[findCut(busy, 2600, height)]).toBe(2);
    expect(Math.abs(findCut(busy, 2600, height) - 2600)).toBeLessThanOrEqual(10);
    const bands = sliceBands(height, busy);
    expect(bands[0]).toEqual({ top: 0, height: 1439 });
    expect(bands[1].top).toBe(1439 - 80);
  });

  it('draws a big screenshot at long side 2400 px as JPEG 0.85 when the group is too heavy', async () => {
    expect(scaledSize(3200, 1800)).toEqual({ width: 2400, height: 1350 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(planPieces({ width: 3200, height: 1800, bytes: 5 * MB })).toEqual([{ kind: 'scale' }]);
    expect(planPieces({ width: 4000, height: 2500, bytes: MB })).toEqual([{ kind: 'scale' }]);
    const result = await compressTogether([1, 2, 3].map(() => shot(3200, 1800, 5 * MB)), fake(800_000));
    expect(result).toMatchObject({ fits: true, quality: 0.85, compressed: true });
    expect(result.groups.flat().every(image => image.dataUrl.startsWith('data:image/jpeg'))).toBe(true);
  });

  it('steps the quality down together only while the request is too heavy, then reports it cannot fit', async () => {
    expect(QUALITY_STEPS).toEqual([0.85, 0.75, 0.65]);
    const six = [1, 2, 3, 4, 5, 6].map(() => shot(3200, 1800, 5 * MB));
    const lower = await compressTogether(six, fake(1_500_000), { budget: 8 * MB });
    expect(lower.fits).toBe(true);
    expect(lower.quality).toBeLessThan(0.85);
    const tooHeavy = await compressTogether(six, fake(3_000_000), { fits: withinBudget(8 * MB) });
    expect(tooHeavy).toMatchObject({ fits: false, quality: 0.65 });
  });
});
