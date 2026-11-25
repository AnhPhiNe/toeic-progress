import type { PreparedImage } from './imageInput';
import { CONTEXT_PER_REQUEST, dataUrlBytes, IMAGES_PER_REQUEST, MAX_CAPTURE_REQUESTS, MAX_REQUEST_BYTES } from './captureBatch';
import { compressTogether, decodeFiles, encodeDecoded, PAGE_IMAGE_BYTES, releaseImages, sliceAllowance } from './imageCompress';
import { planGroupRequests, planSingleRequests, type RequestPlan } from './wrongDetail';

export type PreparedPlan = RequestPlan<PreparedImage> & { compressed: boolean };
const requestFits = (plan: RequestPlan<PreparedImage>) => !plan.error && plan.requests.every(request => {
  const sizes = [...request.contextImages, ...request.images].map(image => dataUrlBytes(image.dataUrl));
  return sizes.every(size => size <= PAGE_IMAGE_BYTES) && sizes.reduce((sum, size) => sum + size, 0) <= MAX_REQUEST_BYTES;
});

/** Part 5 (or flat ordered tray): screenshots packed cleanly within `maxRequests`. */
export async function prepareSingles(files: readonly File[], wanted: number[], maxRequests = MAX_CAPTURE_REQUESTS,
  parallelPackSize = 3): Promise<PreparedPlan> {
  const decoded = await decodeFiles(files);
  try {
    const plan = (groups: PreparedImage[][]) => planSingleRequests(groups, wanted, { maxRequests, parallelPackSize });
    const slices = files.length < IMAGES_PER_REQUEST ? sliceAllowance(decoded.map(image => image.meta), IMAGES_PER_REQUEST) : decoded.map(() => false);
    const result = await compressTogether(decoded, encodeDecoded, { slices, fits: groups => { const value = plan(groups); return !value.split && requestFits(value); } });
    return { ...plan(result.groups), compressed: result.compressed };
  } finally { releaseImages(decoded); }
}

/**
 * Part 6–7: the passage and question screenshots of one group in one request, as they are unless too heavy; then
 * prepared together (tall pages sliced while each zone stays within its images) until they fit.
 */
export async function prepareGroup(passage: readonly File[], questions: readonly File[], wanted: number[], contextSupported: boolean,
  maxRequests = MAX_CAPTURE_REQUESTS): Promise<PreparedPlan> {
  const decoded = await decodeFiles([...passage, ...questions]);
  try {
    const metas = decoded.map(image => image.meta), cut = passage.length;
    const slices = [...sliceAllowance(metas.slice(0, cut), CONTEXT_PER_REQUEST),
      ...(questions.length <= IMAGES_PER_REQUEST ? sliceAllowance(metas.slice(cut), IMAGES_PER_REQUEST) : metas.slice(cut).map(() => false))];
    const plan = (groups: PreparedImage[][]) => planGroupRequests(groups.slice(0, cut), groups.slice(cut), wanted, { contextSupported, maxRequests });
    const result = await compressTogether(decoded, encodeDecoded, { slices, fits: groups => { const value = plan(groups); return !value.split && requestFits(value); } });
    return { ...plan(result.groups), compressed: result.compressed };
  } finally { releaseImages(decoded); }
}

/**
 * Attempt-wide 1-tray capture: keeps images ordered equally without forcing PASSAGE_IMAGES labels across unrelated
 * clusters, keeping Part 5 and Part 6–7 clean within `maxRequests`.
 */
export async function prepareAttempt(files: readonly File[], wanted: number[], maxRequests = MAX_CAPTURE_REQUESTS): Promise<PreparedPlan> {
  const part5 = wanted.filter(number => number < 131);
  const grouped = wanted.filter(number => number >= 131);
  if (!grouped.length || !part5.length || files.length <= IMAGES_PER_REQUEST) {
    return prepareSingles(files, wanted, maxRequests, IMAGES_PER_REQUEST);
  }
  const singleBudget = Math.max(1, Math.min(2, maxRequests - 1));
  const singlePlan = await prepareSingles(files, part5, singleBudget, IMAGES_PER_REQUEST);
  if (singlePlan.error) return singlePlan;
  const groupedBudget = maxRequests - singlePlan.requests.length;
  if (groupedBudget < 1) {
    return { requests: [], split: false, compressed: false, error: `Khay trộn Part có nhiều ảnh (${files.length}). Hãy chọn lọc P5 hoặc P6/P7 để Sóc đọc trọn vẹn.` };
  }
  const groupedPlan = await prepareSingles(files, grouped, groupedBudget, IMAGES_PER_REQUEST);
  if (groupedPlan.error) return groupedPlan;
  return {
    requests: [...singlePlan.requests, ...groupedPlan.requests],
    split: singlePlan.split || groupedPlan.split,
    compressed: singlePlan.compressed || groupedPlan.compressed,
  };
}
