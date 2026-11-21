import { z } from 'zod';
import type { ErrorCategory } from '@/shared/types';
import { generateUUID } from '@/shared/domain/uuid';
import { partOfQuestion, questionsOfPart, type PartNumber } from '@/shared/domain/questionNumbers';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { readFormDraft, removeFormDraft, writeFormDraft } from '@/shared/data/formDrafts';
import { mistakeFormDraftSchema } from '@/shared/data/studyFormDrafts';
import type { PreparedImage } from '@/features/mistakes/lib/imageInput';
import { CONTEXT_PER_REQUEST, MAX_CAPTURE_IMAGES, MAX_CAPTURE_REQUESTS, QUESTIONS_PER_REQUEST, isRightAnswer, isUnreadable, mergeItems,
  remainingQuestions, type CaptureItem } from '@/features/mistakes/lib/captureBatch';
import { canExplainRead, explainInput } from '@/features/mistakes/lib/detailForm';
import { prepareGroup, prepareSingles } from '@/features/mistakes/lib/capturePrepare';
import { isGroupedPart, type ReadRequest } from '@/features/mistakes/lib/wrongDetail';
import * as aiService from './aiMistakeExtractor';
import type { AIMistakeParseResult, AIUsage, PageRejectionReason } from './aiMistakeExtractor';

/**
 * One "Chụp trang chữa bài" capture of one Part: screenshots or paper photos, the readings and
 * the review list. It lives outside React so closing the dialog does not stop a reading: the learner is told when done.
 */
export type CaptureImageStatus = 'waiting' | 'reading' | 'done' | 'failed';
export type CaptureZone = 'passage' | 'questions';
/** A screenshot/photo as picked; `url` shows it on this device only. */
export interface CaptureImage { id: string; name: string; url: string; zone: CaptureZone; status: CaptureImageStatus }
export interface CaptureFailure { id: string; imageIds: string[]; questions: number[]; message: string }
export type CapturePhase = 'input' | 'reading' | 'review';
export type CapturePart = PartNumber;

