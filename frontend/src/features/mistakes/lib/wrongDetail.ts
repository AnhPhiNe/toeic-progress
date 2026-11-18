import type { MistakeEntry, StudySession } from '@/shared/types';
import { normalizeQuestionList, partOfQuestion, type PartNumber } from '@/shared/domain/questionNumbers';
import { createDraftMistake, DETAIL_FIRST_PART, isBlankDraft } from './mistakeDrafts';
import { chunkQuestions, dataUrlBytes, MAX_CAPTURE_REQUESTS, MAX_REQUEST_BYTES, QUESTIONS_PER_REQUEST } from './captureBatch';

/**
 * "Gỡ câu sai" (design/previews/mock-wrong-detail.html): a logged test's wrong questions worked through Part by Part.
 * Everything here is pure so the screens only render it.
 */

export const PART_NAMES: Record<PartNumber, string> = { 1: 'Tranh', 2: 'Hỏi – đáp', 3: 'Hội thoại', 4: 'Bài nói', 5: 'Điền câu', 6: 'Điền đoạn văn', 7: 'Đọc hiểu' };

/** Part 1–2 have no printed question: only the reason is asked. Part 3–4 read a transcript; Part 5–7 the review page. */
export type PartMode = 'reason' | 'transcript' | 'page';
export const partMode = (part: number): PartMode => part <= 2 ? 'reason' : part <= 4 ? 'transcript' : 'page';
export const PART_ACTION: Record<PartMode, string> = { reason: 'Chọn lý do', transcript: 'Chụp transcript', page: 'Chụp trang chữa bài' };

/** Part 6 sets are always four questions; Part 7 follows the official layout (single, double, then triple passages). */
export const P6_GROUPS: ReadonlyArray<readonly [number, number]> = [[131, 134], [135, 138], [139, 142], [143, 146]];
export const P7_GROUPS: ReadonlyArray<readonly [number, number]> = [[147, 148], [149, 150], [151, 152], [153, 154], [155, 157], [158, 160],
  [161, 163], [164, 167], [168, 171], [172, 175], [176, 180], [181, 185], [186, 190], [191, 195], [196, 200]];

export interface PassageGroup { from: number; to: number; kind: string; passages: number; wrong: number[] }
const passageCount = (from: number) => from >= 186 ? 3 : from >= 176 ? 2 : 1;
const kindOf = (part: number, from: number) => part === 6 ? 'Đoạn văn' : ['Đoạn đơn', 'Đoạn kép', 'Đoạn ba'][passageCount(from) - 1];

/** The passage groups of Part 6 or 7 that hold at least one wrong question, in test order. */
export function suggestGroups(part: 6 | 7, wrong: Iterable<number>): PassageGroup[] {
  const numbers = normalizeQuestionList(wrong);
  return (part === 6 ? P6_GROUPS : P7_GROUPS).map(([from, to]) => ({ from, to, kind: kindOf(part, from), passages: part === 6 ? 1 : passageCount(from),
    wrong: numbers.filter(number => number >= from && number <= to) })).filter(group => group.wrong.length > 0);
}
export const groupNumbers = (group: Pick<PassageGroup, 'from' | 'to'>) => Array.from({ length: group.to - group.from + 1 }, (_, index) => group.from + index);

/** A question counts as recorded once its card has any content; a number-only draft does not. */
export const isRecorded = (card: MistakeEntry | undefined) => Boolean(card && !card.deletedAt && !isBlankDraft(card));

/**
 * The test's wrong questions, one card each. Reading questions already have draft cards; a Listening question gets a
 * card (not stored until saved) with a stable timestamp, so a restored draft still matches it.
 */
export function flowCards(session: Pick<StudySession, 'id' | 'testName' | 'wrongQuestions' | 'createdAt'>, mistakes: MistakeEntry[]): { cards: MistakeEntry[]; unsaved: Set<string> } {
  const linked = mistakes.filter(card => !card.deletedAt && card.sessionId === session.id && card.questionNumber !== undefined);
  const byNumber = new Map(linked.map(card => [card.questionNumber!, card]));
  const unsaved = new Set<string>();
  for (const number of normalizeQuestionList(session.wrongQuestions ?? [])) {
    if (byNumber.has(number)) continue;
    const card = createDraftMistake(session, number, session.createdAt || '1970-01-01T00:00:00.000Z');
    byNumber.set(number, card); unsaved.add(card.id);
  }
  return { cards: [...byNumber.values()].sort((a, b) => a.questionNumber! - b.questionNumber!), unsaved };
}

export interface PartProgress { part: PartNumber; numbers: number[]; done: number }
/** Per Part: its wrong questions and how many are recorded. */
export function partProgress(cards: MistakeEntry[], unsaved: ReadonlySet<string> = new Set()): PartProgress[] {
  const parts = new Map<PartNumber, PartProgress>();
  for (const card of cards) {
    const part = partOfQuestion(card.questionNumber ?? 0);
    if (!part) continue;
    const entry = parts.get(part) ?? { part, numbers: [], done: 0 };
    entry.numbers.push(card.questionNumber!);
    if (!unsaved.has(card.id) && isRecorded(card)) entry.done += 1;
    parts.set(part, entry);
  }
  return [...parts.values()].sort((a, b) => a.part - b.part);
}

/** The Part to do first: the most questions still to record (ties: the later Part, where a capture saves most). */
export function heroPart(progress: PartProgress[]): PartProgress | null {
  return progress.filter(entry => entry.done < entry.numbers.length)
    .sort((a, b) => (b.numbers.length - b.done) - (a.numbers.length - a.done) || b.part - a.part)[0] ?? null;
}

