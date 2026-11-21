import { generateUUID } from '@/shared/domain/uuid';
import { dataUrlBytes } from './captureBatch';
import { decodeUprightBitmap, fileExifOrientation, type PreparedImage } from './imageInput';

/**
 * Screenshots and paper photos go to the reader as they are (zero destructive filters):
 * - upright originals <= 4 MiB & <= 8 MP stay completely untouched;
 * - EXIF-rotated phone photos are transposed upright at JPEG 0.92 with zero color/contrast changes;
 * - only when a group exceeds the request limit are images sliced at blank bands or gently scaled.
 */
export const PAGE_IMAGE_BYTES = 4 * 1024 * 1024;
export const PAGE_IMAGE_PIXELS = 8_000_000;
export const MAX_SIDE = 2400;
export const TALL_RATIO = 2.2;
export const SLICE_HEIGHT = 1600;
export const SLICE_OVERLAP = 80;
export const CUT_SEARCH = 200;
export const QUALITY_STEPS = [0.85, 0.75, 0.65] as const;
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export interface SourceMeta { width: number; height: number; bytes: number; type?: string; orientation?: number }
/** One image to send: the file as it is, the whole picture redrawn, or a horizontal band of it. */
export type Piece = { kind: 'keep' } | { kind: 'scale' } | { kind: 'slice'; top: number; height: number };

/** The size an image is drawn at: never enlarged, long side at most `maxSide`. */
export function scaledSize(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const isTall = (meta: SourceMeta) => meta.height / Math.max(1, meta.width) > TALL_RATIO;
/** The reader takes this file unchanged. */
export const sendableAsIs = (meta: SourceMeta) => meta.bytes <= PAGE_IMAGE_BYTES && meta.width * meta.height <= PAGE_IMAGE_PIXELS
  && (!meta.type || TYPES.includes(meta.type));

/**
 * Where to cut near `target`: the quietest row (lowest "busy" score: blank space between lines, tables or figures)
 * within ±`range` px, the closest one on a tie.
 */
export function findCut(busy: ArrayLike<number> | undefined, target: number, height: number, range = CUT_SEARCH): number {
  const clamp = (value: number) => Math.max(1, Math.min(height - 1, value));
  if (!busy || !busy.length) return clamp(target);
  let best = clamp(target), bestScore = Infinity;
  for (let offset = 0; offset <= range; offset++) {
    for (const row of offset ? [target - offset, target + offset] : [target]) {
      if (row < 1 || row >= height || row >= busy.length) continue;
      if (busy[row] < bestScore - 1e-9) { best = row; bestScore = busy[row]; }
    }
  }
  return best;
}

/**
 * Bands of about `SLICE_HEIGHT` px (source pixels) covering the whole height. Each cut sits on a quiet row near the
 * target when `busy` (one score per row) is known; the next band starts `SLICE_OVERLAP` px above the cut.
 */
export function sliceBands(height: number, busy?: ArrayLike<number>): { top: number; height: number }[] {
  if (height <= SLICE_HEIGHT) return [{ top: 0, height }];
  const bands: { top: number; height: number }[] = [];
  let top = 0;
  while (top + SLICE_HEIGHT < height) {
    const cut = Math.max(top + SLICE_OVERLAP * 2, findCut(busy, top + SLICE_HEIGHT, height));
    bands.push({ top, height: cut - top });
    top = cut - SLICE_OVERLAP;
  }
  bands.push({ top, height: height - top });
  return bands;
}

/** What an image becomes: as it is, or (when the group is too heavy) sliced if very tall, else redrawn smaller. */
export function planPieces(meta: SourceMeta, { original = true, slice = true, busy }: { original?: boolean; slice?: boolean; busy?: ArrayLike<number> } = {}): Piece[] {
  if (original && sendableAsIs(meta)) return [{ kind: 'keep' }];
  if (slice && isTall(meta)) return sliceBands(meta.height, busy).map(band => ({ kind: 'slice' as const, ...band }));
  return [{ kind: 'scale' }];
}

/** Which tall images may be sliced so a zone stays within `maxImages`: the tallest is shrunk instead first. */
export function sliceAllowance(metas: readonly SourceMeta[], maxImages: number): boolean[] {
  const allow = metas.map(isTall);
  const count = () => metas.reduce((sum, meta, index) => sum + planPieces(meta, { original: false, slice: allow[index] }).length, 0);
  while (count() > maxImages) {
    let worst = -1;
    metas.forEach((meta, index) => { if (allow[index] && (worst < 0 || meta.height > metas[worst].height)) worst = index; });
    if (worst < 0) break;
    allow[worst] = false;
  }
  return allow;
}

export type Encoder<T> = (source: T, piece: Piece, quality: number) => Promise<PreparedImage>;
export interface Source { meta: SourceMeta; busy?: ArrayLike<number> }
export type FitCheck = (groups: PreparedImage[][]) => boolean;
export const withinBudget = (budget: number): FitCheck => groups => {
  const sizes = groups.flat().map(image => dataUrlBytes(image.dataUrl));
  return sizes.every(size => size <= PAGE_IMAGE_BYTES) && sizes.reduce((sum, size) => sum + size, 0) <= budget;
};

/**
 * The sources as they are when `fits` accepts them; otherwise prepared (sliced or redrawn) at the first quality step
 * that fits. `compressed`: the learner is told the images were made smaller. `fits` false: even the last step is
 * too heavy, the caller splits the group and says so.
 */
export async function compressTogether<T extends Source>(sources: readonly T[], encode: Encoder<T>,
  { budget = 8 * 1024 * 1024, slices, fits = withinBudget(budget) }: { budget?: number; slices?: readonly boolean[]; fits?: FitCheck } = {})
  : Promise<{ groups: PreparedImage[][]; quality: number | null; fits: boolean; compressed: boolean }> {
  const run = async (original: boolean, quality: number) => {
    const groups: PreparedImage[][] = [];
    for (const [index, source] of sources.entries()) {
      const pieces = planPieces(source.meta, { original, slice: slices?.[index] ?? true, busy: source.busy });
      const group: PreparedImage[] = [];
      for (const piece of pieces) group.push(await encode(source, piece, quality));
      groups.push(group);
    }
    return groups;
  };
  if (sources.every(source => sendableAsIs(source.meta))) {
    const groups = await run(true, QUALITY_STEPS[0]);
    if (fits(groups)) return { groups, quality: null, fits: true, compressed: false };
  }
  let groups: PreparedImage[][] = [];
  for (const quality of QUALITY_STEPS) {
    groups = await run(false, quality);
    if (fits(groups)) return { groups, quality, fits: true, compressed: true };
  }
  return { groups, quality: QUALITY_STEPS[QUALITY_STEPS.length - 1], fits: false, compressed: true };
}

/** A decoded screenshot, drawn again at each step without decoding the file twice. */
export interface DecodedImage extends Source { name: string; file: File; bitmap: ImageBitmap }

/** How busy each row is (spread of brightness across it): text, tables and figures score high, blank bands near 0. */
function rowBusyness(bitmap: ImageBitmap): Float32Array | undefined {
  const width = Math.min(240, bitmap.width), height = bitmap.height;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(bitmap, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const busy = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0, square = 0;
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4, light = 0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2];
      sum += light; square += light * light;
    }
    const mean = sum / width;
    busy[y] = Math.sqrt(Math.max(0, square / width - mean * mean));
  }
  return busy;
}

