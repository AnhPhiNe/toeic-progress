import { z } from 'zod';
import type { ErrorCategory } from '@/shared/types';
import { generateUUID } from '@/shared/domain/uuid';
import { partOfQuestion, questionsOfPart, type PartNumber } from '@/shared/domain/questionNumbers';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { readFormDraft, removeFormDraft, writeFormDraft } from '@/shared/data/formDrafts';
import { mistakeFormDraftSchema } from '@/shared/data/studyFormDrafts';
import type { PreparedImage } from '@/features/mistakes/lib/imageInput';
import { CONTEXT_PER_REQUEST, MAX_CAPTURE_IMAGES, MAX_CAPTURE_REQUESTS, NEW_BATCH_NOTE, QUESTIONS_PER_REQUEST, SPLIT_NOTE, captureRequestLimit, explainCapNote,
  isRightAnswer, isUnreadable, mergeItems, remainingQuestions, ticketedNumbers, type CaptureItem } from '@/features/mistakes/lib/captureBatch';
import { canExplainRead, explainInput } from '@/features/mistakes/lib/detailForm';
import { prepareGroup, prepareSingles } from '@/features/mistakes/lib/capturePrepare';
import { isGroupedPart, type ReadRequest } from '@/features/mistakes/lib/wrongDetail';
import { FIRST_ZONE, hasZones, importZone, otherZone, type CaptureZone } from '@/features/mistakes/lib/captureZones';
import * as aiService from './aiMistakeExtractor';
import type { AIMistakeParseResult, AIUsage, PageRejectionReason } from './aiMistakeExtractor';

/**
 * One "Chụp trang chữa bài" capture session: explicit Part/group capture with parallel multi-batch queueing
 * while staging the next set of photos. Lives outside React so closing the dialog never cancels in-flight readings.
 */
export type CaptureImageStatus = 'waiting' | 'reading' | 'done' | 'failed';
export type { CaptureZone };
export { SPLIT_NOTE };
/** A screenshot/photo as picked; `url` shows it on this device only. */
export interface CaptureImage { id: string; name: string; url: string; zone: CaptureZone; status: CaptureImageStatus }
export interface CaptureFailure { id: string; imageIds: string[]; imageCount: number; questions: number[]; message: string }
export type CapturePhase = 'input' | 'reading' | 'review';
export type CapturePart = PartNumber;

export interface CaptureState {
  phase: CapturePhase;
  testName: string;
  /** The explicit Part the screenshots are from (defaults to Part 5 or the test's first Part with wrong questions). */
  part: CapturePart;
  /** Part 3/4/6/7 with a logged wrong list: the passage/audio group being captured. */
  group: number | null;
  /** Part 7: the zone (① passage, ② questions) every paste, drop, watcher or camera import goes to. */
  activeZone: CaptureZone;
  images: CaptureImage[];
  items: CaptureItem[];
  failures: CaptureFailure[];
  rejectionReasons: PageRejectionReason[];
  /** True when photos are paper book pages (routes to paper OCR model). */
  photoMode: boolean;
  /** More than `MAX_CAPTURE_IMAGES` were offered; the rest were left out. */
  overflow: boolean;
  /** Screenshots a capture could not send. */
  unsent: number;
  error: string;
  /** Said once a reading starts: the images were made smaller, or a group had to be read in parts. */
  note: string;
  /** How many readings are planned, and how many have finished. */
  requestsTotal: number;
  requestsDone: number;
  /** True while Sóc is independently solving and verifying extracted questions before review. */
  solving: boolean;
  /** Number of queued background batches currently reading/solving. */
  activeJobs: number;
  /** Number of queued background batches that finished in this sitting. */
  completedJobs: number;
  /** Total images currently being read across queued background batches. */
  queuedImagesCount: number;
  usage: AIUsage | null;
  /** The reading finished while the dialog was closed. */
  finishedInBackground: boolean;
  /** Review rows came back from a saved draft. */
  restored: boolean;
}

export interface CaptureContext {
  /** Question numbers to look for. */
  questions: number[];
  getToken: () => Promise<string>;
  /** The backend reads passage images apart from question images (`page_context_images`). */
  contextSupported?: boolean;
}