export interface WaitingTest { sessionId: string; title: string; attempt: string; waiting: number; done: number; total: number }
/**
 * Sổ tay keeps number-only drafts out of its list and counts them per test here. `total`/`done` are the test's Reading
 * cards (drafts are Reading only) and how many already have content.
 */
export function waitingTests(mistakes: MistakeEntry[], titles: (sessionId: string, card: MistakeEntry) => { title: string; attempt: string }): WaitingTest[] {
  const bySession = new Map<string, WaitingTest>();
  for (const card of mistakes) {
    if (card.deletedAt || !card.sessionId || card.questionNumber === undefined || card.part < DETAIL_FIRST_PART) continue;
    const blank = isBlankDraft(card);
    const entry = bySession.get(card.sessionId) ?? { sessionId: card.sessionId, ...titles(card.sessionId, card), waiting: 0, done: 0, total: 0 };
    entry.total += 1;
    if (blank) entry.waiting += 1; else entry.done += 1;
    bySession.set(card.sessionId, entry);
  }
  return [...bySession.values()].filter(entry => entry.waiting > 0);
}

/** The reason seen most often among recorded cards, for the closing line; null when no reason was given. */
export function topReason(cards: MistakeEntry[]): { category: MistakeEntry['category']; count: number } | null {
  const counts = new Map<MistakeEntry['category'], number>();
  for (const card of cards) if (card.category !== 'OTHER') counts.set(card.category, (counts.get(card.category) ?? 0) + 1);
  const [category, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return category ? { category, count: count! } : null;
}

export interface ReadRequest<T> { contextImages: T[]; images: T[]; questions: number[] }
export interface RequestPlan<T> { requests: ReadRequest<T>[]; split: boolean; error?: string }
const bytesOf = (images: readonly { dataUrl: string }[]) => images.reduce((sum, image) => sum + dataUrlBytes(image.dataUrl), 0);

/**
 * One capture of single-question images (Part 3–5): every image is read on its own. When an image may show more
 * questions than one reading returns, the wanted numbers go in groups — as long as the capture stays within its requests.
 */
export function planSingleRequests<T extends { dataUrl: string }>(images: readonly T[], wanted: Iterable<number>, maxRequests = MAX_CAPTURE_REQUESTS): RequestPlan<T> {
  const numbers = normalizeQuestionList(wanted);
  if (!images.length || !numbers.length) return { requests: [], split: false };
  if (images.length > maxRequests) return { requests: [], split: false, error: `Mỗi lần gửi tối đa ${maxRequests} ảnh.` };
  const groups = chunkQuestions(numbers, QUESTIONS_PER_REQUEST);
  const perImage = images.length * groups.length <= maxRequests ? groups : [numbers];
  return { requests: images.flatMap(image => perImage.map(questions => ({ contextImages: [], images: [image], questions }))), split: false };
}

/**
 * One passage group (Part 6–7): the passage pages and the question pages go in ONE request so the passage is read with
 * its questions. More than three question pages share the same passage across requests. Only when the images cannot fit
 * one request even after compression are they sent apart (`split`), and the screen says so.
 */
export function planGroupRequests<T extends { dataUrl: string }>(context: readonly T[], questions: readonly T[], wanted: Iterable<number>,
  { maxImages = 3, maxContext = 3, maxBytes = MAX_REQUEST_BYTES, maxRequests = MAX_CAPTURE_REQUESTS, contextSupported = true } = {}): RequestPlan<T> {
  const numbers = normalizeQuestionList(wanted);
  if (!numbers.length || (!context.length && !questions.length)) return { requests: [], split: false };
  if (context.length > maxContext) return { requests: [], split: false, error: `Mỗi nhóm nhận tối đa ${maxContext} ảnh đoạn văn.` };
  // A question printed on the passage page: the passage images are the question images.
  if (!questions.length) return planGroupRequests([], context, numbers, { maxImages, maxContext, maxBytes, maxRequests, contextSupported });
  const together: ReadRequest<T>[] = [];
  for (let index = 0; index < questions.length; index += maxImages) {
    together.push({ contextImages: [...context], images: questions.slice(index, index + maxImages), questions: numbers });
  }
  const fits = (request: ReadRequest<T>) => contextSupported
    ? bytesOf([...request.contextImages, ...request.images]) <= maxBytes
    : request.contextImages.length + request.images.length <= maxImages && bytesOf([...request.contextImages, ...request.images]) <= maxBytes;
  if (together.length <= maxRequests && together.every(fits)) {
    return { requests: contextSupported ? together : together.map(request => ({ contextImages: [], images: [...request.contextImages, ...request.images], questions: numbers })), split: false };
  }
  // Last resort: every image in reading order, as many per request as fit.
  const all = [...context, ...questions], requests: ReadRequest<T>[] = [];
  let current: T[] = [];
  for (const image of all) {
    if (current.length && (current.length >= maxImages || bytesOf([...current, image]) > maxBytes)) { requests.push({ contextImages: [], images: current, questions: numbers }); current = []; }
    current.push(image);
  }
  if (current.length) requests.push({ contextImages: [], images: current, questions: numbers });
  if (requests.length > maxRequests) return { requests: [], split: true, error: 'Ảnh quá nhiều cho một lần gửi. Bớt ảnh hoặc cắt phần cần đọc.' };
  return { requests, split: true };
}
