import type { MistakeEntry, StudySession } from '@/shared/types';
import { normalizeQuestionList, partOfQuestion, type PartNumber } from '@/shared/domain/questionNumbers';
import { createDraftMistake, DETAIL_FIRST_PART, isBlankDraft } from './mistakeDrafts';
import { chunkQuestions, CONTEXT_PER_REQUEST, dataUrlBytes, IMAGES_PER_REQUEST, MAX_CAPTURE_REQUESTS, MAX_REQUEST_BYTES, QUESTIONS_PER_REQUEST } from './captureBatch';

/**
 * "Gỡ câu sai" (design/previews/mock-wrong-detail.html): a logged test's wrong questions worked through Part by Part.
 * Everything here is pure so the screens only render it.
 */

export const PART_NAMES: Record<PartNumber, string> = { 1: 'Tranh', 2: 'Hỏi – đáp', 3: 'Hội thoại', 4: 'Bài nói', 5: 'Điền câu', 6: 'Điền đoạn văn', 7: 'Đọc hiểu' };

/** Listening (Part 1–4) asks only the reason, one tap per question; Reading reads the review page. */
export type PartMode = 'reason' | 'page';
export const partMode = (part: number): PartMode => part <= 4 ? 'reason' : 'page';
export const PART_ACTION: Record<PartMode, string> = { reason: 'Chọn lý do', page: 'Chụp trang chữa bài' };

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

export interface ReadRequest<T> {
  contextImages: T[]; images: T[]; questions: number[];
  /** [first, last] positions (1-based, passage images first) of the parts of one tall screenshot. */
  slices: [number, number][];
}
export interface RequestPlan<T> { requests: ReadRequest<T>[]; split: boolean; error?: string }
const bytesOf = (images: readonly { dataUrl: string }[]) => images.reduce((sum, image) => sum + dataUrlBytes(image.dataUrl), 0);

/** The slice runs of a request built from screenshot groups (each group = the parts of one screenshot). */
function runsOf<T>(groups: readonly (readonly T[])[], offset = 0): [number, number][] {
  const runs: [number, number][] = [];
  let position = offset;
  for (const group of groups) {
    if (group.length > 1) runs.push([position + 1, position + group.length]);
    position += group.length;
  }
  return runs;
}

/** Requests of at most `max` images that never separate the parts of one screenshot. */
function packGroups<T>(groups: readonly (readonly T[])[], max: number): T[][][] {
  const packs: T[][][] = [];
  let current: T[][] = [], count = 0;
  for (const group of groups) {
    if (current.length && count + group.length > max) { packs.push(current); current = []; count = 0; }
    current.push([...group]); count += group.length;
  }
  if (current.length) packs.push(current);
  return packs;
}

/**
 * Part 5: all the screenshots in one request — more requests only when more than six questions are wanted (a reading
 * returns at most six) or more than six images were taken.
 */
export function planSingleRequests<T extends { dataUrl: string }>(shots: readonly (readonly T[])[], wanted: Iterable<number>,
  { maxImages = IMAGES_PER_REQUEST, maxBytes = MAX_REQUEST_BYTES, maxRequests = MAX_CAPTURE_REQUESTS } = {}): RequestPlan<T> {
  const numbers = normalizeQuestionList(wanted);
  const groups = shots.filter(group => group.length);
  if (!groups.length || !numbers.length) return { requests: [], split: false };
  const packs = packGroups(groups, maxImages);
  const questionGroups = chunkQuestions(numbers, QUESTIONS_PER_REQUEST);
  if (packs.length > maxRequests) return { requests: [], split: false, error: `Mỗi lần gửi tối đa ${maxRequests * maxImages} ảnh.` };
  const perPack = packs.length * questionGroups.length <= maxRequests ? questionGroups : [numbers];
  const requests = packs.flatMap(pack => perPack.map(questions => ({ contextImages: [], images: pack.flat(), questions, slices: runsOf(pack) })));
  return { requests, split: packs.length > 1 || requests.some(request => bytesOf(request.images) > maxBytes) };
}