export async function decodeImage(file: File): Promise<DecodedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Chỉ nhận tệp ảnh hợp lệ (PNG, JPG, WebP...).');
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error('Mỗi ảnh chọn tối đa 30 MB.');
  const orientation = await fileExifOrientation(file);
  let bitmap: ImageBitmap;
  try { bitmap = await decodeUprightBitmap(file); } catch { throw new Error('Không đọc được ảnh. Chọn ảnh khác.'); }
  if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
    bitmap.close();
    throw new Error('Ảnh quá lớn. Cắt phần bài đọc/câu hỏi cần dùng.');
  }
  const meta: SourceMeta = { width: bitmap.width, height: bitmap.height, bytes: file.size, type: file.type, orientation };
  return { name: file.name || 'Ảnh đã dán', file, bitmap, meta, busy: isTall(meta) ? rowBusyness(bitmap) : undefined };
}

const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Không đọc được ảnh. Chọn ảnh khác.'));
  reader.readAsDataURL(file);
});

export const encodeDecoded: Encoder<DecodedImage> = async ({ name, file, bitmap, meta }, piece, quality) => {
  if (piece.kind === 'keep') {
    // Keep upright original bytes untouched; only redraw at JPEG 0.92 when EXIF orientation != 1.
    if ((meta.orientation ?? 1) === 1) return { id: generateUUID(), name, dataUrl: await readDataUrl(file) };
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt chưa xử lý được ảnh.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { id: generateUUID(), name, dataUrl: canvas.toDataURL('image/jpeg', 0.92) };
  }
  const band = piece.kind === 'slice' ? piece : { top: 0, height: bitmap.height };
  const size = scaledSize(bitmap.width, band.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt chưa xử lý được ảnh.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, band.top, bitmap.width, band.height, 0, 0, size.width, size.height);
  return { id: generateUUID(), name, dataUrl: canvas.toDataURL('image/jpeg', quality) };
};

/** Decodes files; the caller releases them with `releaseImages`. */
export async function decodeFiles(files: readonly File[]): Promise<DecodedImage[]> {
  const decoded: DecodedImage[] = [];
  try { for (const file of files) decoded.push(await decodeImage(file)); }
  catch (error) { releaseImages(decoded); throw error; }
  return decoded;
}
export const releaseImages = (images: readonly DecodedImage[]) => images.forEach(image => image.bitmap.close());