export const COMPRESSED_NOTE = 'Ảnh nặng nên Sóc đã thu nhỏ hoặc cắt ảnh trên máy trước khi gửi.';
/** Up to three readings of one capture run in parallel against OpenAI. */
const PARALLEL_READS = 3;
const DRAFT_SCOPE = 'capture:review';
const blank = (): CaptureState => ({ phase: 'input', testName: '', part: 5, group: null, activeZone: FIRST_ZONE, images: [], items: [], failures: [], rejectionReasons: [], photoMode: false, overflow: false, unsent: 0,
  error: '', note: '', requestsTotal: 0, requestsDone: 0, solving: false, activeJobs: 0, completedJobs: 0, queuedImagesCount: 0, usage: null, finishedInBackground: false, restored: false });

const EMPTY_STATE: CaptureState = Object.freeze(blank());
let state: CaptureState = blank();
let owner: string | null = getActiveAccountId();
let epoch = 0;
let viewing = false;
let batchId = generateUUID();
let requestsUsed = 0;
/** Readings one batch id accepts: the backend's /health limit once known, MAX_CAPTURE_REQUESTS until then. */
let requestLimit = MAX_CAPTURE_REQUESTS;
let requestLimitLoad: Promise<number> | null = null;
const loadRequestLimit = () => requestLimitLoad ??= Promise.resolve()
  .then(() => typeof aiService.getAIConfiguration === 'function' ? aiService.getAIConfiguration() : null)
  .then(captureRequestLimit, () => { requestLimitLoad = null; return MAX_CAPTURE_REQUESTS; });
let solvingCount = 0;
let context: CaptureContext | null = null;
let restoreTried = false;
const files = new Map<string, File>();
const failed = new Map<string, ReadRequest<PreparedImage>>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());
function set(patch: Partial<CaptureState>) { state = { ...state, ...patch }; emit(); persist(); }
export const captureState = (): CaptureState => (owner === getActiveAccountId() ? state : EMPTY_STATE);
export const subscribeCapture = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

const draftSchema = z.object({ testName: z.string().max(300),
  items: z.array(mistakeFormDraftSchema.shape.batchItems.element.extend({ checked: z.boolean() })).max(60) });
const parseDraft = (input: unknown) => { const parsed = draftSchema.safeParse(input); return parsed.success ? parsed.data : null; };

function persist() {
  if (getActiveAccountId() !== owner) return;
  if (state.items.length) {
    writeFormDraft(DRAFT_SCOPE, { testName: state.testName, items: state.items.map(({ ticket: _ticket, ...item }) => item) }, owner);
  } else if (state.phase === 'input' && !state.activeJobs) removeFormDraft(DRAFT_SCOPE, owner);
}

const release = (images: readonly CaptureImage[]) => images.forEach(image => {
  files.delete(image.id);
  try { URL.revokeObjectURL(image.url); } catch { /* not an object URL */ }
});

/** Immediately drop every in-memory file, preview URL and background job on sign-out, account switch, or reset. */
export function clearCaptureSessionForAccountChange() {
  epoch += 1;
  owner = getActiveAccountId();
  viewing = false;
  restoreTried = false;
  context = null;
  requestsUsed = 0;
  solvingCount = 0;
  failed.clear();
  release(state.images);
  files.clear();
  batchId = generateUUID();
  state = blank();
  emit();
}

/** Another account signed in: nothing of the previous one's capture may stay. */
function checkOwner() {
  const active = getActiveAccountId();
  if (active === owner) return;
  clearCaptureSessionForAccountChange();
}

/** Opening the dialog: bring back the review list of an earlier capture that was never saved. */
export function openCapture() {
  checkOwner();
  viewing = true;
  if (state.finishedInBackground) set({ finishedInBackground: false });
  if (restoreTried || state.items.length || state.images.length || state.activeJobs || state.phase !== 'input') return;
  restoreTried = true;
  const record = readFormDraft(DRAFT_SCOPE, parseDraft, owner);
  if (!record || !record.value.items.length) return;
  state = { ...state, phase: 'review', testName: record.value.testName, restored: true,
    items: record.value.items.map(item => ({ ...item, part: item.part as CaptureItem['part'], category: item.category as ErrorCategory,
      draft: item.draft as AIMistakeParseResult })) };
  emit();
}

export function closeCapture() { viewing = false; }
export const isReading = () => state.phase === 'reading' || state.activeJobs > 0;

