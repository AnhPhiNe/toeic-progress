import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { normalizeQuestionList, partOfQuestion } from '@/shared/domain/questionNumbers';
import type { AIMistakeParseResult, PageItem } from '@/features/mistakes/services/aiMistakeExtractor';
import { optionLetter } from '@/features/mistakes/lib/userChoice';

/** One capture sends at most this many screenshots; the rest is sent in a later capture. */
export const MAX_CAPTURE_IMAGES = 10;
/** The page-reading API takes 1 to 3 screenshots of at most 2 MiB in total per request. */
export const IMAGES_PER_REQUEST = 3;
export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
/** One reading returns at most this many wrong questions (backend MAX_PAGE_ITEMS). */
export const QUESTIONS_PER_REQUEST = 6;
/** The backend accepts this many requests per capture (one batch) and charges the first one only. */
export const MAX_CAPTURE_REQUESTS = 4;
/** Reading looks for these when the chosen test has no logged wrong-question list. */
export const DEFAULT_QUESTIONS: readonly number[] = Array.from({ length: 100 }, (_, index) => 101 + index);

/** Decoded size of a base64 data URL, the way the backend counts it. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return 0;
  const body = dataUrl.slice(comma + 1);
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(body.length * 3 / 4) - padding);
}

/** Groups of at most `maxCount` images whose decoded sizes together stay within `maxBytes`, in the given order. */
export function chunkImages<T extends { dataUrl: string }>(images: readonly T[], maxCount = IMAGES_PER_REQUEST, maxBytes = MAX_REQUEST_BYTES): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [], bytes = 0;
  for (const image of images) {
    const size = dataUrlBytes(image.dataUrl);
    if (current.length && (current.length >= maxCount || bytes + size > maxBytes)) { chunks.push(current); current = []; bytes = 0; }
    current.push(image); bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** Sorted, de-duplicated question numbers in groups of at most `size`. */
export function chunkQuestions(numbers: Iterable<number>, size = QUESTIONS_PER_REQUEST): number[][] {
  const sorted = normalizeQuestionList(numbers), groups: number[][] = [];
  for (let index = 0; index < sorted.length; index += size) groups.push(sorted.slice(index, index + size));
  return groups;
}

export interface PageRequestPlan<T> { images: T[]; questions: number[] }

/**
 * The requests that read a set of screenshots. Images go in chunks of 3 (and 2 MiB); the questions to look for go in
 * groups of 6 so one reading never has to return more than the backend allows. A capture is limited to
 * `MAX_CAPTURE_REQUESTS` requests: when every image chunk x question group would be too many, each image chunk looks
 * for all the questions instead, and images that would need a further request are returned as `unsent`.
 */
export function planRequests<T extends { dataUrl: string }>(images: readonly T[], questions: Iterable<number>,
  maxRequests = MAX_CAPTURE_REQUESTS): { requests: PageRequestPlan<T>[]; unsent: T[] } {
  const wanted = normalizeQuestionList(questions);
  const imageChunks = chunkImages(images), groups = chunkQuestions(wanted);
  if (!imageChunks.length || !wanted.length) return { requests: [], unsent: [...images] };
  const sent = imageChunks.slice(0, maxRequests), unsent = imageChunks.slice(maxRequests).flat();
  if (sent.length * groups.length <= maxRequests) {
    return { requests: sent.flatMap(chunk => groups.map(group => ({ images: chunk, questions: group }))), unsent };
  }
  return { requests: sent.map(chunk => ({ images: chunk, questions: wanted })), unsent };
}

/** A question read from a screenshot, waiting for the learner's review. */
export interface CaptureItem {
  id: string;
  number: number;
  part: MistakeEntry['part'];
  draft: AIMistakeParseResult;
  category: ErrorCategory;
  ticket?: string | null;
  /** Ticked rows are saved. */
  checked: boolean;
}

export type RowStatus = 'ok' | 'unsure' | 'unreadable';

/** Nothing usable was read: the row is shown unticked and the learner fixes it or drops it. */
export function isUnreadable(draft: AIMistakeParseResult): boolean {
  return !draft.question?.trim() || draft.options.length < 2;
}

export function rowStatus(item: Pick<CaptureItem, 'draft'>): RowStatus {
  const { draft } = item;
  if (isUnreadable(draft)) return 'unreadable';
  return !draft.userChoice || draft.answerSource !== 'PROVIDED' || !optionLetter(draft.correctAnswer) || draft.options.length !== 4 ? 'unsure' : 'ok';
}

const completeness = (draft: AIMistakeParseResult) =>
  Number(!isUnreadable(draft)) * 4 + Number(Boolean(draft.userChoice)) * 2 + Number(draft.answerSource === 'PROVIDED' && Boolean(optionLetter(draft.correctAnswer)));

/** A repeated question number keeps the more complete reading; ties keep the first. Reading order is by question number. */
export function mergeItems(existing: readonly CaptureItem[], incoming: readonly PageItem[], ticket: string | null | undefined,
  newId: () => string, category = (draft: AIMistakeParseResult): ErrorCategory => draft.category): CaptureItem[] {
  const byNumber = new Map(existing.map(item => [item.number, item]));
  for (const read of incoming) {
    const part = partOfQuestion(read.number);
    if (!part || part < 5) continue;
    const before = byNumber.get(read.number);
    if (before && completeness(before.draft) >= completeness(read.draft)) continue;
    const next: CaptureItem = { id: before?.id ?? newId(), number: read.number, part: part as MistakeEntry['part'], draft: read.draft,
      category: category(read.draft), ticket: ticket ?? null, checked: before?.checked ?? !isUnreadable(read.draft) };
    byNumber.set(read.number, next);
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

/** The questions a capture still looks for after some were found. */
export const remainingQuestions = (wanted: readonly number[], found: readonly CaptureItem[]) => {
  const seen = new Set(found.map(item => item.number));
  return wanted.filter(number => !seen.has(number));
};

/** A short reason line from what a reading carries ("Sai vì…"), or ''. */
export function whyLine(draft: AIMistakeParseResult): string {
  const text = draft.explanation?.quickTip || draft.userReason || '';
  return text.trim().replace(/\s+/g, ' ');
}

/** The question stem on one line for a review row. */
export function questionPreview(draft: AIMistakeParseResult, max = 90): string {
  const text = (draft.question ?? '').trim().replace(/\s+/g, ' ').replace(/_{2,}|—+\d*—+|-{2,}\d*-{2,}/g, '___');
  if (!text) return 'Không đọc rõ phương án';
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
