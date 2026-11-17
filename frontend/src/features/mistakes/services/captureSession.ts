import { z } from 'zod';
import type { ErrorCategory } from '@/shared/types';
import { generateUUID } from '@/shared/domain/uuid';
import { partOfQuestion } from '@/shared/domain/questionNumbers';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { readFormDraft, removeFormDraft, writeFormDraft } from '@/shared/data/formDrafts';
import { mistakeFormDraftSchema } from '@/shared/data/studyFormDrafts';
import { prepareImage, type PreparedImage } from '@/features/mistakes/lib/imageInput';
import { MAX_CAPTURE_IMAGES, MAX_CAPTURE_REQUESTS, QUESTIONS_PER_REQUEST, isUnreadable, mergeItems, planRequests,
  remainingQuestions, type CaptureItem } from '@/features/mistakes/lib/captureBatch';
import * as aiService from './aiMistakeExtractor';
import type { AIMistakeParseResult, AIUsage } from './aiMistakeExtractor';

/**
 * One "Chụp trang chữa bài" capture: the screenshots, the readings and the review list.
 * It lives outside React so closing the dialog does not stop a reading: the learner is told when it is done.
 */
export type CaptureImageStatus = 'waiting' | 'reading' | 'done' | 'failed';
export interface CaptureImage extends PreparedImage { status: CaptureImageStatus }
export interface CaptureFailure { id: string; imageIds: string[]; questions: number[]; message: string }
export type CapturePhase = 'input' | 'reading' | 'review';

export interface CaptureState {
  phase: CapturePhase;
  testName: string;
  images: CaptureImage[];
  items: CaptureItem[];
  failures: CaptureFailure[];
  /** Screenshots are being prepared (compressed). */
  adding: boolean;
  /** More than `MAX_CAPTURE_IMAGES` were offered; the rest were left out. */
  overflow: boolean;
  /** Screenshots a capture could not send because it ran out of requests. */
  unsent: number;
  error: string;
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
}

const DRAFT_SCOPE = 'capture:review';
const blank = (): CaptureState => ({ phase: 'input', testName: '', images: [], items: [], failures: [], adding: false, overflow: false, unsent: 0,
  error: '', requestsTotal: 0, requestsDone: 0, usage: null, finishedInBackground: false, restored: false });

let state: CaptureState = blank();
let owner: string | null = getActiveAccountId();
let epoch = 0;
let viewing = false;
let batchId = generateUUID();
let requestsUsed = 0;
let wanted: number[] = [];
let wide = new Set<string>();
let context: CaptureContext | null = null;
let restoreTried = false;
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