export function setTestName(testName: string) { set({ testName }); }
/** Choosing or switching the Part keeps staged photos intact so accidental mis-picks never lose uploads. */
export function setPart(part: CapturePart) {
  if (part === state.part) return;
  const normalizedImages = hasZones(part)
    ? state.images
    : state.images.map(image => image.zone === 'questions' ? image : { ...image, zone: 'questions' as const });
  set({ part, group: null, activeZone: FIRST_ZONE, images: normalizedImages, overflow: false, error: '', note: '' });
}
export function setGroup(group: number | null) {
  if (group === state.group) return;
  set({ group, activeZone: FIRST_ZONE, overflow: false, error: '', note: '' });
}
/** The learner picks the zone imports go to (click a zone, or keys 1/2); it never changes by itself. */
export function setActiveZone(activeZone: CaptureZone) {
  if (activeZone !== state.activeZone) set({ activeZone });
}

/** Moves an image one place earlier or later among the images of its own zone. */
export function moveImage(id: string, delta: -1 | 1) {
  checkOwner();
  const index = state.images.findIndex(image => image.id === id);
  if (index < 0) return;
  const zone = state.images[index].zone;
  let target = index + delta;
  while (target >= 0 && target < state.images.length && state.images[target].zone !== zone) target += delta;
  if (target < 0 || target >= state.images.length) return;
  const next = [...state.images];
  [next[index], next[target]] = [next[target], next[index]];
  set({ images: next });
}

/** "Chuyển sang ②/①": the image goes to the end of the other zone. Only the learner moves images between zones. */
export function moveImageToZone(id: string) {
  checkOwner();
  const image = state.images.find(entry => entry.id === id);
  if (!image || !hasZones(state.part)) return;
  const zone = otherZone(image.zone);
  if (zone === 'passage' && state.images.filter(entry => entry.zone === 'passage').length >= CONTEXT_PER_REQUEST) {
    set({ error: `Ô ① nhận tối đa ${CONTEXT_PER_REQUEST} ảnh đoạn văn.` });
    return;
  }
  set({ images: [...state.images.filter(entry => entry.id !== id), { ...image, zone }], error: '' });
}

/** Cancel an in-flight reading and return to Step 1 with staged images intact. */
export function cancelReading() {
  if (state.phase !== 'reading' && state.activeJobs === 0) return;
  epoch += 1;
  solvingCount = 0;
  set({
    phase: 'input',
    error: '',
    note: '',
    solving: false,
    activeJobs: 0,
    queuedImagesCount: 0,
    requestsTotal: 0,
    requestsDone: 0,
    images: state.images.map(image => ({ ...image, status: 'waiting' as const }))
  });
}

export function setPhotoMode(photoMode: boolean) { set({ photoMode }); }

export function getImageFile(id: string): File | undefined { return files.get(id); }

export function replaceImageFile(id: string, nextFile: File) {
  checkOwner();
  const target = state.images.find(image => image.id === id);
  if (!target) return;
  try { URL.revokeObjectURL(target.url); } catch { /* not an object URL */ }
  const nextUrl = URL.createObjectURL(nextFile);
  files.set(id, nextFile);
  set({ images: state.images.map(image => image.id === id ? { ...image, name: nextFile.name || image.name, url: nextUrl } : image) });
}

/** Adds images in arrival order to `zone` (dropped on a zone) or else to the active zone. */
export function addFiles(picked: File[], zone?: CaptureZone) {
  checkOwner();
  const images = picked.filter(file => file.type.startsWith('image/'));
  if (!images.length) return;
  const target = importZone(hasZones(state.part), state.activeZone, zone);
  const roomTotal = MAX_CAPTURE_IMAGES - state.images.length;
  const roomZone = target === 'passage' ? CONTEXT_PER_REQUEST - state.images.filter(image => image.zone === 'passage').length : roomTotal;
  const accepted = images.slice(0, Math.max(0, Math.min(roomTotal, roomZone)));
  const added = accepted.map(file => {
    const image: CaptureImage = { id: generateUUID(), name: file.name || 'Ảnh đã dán', url: URL.createObjectURL(file), zone: target, status: 'waiting' };
    files.set(image.id, file);
    return image;
  });
  set({ images: [...state.images, ...added], overflow: images.length > accepted.length, error: '' });
}

export function removeImage(id: string) {
  release(state.images.filter(image => image.id === id));
  set({ images: state.images.filter(image => image.id !== id), overflow: false, error: '' });
}

const questionList = (numbers: number[]) => numbers.map(number => ({ number, part: partOfQuestion(number) ?? 5 }));
const appendNote = (prev: string, extra: string) => (!extra || prev.includes(extra)) ? prev : prev ? `${prev} ${extra}` : extra;

