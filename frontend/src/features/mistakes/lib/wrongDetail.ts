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

/** Standard ETS cluster layouts: Part 3–4 (3 questions/set), Part 6 (4 questions/set), Part 7 (editable default). */
export const P3_GROUPS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 13 }, (_, index) => [32 + index * 3, 34 + index * 3] as const);
export const P4_GROUPS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 10 }, (_, index) => [71 + index * 3, 73 + index * 3] as const);
export const P6_GROUPS: ReadonlyArray<readonly [number, number]> = [[131, 134], [135, 138], [139, 142], [143, 146]];
export const P7_GROUPS: ReadonlyArray<readonly [number, number]> = [[147, 148], [149, 150], [151, 152], [153, 154], [155, 157], [158, 160],
  [161, 163], [164, 167], [168, 171], [172, 175], [176, 180], [181, 185], [186, 190], [191, 195], [196, 200]];

export interface PassageGroup { from: number; to: number; kind: string; passages: number; wrong: number[]; custom?: boolean }
export type CustomRangeMap = Record<number, readonly [number, number]>;
export const isGroupedPart = (part: number): part is 3 | 4 | 6 | 7 => part === 3 || part === 4 || part === 6 || part === 7;
const passageCount = (from: number) => from >= 186 ? 3 : from >= 176 ? 2 : 1;
const kindOf = (part: number, from: number) => part === 3 ? 'Hội thoại' : part === 4 ? 'Bài nói' : part === 6 ? 'Đoạn văn' : ['Đoạn đơn', 'Đoạn kép', 'Đoạn ba'][passageCount(from) - 1];

/** The passage/audio groups of Part 3, 4, 6 or 7 that hold at least one wrong question, in test order. */
export function suggestGroups(part: 3 | 4 | 6 | 7, wrong: Iterable<number>, customRanges?: CustomRangeMap): PassageGroup[] {
  const numbers = normalizeQuestionList(wrong);
  const presets = part === 3 ? P3_GROUPS : part === 4 ? P4_GROUPS : part === 6 ? P6_GROUPS : P7_GROUPS;
  if (part !== 7 || !customRanges || !Object.keys(customRanges).length) {
    return presets.map(([from, to]) => ({ from, to, kind: kindOf(part, from), passages: part === 7 ? passageCount(from) : 1,
      wrong: numbers.filter(number => number >= from && number <= to) })).filter(group => group.wrong.length > 0);
  }
  // Apply learner-edited Part 7 ranges first, then bucket remaining wrong numbers into non-overlapping presets.
  const customEntries = Object.values(customRanges)
    .filter(([from, to]) => from >= 147 && to <= 200 && from <= to && to - from + 1 <= QUESTIONS_PER_REQUEST)
    .sort((a, b) => a[0] - b[0]);
  const claimed = new Set<number>();
  const result: PassageGroup[] = [];
  for (const [from, to] of customEntries) {
    const groupWrong = numbers.filter(number => number >= from && number <= to && !claimed.has(number));
    for (let n = from; n <= to; n++) claimed.add(n);
    result.push({ from, to, kind: kindOf(7, from), passages: passageCount(from), wrong: groupWrong, custom: true });
  }
  for (const [from, to] of presets) {
    const groupWrong = numbers.filter(number => number >= from && number <= to && !claimed.has(number));
    if (!groupWrong.length) continue;
    const min = Math.min(from, ...groupWrong);
    const max = Math.max(to, ...groupWrong);
    // Trim preset bounds around any already-claimed custom range so intervals never overlap.
    let effFrom = min, effTo = max;
    while (effFrom < groupWrong[0] && claimed.has(effFrom)) effFrom += 1;
    while (effTo > groupWrong[groupWrong.length - 1] && claimed.has(effTo)) effTo -= 1;
    result.push({ from: effFrom, to: effTo, kind: kindOf(7, effFrom), passages: passageCount(effFrom), wrong: groupWrong });
  }
  return result.sort((a, b) => a.from - b.from);
}

/** Validate and merge a learner-edited Part 7 group range (147–200, up to 6 questions). */
export function updatePart7Range(
  current: CustomRangeMap,
  oldFrom: number,
  from: number,
  to: number
): { next: CustomRangeMap } | { error: string } {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 147 || to > 200 || from > to) {
    return { error: 'Dải câu Part 7 cần nằm trong khoảng 147–200 và số đầu ≤ số cuối.' };
  }
  if (to - from + 1 > QUESTIONS_PER_REQUEST) {
    return { error: `Mỗi nhóm đọc tối đa ${QUESTIONS_PER_REQUEST} câu (ví dụ 149–151 hoặc 186–190).` };
  }
  const next: CustomRangeMap = {};
  for (const [key, range] of Object.entries(current)) {
    const keyNum = Number(key);
    if (keyNum === oldFrom) continue;
    // Drop any previous custom range that overlaps the newly edited range.
    if (range[1] < from || range[0] > to) next[keyNum] = range;
  }
  next[from] = [from, to];
  return { next };
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
 * Part 1/2/5 (independent questions):
 * - 1–3 screenshots go in one fast request;
 * - 4+ screenshots with multiple wanted questions auto-chunk into parallel packs of 3 images
 *   so PARALLEL_READS = 3 processes them concurrently in ~10–15s instead of waiting serially.
 */
