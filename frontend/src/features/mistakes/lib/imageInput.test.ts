import { describe, expect, it } from 'vitest';
import { CONTEXT_PER_REQUEST } from './captureBatch';
import { MAX_CONTEXT_IMAGES, MAX_RESULT_TOTAL_BYTES, RESULT_IMAGE_OPTIONS, prepareImage, readJpegExifOrientation } from './imageInput';

/** Build a minimal JPEG APP1 Exif header carrying an orientation tag (0x0112) in little or big endian. */
function jpegWithOrientation(orientation: number, littleEndian = true): ArrayBuffer {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);
  // SOI + APP1 marker + length (32 bytes)
  view.setUint16(0, 0xffd8, false);
  view.setUint16(2, 0xffe1, false);
  view.setUint16(4, 32, false);
  // "Exif\0\0"
  view.setUint32(6, 0x45786966, false);
  view.setUint16(10, 0x0000, false);
  // TIFF header starts at offset 12
  view.setUint16(12, littleEndian ? 0x4949 : 0x4d4d, false);
  view.setUint16(14, 0x002a, littleEndian);
  view.setUint32(16, 8, littleEndian); // IFD0 offset = 8 -> byte 20
  // IFD0 at offset 20: 1 entry
  view.setUint16(20, 1, littleEndian);
  view.setUint16(22, 0x0112, littleEndian); // Orientation tag
  view.setUint16(24, 3, littleEndian); // SHORT
  view.setUint32(26, 1, littleEndian); // count
  view.setUint16(30, orientation, littleEndian);
  return bytes.buffer;
}

describe('imageInput zero-destructive orientation & result caps', () => {
  it('reads EXIF orientation in both little-endian and big-endian JPEGs', () => {
    expect(readJpegExifOrientation(jpegWithOrientation(1, true))).toBe(1);
    expect(readJpegExifOrientation(jpegWithOrientation(6, true))).toBe(6);
    expect(readJpegExifOrientation(jpegWithOrientation(8, false))).toBe(8);
  });

  it('defaults to orientation 1 for non-JPEG, truncated, or EXIF-less buffers', () => {
    expect(readJpegExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).buffer)).toBe(1);
    expect(readJpegExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBe(1);
    expect(readJpegExifOrientation(new ArrayBuffer(0))).toBe(1);
  });

  it('keeps single-question context cap (3), read-page context cap (5), and sharp result caps aligned with backend', () => {
    expect(MAX_CONTEXT_IMAGES).toBe(3);
    expect(CONTEXT_PER_REQUEST).toBe(5);
    expect(MAX_RESULT_TOTAL_BYTES).toBe(6 * 1024 * 1024);
    expect(RESULT_IMAGE_OPTIONS.maxSide).toBe(2400);
    expect(RESULT_IMAGE_OPTIONS.maxBytes).toBeGreaterThanOrEqual(2 * 1024 * 1024);
  });

  it('rejects SVG, GIF, non-images, and files over 20 MB before decoding', async () => {
    await expect(prepareImage(new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' }))).rejects.toThrow('PNG, JPG hoặc WebP');
    await expect(prepareImage(new File(['GIF89a'], 'anim.gif', { type: 'image/gif' }))).rejects.toThrow('PNG, JPG hoặc WebP');
    await expect(prepareImage(new File(['hello'], 'note.txt', { type: 'text/plain' }))).rejects.toThrow('PNG, JPG hoặc WebP');
    const huge = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' });
    await expect(prepareImage(huge)).rejects.toThrow('tối đa 20 MB');
  });
});