interface BatchOptions {
  part: CapturePart;
  group: number | null;
  photoMode: boolean;
  passageFiles: File[];
  questionFiles: File[];
  imageIds: string[];
  ctx: CaptureContext;
  mine: number;
  background: boolean;
}

/** One reading. A failure never stops the others: it is listed and can be tried again inside the same capture. */
async function readOnce(
  request: ReadRequest<PreparedImage>,
  imageIds: string[],
  mine: number,
  photoMode: boolean,
  getToken: () => Promise<string>,
  onFound?: (count: number) => void,
  onFailed?: () => void
): Promise<void> {
  const current = () => mine === epoch && getActiveAccountId() === owner;
  const ids = new Set(imageIds);
  const mark = (status: CaptureImageStatus) => {
    if (!imageIds.length || !state.images.some(image => ids.has(image.id))) return;
    state = { ...state, images: state.images.map(image => ids.has(image.id) ? { ...image, status } : image) };
    emit();
  };
  const remaining = remainingQuestions(request.questions, state.items);
  if (!remaining.length) { mark('done'); return; }
  mark('reading');
  // A full batch would refuse the request (batch_full); a new batch is another AI use, so say so.
  if (requestsUsed >= requestLimit) {
    batchId = generateUUID(); requestsUsed = 0;
    set({ note: appendNote(state.note, NEW_BATCH_NOTE(requestLimit)) });
  }
  const activeBatchId = batchId;
  requestsUsed += 1;
  try {
    const result = await aiService.extractPageWithAI(questionList(remaining), request.images, getToken, owner, current, activeBatchId,
      request.contextImages, request.slices, photoMode ? { photoMode: true } : undefined);
    if (!current()) return;
    if (result.items.length) onFound?.(result.items.length);
    const items = mergeItems(state.items, result.items, result.explainTicket, generateUUID, undefined, ticketedNumbers(result));
    const seenNumbers = new Set(items.map(item => item.number));
    const reasons = [...state.rejectionReasons, ...(result.rejectionReasons ?? [])].filter(r => r.number === null || !seenNumbers.has(r.number));
    mark('done');
    set({ items, rejectionReasons: reasons, usage: result.usage });
    // Independently solve and verify ALL extracted questions before review so:
    // - ungraded (0/1-mark) questions get "Sóc giải X" & right answers show as green "✓ Làm đúng" (unticked)
    // - graded (2-mark) questions get cross-checked against Sóc's own answer (surfacing `answerDoubt` if they disagree)
    // - saving skips a redundant second explain-batch call for already-explained cards.
    if (result.explainTicket && typeof aiService.explainBatchWithAI === 'function') {
      const explainable = result.items.filter(entry => {
        const part = (partOfQuestion(entry.number) ?? 5) as CaptureItem['part'];
        return canExplainRead(entry.draft, part);
      });
      // The ticket covers only explainNumbers (the backend's per-capture cap); sending any other number is refused.
      const ticketed = new Set(ticketedNumbers(result));
      const toSolve = explainable.filter(entry => ticketed.has(entry.number));
      const capNote = explainCapNote(explainable.length - toSolve.length, result.explainLimit);
      if (capNote) set({ note: appendNote(state.note, capNote) });
      if (toSolve.length) {
        solvingCount += 1;
        set({ solving: true });
        try {
          const explained = await aiService.explainBatchWithAI(
            result.explainTicket,
            toSolve.map(entry => {
              const part = (partOfQuestion(entry.number) ?? 5) as CaptureItem['part'];
              return { number: entry.number, input: explainInput(entry.draft, part) };
            }),
            owner
          );
          if (!current()) return;
          if (explained.items.length) {
            const byNum = new Map(explained.items.map(entry => [entry.number, entry.draft]));
            const solvedItems = state.items.map(item => {
              const solved = byNum.get(item.number);
              if (!solved) return item;
              const nextDraft: AIMistakeParseResult = {
                ...item.draft,
                ...(item.draft.answerSource === 'MISSING' && solved.answerSource !== 'MISSING'
                  ? { correctAnswer: solved.correctAnswer, answerSource: solved.answerSource }
                  : {}),
                explanation: solved.explanation ?? item.draft.explanation,
                optionNotes: solved.optionNotes?.length ? solved.optionNotes : item.draft.optionNotes,
                trapTip: solved.trapTip || item.draft.trapTip,
                tags: item.draft.tags.length ? item.draft.tags : solved.tags,
                answerDoubt: solved.answerDoubt || item.draft.answerDoubt,
                category: item.category === 'OTHER' ? solved.category : item.category,
              };
              const nextCategory = item.category === 'OTHER' ? solved.category : item.category;
              return {
                ...item,
                draft: nextDraft,
                category: nextCategory,
                checked: item.checked && !isRightAnswer(nextDraft),
              };
            });
            set({ items: solvedItems });
          }
          if (explained.failed.length) {
            const list = explained.failed.map(n => `câu ${n}`).join(', ');
            set({ note: appendNote(state.note, `Sóc chưa kịp tự giải ${explained.failed.length} câu (${list}). Bạn có thể chọn đáp án tay hoặc bấm Lưu để Sóc thử giải lại.`) });
          }
        } catch {
          if (current()) {
            set({ note: appendNote(state.note, 'Sóc đã đọc câu hỏi nhưng chưa kịp tự giải đáp án. Bạn có thể chọn đáp án tay hoặc bấm Lưu để Sóc thử giải lại.') });
          }
        } finally {
          solvingCount = Math.max(0, solvingCount - 1);
          if (current()) set({ solving: solvingCount > 0 });
        }
      }
    }
    // A reading returns at most six questions. A wide one (many questions at once) that filled up asks again for the rest.
    if (remaining.length > QUESTIONS_PER_REQUEST && result.items.length >= QUESTIONS_PER_REQUEST && requestsUsed < requestLimit
      && remainingQuestions(request.questions, state.items).length) {
      await readOnce(request, imageIds, mine, photoMode, getToken, onFound, onFailed);
    }
  } catch (reason) {
    if (!current()) return;
    mark('failed');
    onFailed?.();
    const message = reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại.';
    const imageCount = imageIds.length || (request.images.length + request.contextImages.length);
    const failure: CaptureFailure = { id: generateUUID(), imageIds, imageCount, questions: request.questions, message };
    failed.set(failure.id, request);
    set({ failures: [...state.failures, failure] });
  }
}