export interface CaptureState {
  phase: CapturePhase;
  testName: string;
  /** The Part the screenshots are from; chosen first. */
  part: CapturePart | null;
  /** Part 3/4/6/7 with a logged wrong list: the passage/audio group being captured. */
  group: number | null;
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
export const SPLIT_NOTE = 'Ảnh quá nặng để gửi cùng lúc nên Sóc đọc đoạn văn và câu hỏi ở các lượt riêng. Kiểm tra kỹ đoạn văn của từng câu.';
/** Up to three readings of one capture run in parallel against OpenAI. */
const PARALLEL_READS = 3;
const DRAFT_SCOPE = 'capture:review';
const blank = (): CaptureState => ({ phase: 'input', testName: '', part: null, group: null, images: [], items: [], failures: [], rejectionReasons: [], photoMode: false, overflow: false, unsent: 0,
  error: '', note: '', requestsTotal: 0, requestsDone: 0, usage: null, finishedInBackground: false, restored: false });

let state: CaptureState = blank();
let owner: string | null = getActiveAccountId();
let epoch = 0;
let viewing = false;
let batchId = generateUUID();
let requestsUsed = 0;
let context: CaptureContext | null = null;
let restoreTried = false;
const files = new Map<string, File>();
const failed = new Map<string, ReadRequest<PreparedImage>>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(listener => listener());
function set(patch: Partial<CaptureState>) { state = { ...state, ...patch }; emit(); persist(); }
export const captureState = () => state;
export const subscribeCapture = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

const draftSchema = z.object({ testName: z.string().max(300),
  items: z.array(mistakeFormDraftSchema.shape.batchItems.element.extend({ checked: z.boolean() })).max(60) });
const parseDraft = (input: unknown) => { const parsed = draftSchema.safeParse(input); return parsed.success ? parsed.data : null; };

function persist() {
  if (getActiveAccountId() !== owner) return;
  if (state.phase === 'review' && state.items.length) {
    writeFormDraft(DRAFT_SCOPE, { testName: state.testName, items: state.items.map(({ ticket: _ticket, ...item }) => item) }, owner);
  } else if (state.phase === 'input' && !state.items.length) removeFormDraft(DRAFT_SCOPE, owner);
}

const release = (images: readonly CaptureImage[]) => images.forEach(image => {
  files.delete(image.id);
  try { URL.revokeObjectURL(image.url); } catch { /* not an object URL */ }
});

/** Another account signed in: nothing of the previous one's capture may stay. */
function checkOwner() {
  const active = getActiveAccountId();
  if (active === owner) return;
  epoch += 1; owner = active; viewing = false; restoreTried = false; context = null; requestsUsed = 0; failed.clear();
  release(state.images);
  batchId = generateUUID(); state = blank(); emit();
}

/** Opening the dialog: bring back the review list of an earlier capture that was never saved. */
export function openCapture() {
  checkOwner();
  viewing = true;
  if (state.finishedInBackground) set({ finishedInBackground: false });
  if (restoreTried || state.items.length || state.images.length || state.phase !== 'input') return;
  restoreTried = true;
  const record = readFormDraft(DRAFT_SCOPE, parseDraft, owner);
  if (!record || !record.value.items.length) return;
  state = { ...state, phase: 'review', testName: record.value.testName, restored: true,
    items: record.value.items.map(item => ({ ...item, part: item.part as CaptureItem['part'], category: item.category as ErrorCategory,
      draft: item.draft as AIMistakeParseResult })) };
  emit();
}

export function closeCapture() { viewing = false; }
export const isReading = () => state.phase === 'reading';

export function setTestName(testName: string) { set({ testName }); }
/** Choosing (or changing) the Part starts its screenshots afresh. */
export function setPart(part: CapturePart | null) {
  if (part === state.part) return;
  release(state.images);
  set({ part, group: null, images: [], overflow: false, error: '', note: '' });
}
export function setGroup(group: number | null) {
  if (group === state.group) return;
  release(state.images);
  set({ group, images: [], overflow: false, error: '', note: '' });
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

export function addFiles(picked: File[], zone: CaptureZone = 'questions') {
  checkOwner();
  const images = picked.filter(file => file.type.startsWith('image/'));
  if (!images.length) return;
  const target: CaptureZone = state.part && isGroupedPart(state.part) ? zone : 'questions';
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

/** One reading. A failure never stops the others: it is listed and can be tried again inside the same capture. */
async function readOnce(request: ReadRequest<PreparedImage>, imageIds: string[], mine: number): Promise<void> {
  const current = () => mine === epoch && getActiveAccountId() === owner;
  const ids = new Set(imageIds);
  const mark = (status: CaptureImageStatus) => { state = { ...state, images: state.images.map(image => ids.has(image.id) ? { ...image, status } : image) }; emit(); };
  const remaining = remainingQuestions(request.questions, state.items);
  if (!remaining.length) { mark('done'); return; }
  mark('reading');
  requestsUsed += 1;
  try {
    const result = await aiService.extractPageWithAI(questionList(remaining), request.images, context!.getToken, owner, current, batchId,
      request.contextImages, request.slices, state.photoMode ? { photoMode: true } : undefined);
    if (!current()) return;
    const items = mergeItems(state.items, result.items, result.explainTicket, generateUUID);
    const seenNumbers = new Set(items.map(item => item.number));
    const reasons = [...state.rejectionReasons, ...(result.rejectionReasons ?? [])].filter(r => r.number === null || !seenNumbers.has(r.number));
    mark('done');
    set({ items, rejectionReasons: reasons, usage: result.usage });
    // Solve and explain ungraded items immediately before review so the learner sees "Sóc giải X"
    // and right answers (userChoice === correctAnswer) are automatically unticked before saving.
    if (result.explainTicket && typeof aiService.explainBatchWithAI === 'function') {
      const toSolve = result.items.filter(entry => {
        const part = (partOfQuestion(entry.number) ?? 5) as CaptureItem['part'];
        return entry.draft.answerSource === 'MISSING' && canExplainRead(entry.draft, part);
      });
      if (toSolve.length) {
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
        } catch {
          // If immediate solving fails (e.g. transient network), saveCapture still queues explanations on save.
        }
      }
    }
    // A reading returns at most six questions. A wide one (many questions at once) that filled up asks again for the rest.
    if (remaining.length > QUESTIONS_PER_REQUEST && result.items.length >= QUESTIONS_PER_REQUEST && requestsUsed < MAX_CAPTURE_REQUESTS
      && remainingQuestions(request.questions, state.items).length) await readOnce(request, imageIds, mine);
  } catch (reason) {
    if (!current()) return;
    mark('failed');
    const message = reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại.';
    const failure: CaptureFailure = { id: generateUUID(), imageIds, questions: request.questions, message };
    failed.set(failure.id, request);
    set({ failures: [...state.failures, failure] });
  }
}

/** Runs the readings, up to PARALLEL_READS at a time, as one batch (one AI use). */
async function runAll(jobs: { request: ReadRequest<PreparedImage>; imageIds: string[] }[], mine: number) {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length && mine === epoch) {
      const job = jobs[next++];
      await readOnce(job.request, job.imageIds, mine);
      if (mine !== epoch) return;
      set({ requestsDone: state.requestsDone + 1 });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_READS, jobs.length) }, worker));
}

