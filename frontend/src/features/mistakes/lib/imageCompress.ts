import { generateUUID } from '@/shared/domain/uuid';
import { dataUrlBytes, MAX_REQUEST_BYTES } from './captureBatch';
import type { PreparedImage } from './imageInput';

/**
 * Screenshots are compressed on the device before reading: long side about 2000 px as JPEG 0.82 keeps small print
 * readable. When a capture's images do not fit one request together, every image steps down the ladder at once —
 * images of one capture are never sent apart just for size while a smaller step still fits.
 */
export interface CompressionStep { maxSide: number; quality: number }
export const COMPRESSION_STEPS: readonly CompressionStep[] = [
  { maxSide: 2000, quality: 0.82 }, { maxSide: 1800, quality: 0.76 }, { maxSide: 1600, quality: 0.7 },
  { maxSide: 1400, quality: 0.64 }, { maxSide: 1200, quality: 0.58 }
];
/** The backend's limit for one image. */
export const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** The size an image is drawn at: never enlarged, long side at most `maxSide`. */
export function scaledSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type Encoder<T> = (source: T, step: CompressionStep) => Promise<PreparedImage>;

/**
 * Encodes every source at the first ladder step where the whole set fits `budget` and each image fits the per-image
 * limit. `fits` is false when even the last step is too large; the caller then splits the capture and says so.
 */
export async function compressTogether<T>(sources: readonly T[], encode: Encoder<T>, budget = MAX_REQUEST_BYTES,
  steps: readonly CompressionStep[] = COMPRESSION_STEPS): Promise<{ images: PreparedImage[]; step: CompressionStep; fits: boolean }> {
  let images: PreparedImage[] = [];
  for (const step of steps) {
    images = [];
    for (const source of sources) images.push(await encode(source, step));
    const sizes = images.map(image => dataUrlBytes(image.dataUrl));
    if (sizes.every(size => size <= MAX_IMAGE_BYTES) && sizes.reduce((sum, size) => sum + size, 0) <= budget) return { images, step, fits: true };
  }
  return { images, step: steps[steps.length - 1], fits: false };
}

/** A decoded screenshot, drawn again at each step without decoding the file twice. */
export interface DecodedImage { name: string; bitmap: ImageBitmap }

export async function decodeImage(file: File): Promise<DecodedImage> {
  if (!TYPES.includes(file.type)) throw new Error('Chỉ nhận ảnh PNG, JPG hoặc WebP.');
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error('Mỗi ảnh chọn tối đa 15 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Không đọc được ảnh. Chọn ảnh khác.'); }
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
    bitmap.close();
    throw new Error('Ảnh quá lớn. Cắt phần bài đọc/câu hỏi cần dùng.');
  }
  return { name: file.name || 'Ảnh đã dán', bitmap };
}

export const encodeDecoded: Encoder<DecodedImage> = async ({ name, bitmap }, step) => {
  const size = scaledSize(bitmap.width, bitmap.height, step.maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt chưa xử lý được ảnh.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return { id: generateUUID(), name, dataUrl: canvas.toDataURL('image/jpeg', step.quality) };
};

/** Decodes and compresses one capture's files together; the bitmaps are released afterwards. */
export async function compressFiles(files: readonly File[], budget = MAX_REQUEST_BYTES) {
  const decoded: DecodedImage[] = [];
  try {
    for (const file of files) decoded.push(await decodeImage(file));
    return await compressTogether(decoded, encodeDecoded, budget);
  } finally { decoded.forEach(image => image.bitmap.close()); }
}