/** Runs the readings, up to PARALLEL_READS at a time, as one batch (one AI use). */
async function runAll(
  jobs: { request: ReadRequest<PreparedImage>; imageIds: string[] }[],
  mine: number,
  photoMode: boolean,
  getToken: () => Promise<string>,
  onFound?: (count: number) => void,
  onFailed?: () => void
) {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && mine === epoch) {
      const job = jobs[next++];
      await readOnce(job.request, job.imageIds, mine, photoMode, getToken, onFound, onFailed);
      if (mine !== epoch) return;
      set({ requestsDone: state.requestsDone + 1 });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_READS, jobs.length) }, worker));
}

async function executeBatch(opts: BatchOptions): Promise<boolean> {
  const { part, group, photoMode, passageFiles, questionFiles, imageIds, ctx, mine, background } = opts;
  // Learn the backend's limit for the next plan without delaying this one (the fallback equals today's backend).
  void loadRequestLimit().then(value => { requestLimit = value; });
  const buildPlan = (targetQuestions: number[]) => (isGroupedPart(part)
    ? prepareGroup(passageFiles, questionFiles, targetQuestions, ctx.contextSupported !== false, requestLimit)
    : prepareSingles(questionFiles, targetQuestions, requestLimit));
  const plan = await buildPlan(ctx.questions);
  if (mine !== epoch) return false;
  if (plan.error || !plan.requests.length) {
    const errMsg = plan.error || 'Không còn câu sai nào để tìm trong ảnh.';
    if (background) {
      set({ error: errMsg });
    } else {
      set({ phase: 'input', error: errMsg });
    }
    return false;
  }
  const extraNote = plan.split ? SPLIT_NOTE : plan.compressed ? COMPRESSED_NOTE : '';
  set({
    requestsTotal: state.requestsTotal + plan.requests.length,
    note: appendNote(state.note, extraNote)
  });
  let batchFound = 0;
  let batchFailed = 0;
  await runAll(
    plan.requests.map(request => ({ request, imageIds })),
    mine,
    photoMode,
    ctx.getToken,
    count => { batchFound += count; },
    () => { batchFailed += 1; }
  );
  if (mine !== epoch) return false;
  // General fallback for Parts 1–7: when not locked onto a specific passage group and the narrow
  // logged list found 0 questions on the uploaded photo, automatically expand to the full Part in the same batch.
  if (group === null && batchFound === 0 && batchFailed === 0 && requestsUsed < requestLimit) {
    const wideRange = questionsOfPart(part);
    const narrow = new Set(ctx.questions);
    if (wideRange.some(number => !narrow.has(number))) {
      const widePlan = await buildPlan(wideRange);
      if (mine !== epoch) return false;
      if (!widePlan.error && widePlan.requests.length) {
        set({
          requestsTotal: state.requestsTotal + widePlan.requests.length,
          ...(background ? {} : { images: state.images.map(image => ({ ...image, status: 'waiting' as const })) })
        });
        await runAll(widePlan.requests.map(request => ({ request, imageIds })), mine, photoMode, ctx.getToken);
      }
    }
  }
  return mine === epoch;
}

