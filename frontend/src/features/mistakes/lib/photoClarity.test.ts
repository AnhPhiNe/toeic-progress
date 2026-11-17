import { describe, expect, it } from 'vitest';
import { clarityMessage, judgeClarity, laplacianVariance, meanLuminance, readClarity, toGray, BLUR_THRESHOLD } from './photoClarity';

const checker = (size: number, cell: number, low = 0, high = 255) => {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? high : low, i = (y * size + x) * 4;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
  }
  return rgba;
};
const boxBlur = (rgba: Uint8ClampedArray, size: number, radius: number) => {
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    let sum = 0, n = 0;
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < size && yy < size) { sum += rgba[(yy * size + xx) * 4]; n += 1; }
    }
    const i = (y * size + x) * 4;
    out[i] = out[i + 1] = out[i + 2] = sum / n; out[i + 3] = 255;
  }
  return out;
};

describe('photoClarity', () => {
  it('converts RGBA to luma and averages it', () => {
    const gray = toGray([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(gray[0]).toBeCloseTo(255, 3);
    expect(gray[1]).toBe(0);
    expect(meanLuminance(gray)).toBeCloseTo(127.5, 3);
    expect(meanLuminance([])).toBe(0);
  });

  it('a flat picture has no edges', () => {
    expect(laplacianVariance(new Float32Array(100).fill(120), 10, 10)).toBe(0);
    expect(laplacianVariance(new Float32Array(4), 2, 2)).toBe(0);
  });

  it('a sharp page measures far higher than the same page blurred', () => {
    const sharp = checker(64, 2), blurred = boxBlur(sharp, 64, 6);
    const a = readClarity(sharp, 64, 64), b = readClarity(blurred, 64, 64);
    expect(a.sharpness).toBeGreaterThan(b.sharpness * 10);
    expect(judgeClarity(a).problem).toBeNull();
    expect(judgeClarity(b).problem).toBe('blur');
    expect(b.sharpness).toBeLessThan(BLUR_THRESHOLD);
  });

  it('flags a dark photo as dark first, even when it is also soft', () => {
    expect(judgeClarity(readClarity(checker(64, 2, 0, 90), 64, 64)).problem).toBe('dark');
    expect(judgeClarity({ sharpness: 1, brightness: 30 }).problem).toBe('dark');
    expect(judgeClarity({ sharpness: 1, brightness: 200 }).problem).toBe('blur');
  });

  it('words the hint for the photo number', () => {
    expect(clarityMessage(2, 'blur').head).toBe('Ảnh 2 hơi mờ.');
    expect(clarityMessage(3, 'dark').head).toBe('Ảnh 3 hơi tối.');
  });
});
