import { generateUUID } from '@/shared/domain/uuid';

/** Passage images one single-card analysis sends (backend MAX_ANALYZE_IMAGES). */
export const MAX_CONTEXT_IMAGES = 4;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_PIXELS = 60_000_000;
const MAX_PREPARED_BYTES = 600 * 1024;
const PASS_THROUGH_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const REJECTED_IMAGE_TYPES = new Set(['image/svg+xml', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']);

export interface PreparedImage { id: string; name: string; dataUrl: string }

/**
 * Sharp paper answer sheets & result pages: keep original crispness up to 2.5 MiB/image
 * within the 6 MiB backend total cap instead of crushing to 300 KB.
 */
export const MAX_RESULT_TOTAL_BYTES = 6 * 1024 * 1024;
export const RESULT_IMAGE_OPTIONS = { maxSide: 2400, maxBytes: 2.5 * 1024 * 1024 };
export const MAX_RESULT_IMAGES = 8;

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Không đọc được ảnh. Chọn ảnh khác.'));
  reader.readAsDataURL(file);
});

const encodedBytes = (dataUrl: string) => {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(body.length * 3 / 4) - pad);
};

/** Read JPEG EXIF orientation tag (0x0112) from file bytes without decoding pixels. Returns 1..8 (1 = upright). */
export function readJpegExifOrientation(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  if (view.byteLength < 12 || view.getUint16(0, false) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffda || marker === 0xffd9) break;
    if (marker < 0xff00) break;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > view.byteLength) break;
    if (marker === 0xffe1 && length >= 14 && view.getUint32(offset + 2, false) === 0x45786966 && view.getUint16(offset + 6, false) === 0x0000) {
      const tiff = offset + 8;
      const little = view.getUint16(tiff, false) === 0x4949;
      if (!little && view.getUint16(tiff, false) !== 0x4d4d) return 1;
      const ifdOffset = view.getUint32(tiff + 4, little);
      const dirStart = tiff + ifdOffset;
      if (dirStart + 2 > view.byteLength) return 1;
      const entries = view.getUint16(dirStart, little);
      for (let i = 0; i < entries; i++) {
        const entry = dirStart + 2 + i * 12;
        if (entry + 12 > view.byteLength) break;
        if (view.getUint16(entry, little) === 0x0112) {
          const orientation = view.getUint16(entry + 8, little);
          return orientation >= 1 && orientation <= 8 ? orientation : 1;
        }
      }
      return 1;
    }
    offset += length;
  }
  return 1;
}

export async function fileExifOrientation(file: File): Promise<number> {
  if (file.type !== 'image/jpeg') return 1;
  try {
    const head = file.slice(0, 128 * 1024);
    const buffer = typeof head.arrayBuffer === 'function' ? await head.arrayBuffer() : null;
    return buffer ? readJpegExifOrientation(buffer) : 1;
  } catch {
    return 1;
  }
}

export async function decodeUprightBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

export async function prepareImage(file: File, { maxSide = 2048, maxBytes = MAX_PREPARED_BYTES, preserveOriginal = false } = {}): Promise<PreparedImage> {
  if (!file.type.startsWith('image/') || REJECTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Chỉ nhận ảnh PNG, JPG hoặc WebP.');
  }
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error('Mỗi ảnh chọn tối đa 20 MB.');
  const orientation = await fileExifOrientation(file);
  let bitmap: ImageBitmap;
  try { bitmap = await decodeUprightBitmap(file); } catch { throw new Error('Không đọc được ảnh. Chọn ảnh khác.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_UPLOAD_PIXELS) {
      throw new Error('Ảnh quá lớn. Cắt phần bài đọc/câu hỏi cần dùng.');
    }
    // Zero-destructive pass-through: keep upright original untouched when within byte & pixel budget.
    if (
      preserveOriginal
      && orientation === 1
      && PASS_THROUGH_TYPES.includes(file.type)
      && file.size <= maxBytes
      && bitmap.width * bitmap.height <= 8_000_000
    ) {
      return { id: generateUUID(), name: file.name || 'Ảnh đã dán', dataUrl: await readAsDataUrl(file) };
    }
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt chưa xử lý được ảnh.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.92, 0.85, 0.78, 0.68]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (encodedBytes(dataUrl) <= maxBytes) {
        return { id: generateUUID(), name: file.name || 'Ảnh đã dán', dataUrl };
      }
    }
    throw new Error('Ảnh còn quá nặng. Cắt phần cần dùng để chữ rõ hơn.');
  } finally { bitmap.close(); }
}

/**
 * Prepare 1–8 result sheet images within the 6 MiB backend total budget.
 * Keeps crisp originals upright when they fit; only steps down gently when multiple heavy photos exceed 6 MiB.
 */
export async function prepareResultImages(files: readonly File[], totalBudget = MAX_RESULT_TOTAL_BYTES): Promise<PreparedImage[]> {
  if (!files.length) return [];
  const perImageBudget = Math.min(4 * 1024 * 1024, Math.max(600 * 1024, Math.floor(totalBudget / files.length)));
  const firstPass: PreparedImage[] = [];
  for (const file of files) {
    firstPass.push(await prepareImage(file, { maxSide: RESULT_IMAGE_OPTIONS.maxSide, maxBytes: Math.min(RESULT_IMAGE_OPTIONS.maxBytes, perImageBudget), preserveOriginal: true }));
  }
  const total = firstPass.reduce((sum, item) => sum + encodedBytes(item.dataUrl), 0);
  if (total <= totalBudget) return firstPass;
  const tightBudget = Math.max(250 * 1024, Math.floor((totalBudget * 0.92) / files.length));
  const scaled: PreparedImage[] = [];
  for (const file of files) {
    scaled.push(await prepareImage(file, { maxSide: 2048, maxBytes: tightBudget, preserveOriginal: false }));
  }
  return scaled;
}