/** Another account signed in: nothing of the previous one's capture may stay. */
function checkOwner() {
  const active = getActiveAccountId();
  if (active === owner) return;
  epoch += 1; owner = active; viewing = false; restoreTried = false; context = null; requestsUsed = 0; wanted = []; wide = new Set();
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

export async function addFiles(files: File[]) {
  checkOwner();
  const images = files.filter(file => file.type.startsWith('image/'));
  if (!images.length || state.adding) return;
  const room = MAX_CAPTURE_IMAGES - state.images.length;
  const accepted = images.slice(0, Math.max(0, room));
  set({ adding: true, error: '', overflow: images.length > accepted.length });
  const mine = epoch;
  const prepared: CaptureImage[] = [];
  let error = '';
  for (const file of accepted) {
    try { prepared.push({ ...(await prepareImage(file)), status: 'waiting' }); }
    catch (reason) { error = reason instanceof Error ? reason.message : 'Không đọc được ảnh.'; }
  }
  if (mine !== epoch) return;
  set({ adding: false, images: [...state.images, ...prepared], error });
}

export function removeImage(id: string) { set({ images: state.images.filter(image => image.id !== id), overflow: false, error: '' }); }

const questionList = (numbers: number[]) => numbers.map(number => ({ number, part: partOfQuestion(number) ?? 5 }));

/** One reading. A failure never stops the others: it is listed with its screenshots and can be tried again. */
async function readOnce(images: PreparedImage[], questions: number[], isWide: boolean, mine: number): Promise<void> {
  const current = () => mine === epoch && getActiveAccountId() === owner;
  const ids = new Set(images.map(image => image.id));
  const mark = (status: CaptureImageStatus) => { state = { ...state, images: state.images.map(image => ids.has(image.id) ? { ...image, status } : image) }; emit(); };
  const remaining = remainingQuestions(questions, state.items);
  if (!remaining.length) { mark('done'); return; }
  mark('reading');
  requestsUsed += 1;
  try {
    const result = await aiService.extractPageWithAI(questionList(remaining), images, context!.getToken, owner, current, batchId);
    if (!current()) return;
    const items = mergeItems(state.items, result.items, result.explainTicket, generateUUID);
    mark('done');
    set({ items, usage: result.usage, failures: state.failures.filter(failure => failure.imageIds.some(id => !ids.has(id))) });
    // A reading returns at most six questions. A wide one (all the questions at once) that filled up asks again for the rest.
    if (isWide && result.items.length >= QUESTIONS_PER_REQUEST && requestsUsed < MAX_CAPTURE_REQUESTS && remainingQuestions(questions, state.items).length) {
      await readOnce(images, questions, true, mine);
    }
  } catch (reason) {
    if (!current()) return;
    mark('failed');
    const message = reason instanceof Error ? reason.message : 'Chưa đọc được ảnh. Hãy thử lại.';
    const failure: CaptureFailure = { id: generateUUID(), imageIds: [...ids], questions, message };
    set({ failures: [...state.failures.filter(value => !value.imageIds.every(id => ids.has(id))), failure] });
    if (isWide) wide.add(failure.id);
  }
}

export async function startReading(ctx: CaptureContext) {
  checkOwner();
  if (state.phase === 'reading' || !state.images.length || !state.testName) return;
  context = ctx; wanted = [...ctx.questions]; wide = new Set(); requestsUsed = 0; batchId = generateUUID();
  const mine = ++epoch;
  const { requests, unsent } = planRequests(state.images, wanted);
  if (!requests.length) { set({ error: 'Không còn câu sai nào để tìm trong ảnh.' }); return; }
  const unsentIds = new Set(unsent.map(image => image.id));
  set({ phase: 'reading', error: '', failures: [], items: [], restored: false, requestsTotal: requests.length, requestsDone: 0, finishedInBackground: false,
    unsent: unsent.length, images: state.images.filter(image => !unsentIds.has(image.id)).map(image => ({ ...image, status: 'waiting' as const })) });
  // Several readings of the same images look for different questions; wide ones cover all of them.
  const isWide = requests.some(request => request.questions.length > QUESTIONS_PER_REQUEST);
  for (const [index, request] of requests.entries()) {
    if (mine !== epoch) return;
    // Follow-up readings of a full wide reading may have used the capture's requests up: what is left is for the next capture.
    if (requestsUsed >= MAX_CAPTURE_REQUESTS) {
      const left = new Set(requests.slice(index).flatMap(item => item.images.map(image => image.id)));
      set({ unsent: state.unsent + left.size, images: state.images.filter(image => !left.has(image.id) || image.status === 'done') });
      break;
    }
    await readOnce(request.images, request.questions, isWide, mine);
    if (mine !== epoch) return;
    set({ requestsDone: state.requestsDone + 1 });
  }
  if (mine !== epoch) return;
  set({ phase: 'review', finishedInBackground: !viewing });
}

/** Try again the screenshots of one failed reading, still as part of the same capture (no new AI use). */
export async function retryFailure(failureId: string) {
  const failure = state.failures.find(value => value.id === failureId);
  if (!failure || !context || state.phase === 'reading') return;
  const images = state.images.filter(image => failure.imageIds.includes(image.id));
  if (!images.length) return;
  const mine = epoch;
  set({ phase: 'reading', requestsTotal: 1, requestsDone: 0, error: '', failures: state.failures.filter(value => value.id !== failureId) });
  await readOnce(images, failure.questions, wide.has(failureId), mine);
  if (mine !== epoch) return;
  set({ phase: 'review', requestsDone: 1, finishedInBackground: !viewing });
}

export function toggleItem(id: string) { set({ items: state.items.map(item => item.id === id ? { ...item, checked: !item.checked } : item) }); }
export function setAllChecked(checked: boolean) { set({ items: state.items.map(item => ({ ...item, checked: checked && !isUnreadable(item.draft) })) }); }
export function patchItem(id: string, patch: Partial<Pick<CaptureItem, 'draft' | 'category' | 'checked'>>) {
  set({ items: state.items.map(item => item.id === id ? { ...item, ...patch } : item) });
}
export function removeItem(id: string) { set({ items: state.items.filter(item => item.id !== id) }); }
/** Back to the first step, keeping the screenshots so more can be added. */
export function backToInput() { set({ phase: 'input', items: [], failures: [], error: '', restored: false, unsent: 0, images: state.images.map(image => ({ ...image, status: 'waiting' as const })) }); }

/** Forget the capture: after saving, or when the learner starts over. */
export function resetCapture() {
  epoch += 1; viewing = false; context = null; requestsUsed = 0; wanted = []; wide = new Set(); batchId = generateUUID(); restoreTried = true;
  const testName = state.testName;
  removeFormDraft(DRAFT_SCOPE, owner);
  state = { ...blank(), testName }; emit();
}

export function dismissBackgroundNotice() { if (state.finishedInBackground) set({ finishedInBackground: false }); }

/** Tests only. */
export function __resetCaptureForTests() { epoch += 1; owner = getActiveAccountId(); viewing = false; restoreTried = false; context = null; state = blank(); emit(); }