export function planSingleRequests<T extends { dataUrl: string }>(shots: readonly (readonly T[])[], wanted: Iterable<number>,
  { maxImages = IMAGES_PER_REQUEST, maxBytes = MAX_REQUEST_BYTES, maxRequests = MAX_CAPTURE_REQUESTS, parallelPackSize = 3 } = {}): RequestPlan<T> {
  const numbers = normalizeQuestionList(wanted);
  const groups = shots.filter(group => group.length);
  if (!groups.length || !numbers.length) return { requests: [], split: false };
  const effectiveMaxImages = groups.length >= 4 && numbers.length >= 2 && maxImages === IMAGES_PER_REQUEST
    ? Math.min(maxImages, parallelPackSize)
    : maxImages;
  const packs = packGroups(groups, effectiveMaxImages);
  const questionGroups = chunkQuestions(numbers, QUESTIONS_PER_REQUEST);
  if (packs.length > maxRequests) return { requests: [], split: false, error: `Mỗi lần gửi tối đa ${maxRequests * maxImages} ảnh.` };
  const perPack = packs.length * questionGroups.length <= maxRequests ? questionGroups : [numbers];
  const requests = packs.flatMap(pack => perPack.map(questions => ({ contextImages: [], images: pack.flat(), questions, slices: runsOf(pack) })));
  return { requests, split: requests.some(request => bytesOf(request.images) > maxBytes) };
}

/**
 * One passage/transcript group (Part 3/4/6/7): passage and question pages are ALWAYS sent together.
 * Never strips passage images away from their questions; when multiple question pages exceed the byte cap,
 * repeats the full passage across smaller question packs, or reports a clear size error to trim duplicates.
 */
export function planGroupRequests<T extends { dataUrl: string }>(passage: readonly (readonly T[])[], questions: readonly (readonly T[])[], wanted: Iterable<number>,
  { maxImages = IMAGES_PER_REQUEST, maxContext = CONTEXT_PER_REQUEST, maxBytes = MAX_REQUEST_BYTES, maxRequests = MAX_CAPTURE_REQUESTS, contextSupported = true } = {}): RequestPlan<T> {
  const numbers = normalizeQuestionList(wanted);
  const context = passage.flat(), passageGroups = passage.filter(group => group.length);
  const questionGroups = questions.filter(group => group.length);
  if (!numbers.length || (!context.length && !questionGroups.length)) return { requests: [], split: false };
  if (context.length > maxContext) return { requests: [], split: false, error: `Mỗi nhóm nhận tối đa ${maxContext} ảnh đoạn văn.` };
  // Unified single tray (or passage-only page where questions are printed on the same page):
  if (!questionGroups.length) {
    return planGroupRequests([], passage, numbers, { maxImages, maxContext, maxBytes, maxRequests, contextSupported });
  }
  // Unified tray with >6 images in a grouped Part (3/4/6/7): promote leading pages to contextImages automatically.
  const canUseContext = contextSupported && numbers.every(number => isGroupedPart(partOfQuestion(number) ?? 0));
  if (!context.length && questionGroups.flat().length > maxImages && canUseContext) {
    const lead: (readonly T[])[] = [];
    let leadCount = 0;
    let restStart = 0;
    for (let i = 0; i < questionGroups.length - 1; i++) {
      if (leadCount + questionGroups[i].length > maxContext) break;
      lead.push(questionGroups[i]);
      leadCount += questionGroups[i].length;
      restStart = i + 1;
      if (questionGroups.slice(restStart).flat().length <= maxImages) break;
    }
    if (lead.length) {
      return planGroupRequests(lead, questionGroups.slice(restStart), numbers, { maxImages, maxContext, maxBytes, maxRequests, contextSupported });
    }
  }
  const fits = (request: ReadRequest<T>) => bytesOf([...request.contextImages, ...request.images]) <= maxBytes
    && request.images.length <= maxImages && request.images.length > 0;
  const maxQPerReq = contextSupported ? maxImages : maxImages - context.length;
  if (maxQPerReq < 1) {
    return { requests: [], split: false, error: 'Ảnh nhóm bài đọc và câu hỏi vượt giới hạn cho một lượt đọc. Bớt ảnh trùng hoặc cắt gọn trang cần đọc.' };
  }
  const makeRequest = (pack: T[][]): ReadRequest<T> => contextSupported
    ? { contextImages: [...context], images: pack.flat(), questions: numbers, slices: [...runsOf(passageGroups), ...runsOf(pack, context.length)] }
    : { contextImages: [], images: [...context, ...pack.flat()], questions: numbers, slices: [...runsOf(passageGroups), ...runsOf(pack, context.length)] };

  const packs = packGroups(questionGroups, maxQPerReq);
  const together = packs.map(makeRequest);
  if (together.length && together.length <= maxRequests && together.every(fits)) {
    return { requests: together, split: false };
  }
  // Pack question groups greedily by BOTH count and bytes while ALWAYS keeping the full passage attached.
  const bytePacks: ReadRequest<T>[] = [];
  let current: T[][] = [];
  for (const group of questionGroups) {
    const candidate = [...current, [...group]];
    if (current.length && !fits(makeRequest(candidate))) {
      bytePacks.push(makeRequest(current));
      current = [[...group]];
    } else {
      current = candidate;
    }
  }
  if (current.length) bytePacks.push(makeRequest(current));
  if (bytePacks.length && bytePacks.length <= maxRequests && bytePacks.every(fits)) {
    return { requests: bytePacks, split: false };
  }
  return {
    requests: [],
    split: false,
    error: 'Ảnh đoạn văn và câu hỏi vẫn vượt 8 MiB sau khi thu nhỏ. Bỏ bớt ảnh trùng hoặc cắt gọn phần cần đọc.',
  };
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