export async function startReading(ctx: CaptureContext) {
  checkOwner();
  if (state.phase === 'reading' || !state.images.length || !state.testName) return;
  context = ctx;
  const freshSitting = state.activeJobs === 0 && state.items.length === 0 && state.failures.length === 0;
  if (freshSitting) {
    requestsUsed = 0; solvingCount = 0; batchId = generateUUID(); failed.clear();
  }
  const mine = freshSitting ? ++epoch : epoch;
  const staged = state.images;
  const passageFiles = staged.filter(image => image.zone === 'passage').map(image => files.get(image.id)!);
  const questionFiles = staged.filter(image => image.zone === 'questions').map(image => files.get(image.id)!);
  const allIds = staged.map(image => image.id);
  const snapshotPart = state.part;
  const snapshotGroup = state.group;
  const snapshotPhotoMode = state.photoMode;
  set({
    phase: 'reading',
    error: '',
    ...(freshSitting ? { note: '', failures: [], rejectionReasons: [], items: [], restored: false, requestsTotal: 0, requestsDone: 0, solving: false, completedJobs: 0, unsent: 0 } : {}),
    finishedInBackground: false,
    images: staged.map(image => ({ ...image, status: 'waiting' as const }))
  });
  try {
    const ok = await executeBatch({
      part: snapshotPart,
      group: snapshotGroup,
      photoMode: snapshotPhotoMode,
      passageFiles,
      questionFiles,
      imageIds: allIds,
      ctx,
      mine,
      background: false
    });
    if (!ok || mine !== epoch) return;
  } catch (reason) {
    if (mine !== epoch) return;
    set({ phase: 'input', error: reason instanceof Error ? reason.message : 'Không đọc được ảnh. Chọn ảnh khác.' });
    return;
  }
  if (mine !== epoch) return;
  set({ phase: 'review', finishedInBackground: !viewing });
}

/**
 * Queue the currently staged images to read & solve in the background, immediately clearing the tray
 * so the learner can paste/capture the next passage or Part without waiting 20–30s.
 */
export async function queueAndContinue(ctx: CaptureContext, nextGroup: number | null = null) {
  checkOwner();
  if (!state.images.length || !state.testName) return;
  context = ctx;
  const freshSitting = state.activeJobs === 0 && state.items.length === 0 && state.failures.length === 0 && state.completedJobs === 0;
  if (freshSitting) {
    requestsUsed = 0; solvingCount = 0; batchId = generateUUID(); failed.clear();
  }
  const mine = epoch;
  const staged = state.images;
  const passageFiles = staged.filter(image => image.zone === 'passage').map(image => files.get(image.id)!);
  const questionFiles = staged.filter(image => image.zone === 'questions').map(image => files.get(image.id)!);
  const snapshotPart = state.part;
  const snapshotGroup = state.group;
  const snapshotPhotoMode = state.photoMode;
  release(staged);
  set({
    phase: 'input',
    images: [],
    group: nextGroup,
    activeZone: FIRST_ZONE,
    overflow: false,
    error: '',
    activeJobs: state.activeJobs + 1,
    queuedImagesCount: state.queuedImagesCount + staged.length,
    finishedInBackground: false
  });
  try {
    await executeBatch({
      part: snapshotPart,
      group: snapshotGroup,
      photoMode: snapshotPhotoMode,
      passageFiles,
      questionFiles,
      imageIds: [],
      ctx,
      mine,
      background: true
    });
  } catch (reason) {
    if (mine === epoch) {
      set({ error: reason instanceof Error ? reason.message : 'Một mẻ ảnh chưa đọc được.' });
    }
  } finally {
    if (mine === epoch) {
      const nextActive = Math.max(0, state.activeJobs - 1);
      const nextQueuedImages = Math.max(0, state.queuedImagesCount - staged.length);
      set({
        activeJobs: nextActive,
        completedJobs: state.completedJobs + 1,
        queuedImagesCount: nextQueuedImages,
        finishedInBackground: !viewing && nextActive === 0
      });
    }
  }
}