export async function startReading(ctx: CaptureContext) {
  checkOwner();
  if (state.phase === 'reading' || !state.images.length || !state.testName || !state.part) return;
  context = ctx; requestsUsed = 0; batchId = generateUUID(); failed.clear();
  const mine = ++epoch;
  const passage = state.images.filter(image => image.zone === 'passage'), questions = state.images.filter(image => image.zone === 'questions');
  set({ phase: 'reading', error: '', note: '', failures: [], rejectionReasons: [], items: [], restored: false, requestsTotal: 0, requestsDone: 0, finishedInBackground: false, unsent: 0,
    images: state.images.map(image => ({ ...image, status: 'waiting' as const })) });
  try {
    const fileOf = (image: CaptureImage) => files.get(image.id)!;
    const buildPlan = (targetQuestions: number[]) => isGroupedPart(state.part!)
      ? prepareGroup(passage.map(fileOf), questions.map(fileOf), targetQuestions, ctx.contextSupported !== false)
      : prepareSingles(questions.map(fileOf), targetQuestions);
    const plan = await buildPlan(ctx.questions);
    if (mine !== epoch) return;
    if (plan.error || !plan.requests.length) { set({ phase: 'input', error: plan.error || 'Không còn câu sai nào để tìm trong ảnh.' }); return; }
    set({ requestsTotal: plan.requests.length, note: plan.split ? SPLIT_NOTE : plan.compressed ? COMPRESSED_NOTE : '' });
    const allIds = state.images.map(image => image.id);
    await runAll(plan.requests.map(request => ({ request, imageIds: allIds })), mine);
    if (mine !== epoch) return;
    // General fallback for Parts 1–7: when the learner did not lock onto a specific passage group and the narrow
    // logged list found 0 questions on the uploaded photo, automatically expand to the entire Part in the same batch.
    if (state.part && state.group === null && state.items.length === 0 && state.failures.length === 0 && requestsUsed < MAX_CAPTURE_REQUESTS) {
      const fullPart = questionsOfPart(state.part);
      const narrow = new Set(ctx.questions);
      if (fullPart.some(number => !narrow.has(number))) {
        const widePlan = await buildPlan(fullPart);
        if (mine !== epoch) return;
        if (!widePlan.error && widePlan.requests.length) {
          set({
            requestsTotal: state.requestsDone + widePlan.requests.length,
            images: state.images.map(image => ({ ...image, status: 'waiting' as const }))
          });
          await runAll(widePlan.requests.map(request => ({ request, imageIds: allIds })), mine);
        }
      }
    }
  } catch (reason) {
    if (mine !== epoch) return;
    set({ phase: 'input', error: reason instanceof Error ? reason.message : 'Không đọc được ảnh. Chọn ảnh khác.' });
    return;
  }
  if (mine !== epoch) return;
  set({ phase: 'review', finishedInBackground: !viewing });
}

/** Try one failed reading again, still as part of the same capture (no new AI use). */
export async function retryFailure(failureId: string) {
  const failure = state.failures.find(value => value.id === failureId);
  const request = failed.get(failureId);
  if (!failure || !request || !context || state.phase === 'reading') return;
  const mine = epoch;
  failed.delete(failureId);
  set({ phase: 'reading', requestsTotal: 1, requestsDone: 0, error: '', failures: state.failures.filter(value => value.id !== failureId) });
  await readOnce(request, failure.imageIds, mine);
  if (mine !== epoch) return;
  set({ phase: 'review', requestsDone: 1, finishedInBackground: !viewing });
}

export function toggleItem(id: string) { set({ items: state.items.map(item => item.id === id ? { ...item, checked: !item.checked } : item) }); }
export function setAllChecked(checked: boolean) { set({ items: state.items.map(item => ({ ...item, checked: checked && !isUnreadable(item.draft) })) }); }
export function patchItem(id: string, patch: Partial<Pick<CaptureItem, 'draft' | 'category' | 'checked'>>) {
  set({ items: state.items.map(item => item.id === id ? { ...item, ...patch } : item) });
}
export function removeItem(id: string) { set({ items: state.items.filter(item => item.id !== id) }); }
/** Back to the screenshots, keeping them so more can be added. */
export function backToInput() { set({ phase: 'input', items: [], failures: [], error: '', note: '', restored: false, unsent: 0, images: state.images.map(image => ({ ...image, status: 'waiting' as const })) }); }

/** Forget the capture: after saving, or when the learner starts over. */
export function resetCapture() {
  epoch += 1; viewing = false; context = null; requestsUsed = 0; batchId = generateUUID(); restoreTried = true; failed.clear();
  const { testName } = state;
  release(state.images);
  removeFormDraft(DRAFT_SCOPE, owner);
  state = { ...blank(), testName }; emit();
}

export function dismissBackgroundNotice() { if (state.finishedInBackground) set({ finishedInBackground: false }); }

/** Tests only. */
export function __resetCaptureForTests() { epoch += 1; owner = getActiveAccountId(); viewing = false; restoreTried = false; context = null; failed.clear(); files.clear(); state = blank(); emit(); }
