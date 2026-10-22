import { generateUUID } from '@/shared/domain/uuid';

export const MAX_CONTEXT_IMAGES = 3;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_PREPARED_BYTES = 600 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface PreparedImage { id: string; name: string; dataUrl: string }

/** Decode/re-encode locally, preserving readable text within the existing API body limit. */
/** Result pages are read for numbers and marks only, so they are sent smaller and several fit in one request. */
export const RESULT_IMAGE_OPTIONS = { maxSide: 1600, maxBytes: 300 * 1024 };
export const MAX_RESULT_IMAGES = 8;

export async function prepareImage(file: File, { maxSide = 2048, maxBytes = MAX_PREPARED_BYTES } = {}): Promise<PreparedImage> {
  if (!TYPES.includes(file.type)) throw new Error('Chỉ nhận ảnh PNG, JPG hoặc WebP.');
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error('Mỗi ảnh chọn tối đa 5 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Không đọc được ảnh. Chọn ảnh khác.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 20_000_000) throw new Error('Ảnh quá lớn. Cắt phần bài đọc/câu hỏi cần dùng.');
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt chưa xử lý được ảnh.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4) <= maxBytes) {
        return { id: generateUUID(), name: file.name || 'Ảnh đã dán', dataUrl };
      }
    }
    throw new Error('Ảnh còn quá nặng. Cắt phần cần dùng để chữ rõ hơn.');
  } finally { bitmap.close(); }
}