/** Jump directly from Step 1 to Review to inspect items accumulated by background batches. */
export function openReview() {
  checkOwner();
  if (!state.items.length && !state.failures.length && !state.activeJobs) return;
  set({ phase: 'review', finishedInBackground: false });
}

/** Remove saved items (used by "Lưu & chụp tiếp") and return to Step 1 keeping testName, unsent staged photos, and active background jobs. */
export function clearSavedItems(savedIds: Iterable<string>) {
  const drop = new Set(savedIds);
  const remaining = state.items.filter(item => !drop.has(item.id));
  const waitingImages = state.images.filter(image => image.status === 'waiting');
  release(state.images.filter(image => image.status !== 'waiting'));
  set({
    phase: 'input',
    images: waitingImages,
    items: remaining,
    failures: [],
    rejectionReasons: [],
    restored: false,
    error: '',
    note: '',
    unsent: 0,
    finishedInBackground: false
  });
}

/** Try one failed reading again, still as part of the same capture (no new AI use). */
export async function retryFailure(failureId: string) {
  const failure = state.failures.find(value => value.id === failureId);
  const request = failed.get(failureId);
  if (!failure || !request || !context || state.phase === 'reading') return;
  const mine = epoch;
  failed.delete(failureId);
  set({ phase: 'reading', requestsTotal: 1, requestsDone: 0, error: '', failures: state.failures.filter(value => value.id !== failureId) });
  await readOnce(request, failure.imageIds, mine, state.photoMode, context.getToken);
  if (mine !== epoch) return;
  set({ phase: 'review', requestsDone: 1, finishedInBackground: !viewing });
}

export function toggleItem(id: string) { set({ items: state.items.map(item => item.id === id ? { ...item, checked: !item.checked } : item) }); }
export function setAllChecked(checked: boolean) { set({ items: state.items.map(item => ({ ...item, checked: checked && !isUnreadable(item.draft) })) }); }
export function patchItem(id: string, patch: Partial<Pick<CaptureItem, 'draft' | 'category' | 'checked' | 'ticket'>>) {
  set({ items: state.items.map(item => item.id === id ? { ...item, ...patch } : item) });
}
export function removeItem(id: string) { set({ items: state.items.filter(item => item.id !== id) }); }
export function removeUncheckedItems() { set({ items: state.items.filter(item => item.checked) }); }
/** Back to the screenshots; keepAccumulated=true preserves queued items, unsent staged photos & background jobs while clearing already-read thumbnails. */
export function backToInput(keepAccumulated = false) {
  if (keepAccumulated === true || state.activeJobs > 0) {
    const waitingImages = state.images.filter(image => image.status === 'waiting');
    release(state.images.filter(image => image.status !== 'waiting'));
    set({ phase: 'input', images: waitingImages, error: '', restored: false, unsent: 0 });
    return;
  }
  solvingCount = 0;
  set({ phase: 'input', items: [], failures: [], rejectionReasons: [], error: '', note: '', restored: false, unsent: 0, solving: false, images: state.images.map(image => ({ ...image, status: 'waiting' as const })) });
}

/** Forget the capture: after saving, or when the learner starts over. */
export function resetCapture() {
  epoch += 1; viewing = false; context = null; requestsUsed = 0; solvingCount = 0; batchId = generateUUID(); restoreTried = true; failed.clear();
  const { testName } = state;
  release(state.images);
  removeFormDraft(DRAFT_SCOPE, owner);
  state = { ...blank(), testName }; emit();
}

export function dismissBackgroundNotice() { if (state.finishedInBackground) set({ finishedInBackground: false }); }

/** Tests only. */
export function __resetCaptureForTests() { requestLimitLoad = null; requestLimit = MAX_CAPTURE_REQUESTS; epoch += 1; owner = getActiveAccountId(); viewing = false; restoreTried = false; context = null; requestsUsed = 0; solvingCount = 0; failed.clear(); files.clear(); state = blank(); emit(); }