/**
 * One passage group (Part 6–7): the passage pages and the question pages go in ONE request so the passage is read with
 * its questions. More than six question pages share the same passage across requests. Only when the images cannot fit
 * one request even after compression are they sent apart (`split`), and the screen says so. Each argument lists the
 * screenshots of a zone, each as its pieces (parts of a tall page stay together).
 */
export function planGroupRequests<T extends { dataUrl: string }>(passage: readonly (readonly T[])[], questions: readonly (readonly T[])[], wanted: Iterable<number>,
  { maxImages = IMAGES_PER_REQUEST, maxContext = CONTEXT_PER_REQUEST, maxBytes = MAX_REQUEST_BYTES, maxRequests = MAX_CAPTURE_REQUESTS, contextSupported = true } = {}): RequestPlan<T> {
  const numbers = normalizeQuestionList(wanted);
  const context = passage.flat(), passageGroups = passage.filter(group => group.length);
  if (!numbers.length || (!context.length && !questions.flat().length)) return { requests: [], split: false };
  if (context.length > maxContext) return { requests: [], split: false, error: `Mỗi nhóm nhận tối đa ${maxContext} ảnh đoạn văn.` };
  // A question printed on the passage page: the passage images are the question images.
  if (!questions.flat().length) return planGroupRequests([], passage, numbers, { maxImages, maxContext, maxBytes, maxRequests, contextSupported });
  const packs = packGroups(questions.filter(group => group.length), contextSupported ? maxImages : maxImages - context.length);
  const together: ReadRequest<T>[] = packs.map(pack => contextSupported
    ? { contextImages: [...context], images: pack.flat(), questions: numbers, slices: [...runsOf(passageGroups), ...runsOf(pack, context.length)] }
    : { contextImages: [], images: [...context, ...pack.flat()], questions: numbers, slices: [...runsOf(passageGroups), ...runsOf(pack, context.length)] });
  const fits = (request: ReadRequest<T>) => bytesOf([...request.contextImages, ...request.images]) <= maxBytes
    && request.images.length <= maxImages && request.images.length > 0;
  if (packs.length && together.length <= maxRequests && together.every(fits)) return { requests: together, split: false };
  // Last resort: every screenshot in reading order, as many per request as fit.
  const requests: ReadRequest<T>[] = [];
  let current: T[][] = [];
  const flush = () => { if (current.length) requests.push({ contextImages: [], images: current.flat(), questions: numbers, slices: runsOf(current) }); current = []; };
  for (const group of [...passageGroups, ...questions.filter(item => item.length)]) {
    const next = [...current.flat(), ...group];
    if (current.length && (next.length > maxImages || bytesOf(next) > maxBytes)) flush();
    current.push([...group]);
  }
  flush();
  if (requests.length > maxRequests) return { requests: [], split: true, error: 'Ảnh quá nhiều cho một lần gửi. Bớt ảnh hoặc cắt phần cần đọc.' };
  return { requests, split: true };
}

/** "Bỏ qua phần Nghe": Listening Parts leave the counts until the learner takes them back. */
export const visibleProgress = (progress: PartProgress[], skipListening: boolean) => skipListening ? progress.filter(entry => entry.part >= 5) : progress;

const SKIP_KEY = 'toeic_wrong_detail_skip_listening_v1';
const readSkips = (): Record<string, string[]> => { try { return JSON.parse(localStorage.getItem(SKIP_KEY) ?? '{}') ?? {}; } catch { return {}; } };
export function listeningSkipped(owner: string | null, sessionId: string): boolean {
  return (readSkips()[owner ?? 'guest'] ?? []).includes(sessionId);
}
export function setListeningSkipped(owner: string | null, sessionId: string, skipped: boolean) {
  const all = readSkips(), key = owner ?? 'guest', list = new Set(all[key] ?? []);
  if (skipped) list.add(sessionId); else list.delete(sessionId);
  all[key] = [...list];
  try { localStorage.setItem(SKIP_KEY, JSON.stringify(all)); } catch { /* the choice lasts until the page is reloaded */ }
}
