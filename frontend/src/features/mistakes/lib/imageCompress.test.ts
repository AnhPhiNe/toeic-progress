import { describe, expect, it } from 'vitest';
import { compressTogether, COMPRESSION_STEPS, scaledSize, type CompressionStep } from './imageCompress';

/** A fake encoder whose output size follows the drawn area and the quality, like a JPEG of a screenshot. */
const fake = (bytesAtFirstStep: number) => async (source: { width: number; height: number }, step: CompressionStep) => {
  const size = scaledSize(source.width, source.height, step.maxSide);
  const bytes = Math.round(bytesAtFirstStep * (size.width * size.height) / (2000 * 1125) * (step.quality / 0.82));
  return { id: 'x', name: 'x', dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(bytes / 3) * 4) };
};
const shot = { width: 2560, height: 1440 };

describe('image compression', () => {
  it('scales the long side to about 2000 px and never enlarges', () => {
    expect(scaledSize(2560, 1440, 2000)).toEqual({ width: 2000, height: 1125 });
    expect(scaledSize(1170, 2532, 2000)).toEqual({ width: 924, height: 2000 });
    expect(scaledSize(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it('starts at 2000 px and JPEG 0.82', () => {
    expect(COMPRESSION_STEPS[0]).toEqual({ maxSide: 2000, quality: 0.82 });
  });
  it('keeps the first step when a capture already fits one request', async () => {
    const result = await compressTogether([shot, shot, shot], fake(400_000));
    expect(result).toMatchObject({ fits: true, step: { maxSide: 2000, quality: 0.82 } });
    expect(result.images).toHaveLength(3);
  });
  it('compresses every image harder together instead of splitting the capture', async () => {
    const result = await compressTogether([shot, shot, shot, shot], fake(700_000));
    expect(result.fits).toBe(true);
    expect(result.step.maxSide).toBeLessThan(2000);
    expect(result.images).toHaveLength(4);
  });
  it('reports that the capture cannot fit after the last step', async () => {
    const result = await compressTogether([shot, shot, shot, shot, shot, shot], fake(3_000_000));
    expect(result).toMatchObject({ fits: false, step: COMPRESSION_STEPS[COMPRESSION_STEPS.length - 1] });
  });
});
