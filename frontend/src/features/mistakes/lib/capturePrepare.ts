import type { PreparedImage } from './imageInput';
import { CONTEXT_PER_REQUEST, dataUrlBytes, IMAGES_PER_REQUEST, MAX_CAPTURE_REQUESTS, MAX_REQUEST_BYTES } from './captureBatch';
import { compressTogether, decodeFiles, encodeDecoded, PAGE_IMAGE_BYTES, releaseImages, sliceAllowance } from './imageCompress';
import { planGroupRequests, planSingleRequests, type RequestPlan } from './wrongDetail';

export type PreparedPlan = RequestPlan<PreparedImage> & { compressed: boolean };
const requestFits = (plan: RequestPlan<PreparedImage>) => !plan.error && plan.requests.every(request => {
  const sizes = [...request.contextImages, ...request.images].map(image => dataUrlBytes(image.dataUrl));
  return sizes.every(size => size <= PAGE_IMAGE_BYTES) && sizes.reduce((sum, size) => sum + size, 0) <= MAX_REQUEST_BYTES;
});

/** Part 5: the screenshots together, as they are unless the request would be too heavy. */
export async function prepareSingles(files: readonly File[], wanted: number[], maxRequests = MAX_CAPTURE_REQUESTS): Promise<PreparedPlan> {
  const decoded = await decodeFiles(files);
  try {
    const plan = (groups: PreparedImage[][]) => planSingleRequests(groups, wanted, { maxRequests });
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
