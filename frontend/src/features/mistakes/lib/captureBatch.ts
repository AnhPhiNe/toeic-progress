import type { ErrorCategory, MistakeEntry } from '@/shared/types';
import { normalizeQuestionList, partOfQuestion } from '@/shared/domain/questionNumbers';
import type { AIMistakeParseResult, PageItem } from '@/features/mistakes/services/aiMistakeExtractor';
import { optionLetter } from '@/features/mistakes/lib/userChoice';

/** One capture sends at most this many screenshots; the rest is sent in a later capture. */
export const MAX_CAPTURE_IMAGES = 10;
/** The page-reading API takes up to 6 question screenshots and 5 passage/transcript pages, 8 MiB in total, per request. */
export const IMAGES_PER_REQUEST = 6;
export const CONTEXT_PER_REQUEST = 5;
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
/** One reading returns at most this many wrong questions (backend MAX_PAGE_ITEMS). */
export const QUESTIONS_PER_REQUEST = 6;
/** The backend accepts this many requests per capture (one batch) and charges the first one only. */
export const MAX_CAPTURE_REQUESTS = 8;
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

/** Sorted, de-duplicated question numbers in groups of at most `size`. */
export function chunkQuestions(numbers: Iterable<number>, size = QUESTIONS_PER_REQUEST): number[][] {
  const sorted = normalizeQuestionList(numbers), groups: number[][] = [];
  for (let index = 0; index < sorted.length; index += size) groups.push(sorted.slice(index, index + size));
  return groups;
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
  const expectedOptions = draft.part === 2 ? 3 : 4;
  const hasChoice = Boolean(draft.userChoice) || draft.userChoiceState === 'BLANK';
  const hasAnswer = (draft.answerSource === 'PROVIDED' || draft.answerSource === 'AI_PROPOSED') && Boolean(optionLetter(draft.correctAnswer));
  return !hasChoice || !hasAnswer || draft.options.length !== expectedOptions ? 'unsure' : 'ok';
}

const completeness = (draft: AIMistakeParseResult) =>
  Number(!isUnreadable(draft)) * 4
  + Number(Boolean(draft.userChoice) || draft.userChoiceState === 'BLANK') * 2
  + Number((draft.answerSource === 'PROVIDED' || draft.answerSource === 'AI_PROPOSED') && Boolean(optionLetter(draft.correctAnswer)));

/** A repeated question number keeps the more complete reading; ties keep the first. Reading order is by question number. */
export function mergeItems(existing: readonly CaptureItem[], incoming: readonly PageItem[], ticket: string | null | undefined,
  newId: () => string, category = (draft: AIMistakeParseResult): ErrorCategory => draft.category): CaptureItem[] {
  const byNumber = new Map(existing.map(item => [item.number, item]));
  for (const read of incoming) {
    const part = partOfQuestion(read.number);
    if (!part) continue;
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
