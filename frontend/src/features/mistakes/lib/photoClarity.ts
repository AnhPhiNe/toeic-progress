/**
 * On-device check of a photo of a result page, run before anything is sent: no AI use, nothing leaves the phone.
 * Blur is the variance of a Laplacian over a small greyscale copy; darkness is its mean luminance.
 */
export interface ClarityReading { sharpness: number; brightness: number }
export type ClarityProblem = 'blur' | 'dark';
export interface ClarityResult extends ClarityReading { problem: ClarityProblem | null }

/** Below this the text edges are smeared (tuned on 640px copies of photographed text pages). */
export const BLUR_THRESHOLD = 90;
/** Below this mean luminance (0-255) the page is too dark to read reliably. */
export const DARK_THRESHOLD = 85;
/** Long side of the copy that is measured. */
export const CLARITY_SIDE = 640;

/** Rec. 601 luma of every pixel of RGBA data. */
export function toGray(rgba: ArrayLike<number>): Float32Array {
  const gray = new Float32Array(Math.floor(rgba.length / 4));
  for (let i = 0; i < gray.length; i += 1) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return gray;
}

export function meanLuminance(gray: ArrayLike<number>): number {
  if (!gray.length) return 0;
  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) sum += gray[i];
  return sum / gray.length;
}

/** Variance of the 4-neighbour Laplacian over the interior pixels. A sharp page has strong edges, so a high variance. */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3 || gray.length < width * height) return 0;
  let sum = 0, sumSquares = 0, count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += value; sumSquares += value * value; count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

export function readClarity(rgba: ArrayLike<number>, width: number, height: number): ClarityReading {
  const gray = toGray(rgba);
  return { sharpness: laplacianVariance(gray, width, height), brightness: meanLuminance(gray) };
}

/** Darkness is named first: a dark photo also measures as soft, and a brighter spot is the useful hint. */
export function judgeClarity(reading: ClarityReading): ClarityResult {
  const problem: ClarityProblem | null = reading.brightness < DARK_THRESHOLD ? 'dark' : reading.sharpness < BLUR_THRESHOLD ? 'blur' : null;
  return { ...reading, problem };
}

/** The line shown under the thumbnails for photo number `position` (1-based). */
export function clarityMessage(position: number, problem: ClarityProblem): { head: string; rest: string } {
  return { head: `Ảnh ${position} ${problem === 'dark' ? 'hơi tối.' : 'hơi mờ.'}`, rest: ' Sóc có thể đọc sót câu.' };
}

/** Measures a photo (data URL) on a downscaled canvas; null when the browser cannot decode it, which never blocks sending. */
export async function checkPhotoClarity(dataUrl: string): Promise<ClarityResult | null> {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const scale = Math.min(1, CLARITY_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(3, Math.round(image.naturalWidth * scale)), height = Math.max(3, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    return judgeClarity(readClarity(context.getImageData(0, 0, width, height).data, width, height));
  } catch { return null; }
}
