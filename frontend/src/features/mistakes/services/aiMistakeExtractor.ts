import { z } from 'zod';
import { generateUUID } from '@/shared/domain/uuid';
import { backendRequest, apiAvailable } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';
import { requestAISignIn } from '@/shared/lib/aiSignIn';
import { aiDraftSchema as draftSchema } from '@/features/mistakes/lib/aiDraftSchema';
import { resultImageTimingSchema } from '@/shared/domain/resultTiming';
export { resultImageTimingSchema } from '@/shared/domain/resultTiming';
import type { MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import type { PreparedImage } from '@/features/mistakes/lib/imageInput';

export type AIMistakeParseResult = z.infer<typeof draftSchema>;
export interface AIUsage { remaining: number | null; limit: number | null; guest: boolean; unlimited?: boolean;
  enabled?: boolean; accessStatus?: 'active' | 'pending' | 'blocked' | 'login_required'; accessMessage?: string }
export interface AIConfiguration {
  provider: 'openai';
  structuredInput?: boolean;
  freeformInput?: boolean;
  managedAccess?: boolean;
  part7Images?: boolean;
  learnerCategory?: boolean;
  pageImages?: boolean;
  pageContextImages?: boolean;
  maxPageContextImages?: number;
  /** One capture (batch id) accepts this many readings (backend AI_BATCH_MAX_REQUESTS). */
  maxBatchRequests?: number;
  /** One capture explains at most this many questions (backend AI_BATCH_MAX_EXPLAIN_QUESTIONS). */
  maxBatchExplainQuestions?: number;
  /** A single-card analysis accepts this many passage images. */
  maxAnalyzeImages?: number;
  paperPhotoOcr?: boolean;
  resultImages?: boolean;
  maxResultImageBytes?: number;
}

export async function getAIConfiguration(): Promise<AIConfiguration> {
  if (!apiAvailable) throw new Error('Phân tích AI chưa được cấu hình cho phiên bản này. Bạn vẫn có thể lưu thủ công.');
  const message = 'Chưa kết nối được máy chủ phân tích AI. Hãy thử kết nối lại; bạn vẫn có thể lưu thủ công.';
  const apiBase = import.meta.env.VITE_API_URL!.replace(/\/$/, '');
  // The deployed site's public health probe is proxied by Vercel. A browser
  // that can open Render but cannot read its cross-origin response can still
  // load recipient consent. Local/preview/staging configurations stay direct.
  const statusURL = typeof window !== 'undefined'
    && window.location.hostname === 'toeictracking.vercel.app'
    && apiBase === 'https://toeic-progress-api.onrender.com'
    ? '/api/ai-status' : `${apiBase}/health`;
  // Retry only the public GET probe. Never retry the paid extraction POST.
  // One deadline covers every attempt, including a Render cold start.
  const signal = AbortSignal.timeout(90_000);
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(statusURL, { signal, cache: 'no-store' });
    } catch {
      if (attempt === 2 || signal.aborted) throw new Error(message);
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
      continue;
    }
    if (response.ok) break;
    if (![502, 503, 504].includes(response.status) || attempt === 2 || signal.aborted) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
  }
  if (!response?.ok) throw new Error(message);
  const value = await response.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Cấu hình AI chưa hợp lệ.');
  if (!value.ai_configured) {
    const reason = value.ai_enabled === false ? 'Chức năng phân tích AI đang được tắt.'
      : value.ai_enabled === true ? 'Cấu hình dịch vụ phân tích AI chưa đầy đủ.' : 'Dịch vụ phân tích AI chưa sẵn sàng.';
    throw new Error(`${reason} Bạn vẫn có thể lưu thủ công.`);
  }
  if (value.ai_provider !== 'openai') throw new Error('Cấu hình AI chưa hợp lệ. Backend cần hỗ trợ OpenAI.');
  return { provider: 'openai',
    ...(value.structured_mistake_input === true ? { structuredInput: true } : {}),
    ...(value.freeform_mistake_input === true ? { freeformInput: true } : {}),
    ...(value.managed_ai_access === true ? { managedAccess: true } : {}),
    ...(value.part7_context_images === true ? { part7Images: true } : {}),
    ...(value.learner_error_category === true ? { learnerCategory: true } : {}),
    ...(value.page_image_extraction === true ? { pageImages: true } : {}),
    ...(value.page_context_images === true ? { pageContextImages: true } : {}),
    ...(typeof value.max_page_context_images === 'number' ? { maxPageContextImages: value.max_page_context_images } : {}),
    ...(Number.isInteger(value.max_batch_requests) && value.max_batch_requests > 0 ? { maxBatchRequests: value.max_batch_requests } : {}),
    ...(Number.isInteger(value.max_batch_explain_questions) && value.max_batch_explain_questions > 0 ? { maxBatchExplainQuestions: value.max_batch_explain_questions } : {}),
    ...(Number.isInteger(value.max_analyze_images) && value.max_analyze_images > 0 ? { maxAnalyzeImages: value.max_analyze_images } : {}),
    ...(value.paper_photo_ocr === true ? { paperPhotoOcr: true } : {}),
    ...(value.result_image_reading === true ? { resultImages: true } : {}),
    ...(typeof value.max_result_image_bytes === 'number' ? { maxResultImageBytes: value.max_result_image_bytes } : {}) };
}

const SIGN_IN_FOR_AI = 'Đăng nhập Google để dùng AI. Bạn vẫn có thể nhập và lưu thủ công.';

/**
 * With managed access only signed-in accounts may use AI, so a guest is invited to sign in instead of solving a
 * captcha for a guest session the backend would refuse. Without that setting the guest session path is unchanged.
 */
async function requireSignInWhenManaged() {
  let managed = false;
  try { managed = Boolean((await getAIConfiguration()).managedAccess); } catch { /* The request below reports connection errors. */ }
  if (managed) {
    requestAISignIn();
    throw new Error(SIGN_IN_FOR_AI);
  }
}

export async function getAIUsage(): Promise<AIUsage | null> {
  if (!apiAvailable || !cloud) return null;
  const { data: { session } } = await cloud.auth.getSession();
  if (!session) return null;
  const usage = await backendRequest<AIUsage>('/api/v1/ai/usage', 'GET', undefined, session.user.id);
  const { data: { session: current } } = await cloud.auth.getSession();
  return current?.user.id === session.user.id ? usage : null;
}

export async function extractMistakeWithAI(rawInput: string, getCaptcha: () => Promise<string>, input?: MistakeInput,
  images: PreparedImage[] = [], expectedOwner?: string | null, isCurrent: () => boolean = () => true): Promise<{ draft: AIMistakeParseResult; usage: AIUsage }> {
  const maxChars = input?.savedCard ? 12000 : 8000;
  const minChars = input?.savedCard ? 1 : 20;
  if (rawInput.trim().length < minChars || rawInput.length > maxChars) {
    throw new Error(input?.savedCard ? 'Nội dung thẻ quá dài để phân tích (tối đa 12.000 ký tự).' : 'Dán nội dung từ 20 đến 8.000 ký tự để phân tích.');
  }
  if (!apiAvailable || !cloud) throw new Error('Phân tích AI chưa được cấu hình cho phiên bản này. Bạn vẫn có thể lưu thủ công.');
  const checkCurrent = () => { if (!isCurrent()) throw new Error('Tác vụ phân tích đã đóng hoặc thay đổi. Chưa gửi yêu cầu mới.'); };
  const checkOwner = (session: { user: { id: string; is_anonymous?: boolean } } | null) => {
    checkCurrent();
    if (expectedOwner !== undefined && (expectedOwner === null ? session && !session.user.is_anonymous : session?.user.id !== expectedOwner)) {
      throw new Error('Tài khoản đã thay đổi. Chưa gửi yêu cầu phân tích.');
    }
  };
  checkCurrent();
  let { data: { session } } = await cloud.auth.getSession();
  checkOwner(session);
  if (!session) {
    await requireSignInWhenManaged();
    checkCurrent();
    const token = await getCaptcha();
    checkCurrent();
    const latest = await cloud.auth.getSession();
    checkOwner(latest.data.session);
    if (latest.data.session) throw new Error('Phiên đăng nhập đã thay đổi. Chưa gửi yêu cầu phân tích.');
    const { data, error } = await cloud.auth.signInAnonymously({ options: { captchaToken: token } });
    if (error || !data.session) throw new Error('Chưa tạo được phiên khách. Vui lòng thử lại hoặc đăng nhập Google.');
    session = data.session;
    checkOwner(session);
  }
  // Supabase consumes the sign-up token. The API needs a NEW, single-use token.
  const captchaToken = session.user.is_anonymous ? await getCaptcha() : undefined;
  checkOwner(session);
  const value = await backendRequest<{ draft: unknown; usage: AIUsage }>('/api/v1/ai/extract', 'POST', {
    text: rawInput.trim(), request_id: generateUUID(), consent: true, captcha_token: captchaToken,
    provider: 'openai', ...(input ? { input } : {}), ...(images.length ? { images: images.map(image => ({ dataUrl: image.dataUrl })) } : {}),
  }, session.user.id, isCurrent);
  checkCurrent();
  const parsed = (input?.savedCard ? pageDraftSchema : draftSchema).safeParse(value.draft);
  if (!parsed.success) throw new Error('Bản nháp AI chưa hợp lệ. Vui lòng nhập thủ công hoặc thử lại sau.');
  const draft = parsed.data;
  if (draft.answerSource === 'MISSING') draft.correctAnswer = '';
  return { draft, usage: value.usage };
}

export function getDemoSampleInput(): { input: string; result: AIMistakeParseResult } {
  return {
    input: `Câu 142 Part 5:
Ms. Watson requested that all expense reports ______ submitted to the accounting department before 5:00 PM on Friday.
(A) are
(B) be
(C) were
(D) will be
Tôi chọn A vì thấy reports là số nhiều nên chọn are.
Đáp án chuẩn: B.`,
    result: {
      part: 5, category: 'ADVANCED_GRAMMAR',
      questionContext: 'Ms. Watson requested that all expense reports ______ submitted to the accounting department before 5:00 PM on Friday.',
      userMistake: 'Chọn A vì nghĩ reports số nhiều nên dùng are.', correctAnswer: '(B) be',
      // Same labeled text the backend composes from the structured fields below.
      trapTip: `Dịch ngữ cảnh: Bà Watson yêu cầu tất cả báo cáo chi phí được nộp cho phòng kế toán trước 5 giờ chiều thứ Sáu.

Phương án: (A) (v) to be, hiện tại số nhiều; (B) (v) nguyên thể; (C) (v) to be, quá khứ; (D) (v) to be, tương lai

Phân tích: "requested that" dùng cấu trúc giả định nên động từ ở dạng nguyên thể; báo cáo được nộp nên dùng bị động be submitted. Chọn A vì thấy reports số nhiều là bẫy: động từ trong mệnh đề giả định không chia theo số nhiều.

Từ vựng: expense report: báo cáo chi phí · accounting department: phòng kế toán

Mẹo 10s: Gặp "request that" → động từ nguyên thể; chủ ngữ nhận hành động thì dùng be + V3.`,
      options: ['(A) are', '(B) be', '(C) were', '(D) will be'],
      tags: ['subjunctive', 'part5'], missingInformation: [], answerSource: 'PROVIDED', userChoice: 'A',
      optionNotes: [
        { label: 'A', pos: 'v', meaning: 'to be, hiện tại số nhiều' },
        { label: 'B', pos: 'v', meaning: 'nguyên thể' },
        { label: 'C', pos: 'v', meaning: 'to be, quá khứ' },
        { label: 'D', pos: 'v', meaning: 'to be, tương lai' }
      ],
      explanation: {
        quickTip: 'Gặp "request that" → động từ nguyên thể; chủ ngữ nhận hành động thì dùng be + V3.',
        translation: 'Bà Watson yêu cầu tất cả báo cáo chi phí được nộp cho phòng kế toán trước 5 giờ chiều thứ Sáu.',
        questionType: '', evidence: '', paraphrase: '',
        analysis: '"requested that" dùng cấu trúc giả định nên động từ ở dạng nguyên thể; báo cáo được nộp nên dùng bị động be submitted. Chọn A vì thấy reports số nhiều là bẫy: động từ trong mệnh đề giả định không chia theo số nhiều.',
        keyVocabulary: 'expense report: báo cáo chi phí · accounting department: phòng kế toán'
      }
    }
  };
}

// A page may contain several full passages. The ticket-only explanation API
// preserves that source; the ordinary single-question contract stays unchanged.
const pageDraftSchema = draftSchema.extend({
  questionContext: z.string().min(1).max(12002),
  context: z.string().max(8000).nullish()
});
const pageRejectionReasonSchema = z.object({
  number: z.number().int().min(1).max(200).nullable(),
  code: z.string().max(64),
  detail: z.string().max(300)
});
const pageSchema = z.object({
  items: z.array(z.object({ number: z.number().int().min(1).max(200), draft: pageDraftSchema,
    /** Whether the number was printed on the page or guessed by Sóc; sent by newer backends only. */
    numberSource: z.enum(['printed', 'inferred']).optional().catch(undefined) })).max(6),
  missing: z.array(z.number().int().min(1).max(200)).max(200),
  rejectionReasons: z.array(pageRejectionReasonSchema).max(20).optional().default([]),
  explainTicket: z.string().max(2048).nullish(),
  /** The numbers this ticket may explain; the backend caps them per capture. Missing on an older backend. */
  explainNumbers: z.array(z.number().int().min(1).max(200)).max(200).optional(),
  explainLimit: z.number().int().min(1).max(200).optional()
});
export type PageItem = z.infer<typeof pageSchema>['items'][number];
export type PageRejectionReason = z.infer<typeof pageRejectionReasonSchema>;

/**
 * Read the learner's wrong questions from 1–6 screenshots/photos (and up to 5 passage/transcript pages).
 * One capture sends several readings that share a `batchId`; the backend counts the whole capture as one AI use.
 */
export async function extractPageWithAI(questions: { number: number; part: number }[], images: PreparedImage[], getCaptcha: () => Promise<string>,
  expectedOwner?: string | null, isCurrent: () => boolean = () => true, batchId?: string, contextImages: PreparedImage[] = [], slices: [number, number][] = [],
  options?: { photoMode?: boolean })
  : Promise<{ items: PageItem[]; missing: number[]; rejectionReasons?: PageRejectionReason[]; explainTicket?: string | null;
    /** Only these numbers may be sent to explain-batch with explainTicket (empty without a ticket). */
    explainNumbers: number[]; explainLimit?: number; usage: AIUsage }> {
  if (!questions.length) throw new Error('Không còn câu sai nào để tìm trong ảnh.');
  if (!images.length || images.length > 6) throw new Error('Chọn 1 đến 6 ảnh câu hỏi.');
  if (contextImages.length > 5) throw new Error('Chọn tối đa 5 ảnh đoạn văn.');
  if (!apiAvailable || !cloud) throw new Error('Phân tích AI chưa được cấu hình cho phiên bản này. Bạn vẫn có thể ghi tay.');
  const checkCurrent = () => { if (!isCurrent()) throw new Error('Tác vụ đọc ảnh đã đóng hoặc thay đổi. Chưa gửi yêu cầu mới.'); };
  const checkOwner = (session: { user: { id: string; is_anonymous?: boolean } } | null) => {
    checkCurrent();
    if (expectedOwner !== undefined && (expectedOwner === null ? session && !session.user.is_anonymous : session?.user.id !== expectedOwner)) {
      throw new Error('Tài khoản đã thay đổi. Chưa gửi yêu cầu đọc ảnh.');
    }
  };
  checkCurrent();
  let { data: { session } } = await cloud.auth.getSession();
  checkOwner(session);
  if (!session) {
    await requireSignInWhenManaged();
    checkCurrent();
    const token = await getCaptcha();
    checkCurrent();
    // A Google sign-in may have completed while the CAPTCHA was open.
    // Never replace that session with a guest identity for this older request.
    const latest = await cloud.auth.getSession();
    checkOwner(latest.data.session);
    if (latest.data.session) throw new Error('Phiên đăng nhập đã thay đổi. Chưa gửi yêu cầu đọc ảnh.');
    const { data, error } = await cloud.auth.signInAnonymously({ options: { captchaToken: token } });
    if (error || !data.session) throw new Error('Chưa tạo được phiên khách. Vui lòng thử lại hoặc đăng nhập Google.');
    session = data.session;
    checkOwner(session);
  }
  const captchaToken = session.user.is_anonymous ? await getCaptcha() : undefined;
  checkOwner(session);
  const value = await backendRequest<{ items: unknown; missing: unknown; rejectionReasons?: unknown; explainTicket?: unknown; usage: AIUsage }>('/api/v1/ai/extract-page', 'POST', {
    request_id: generateUUID(), consent: true, provider: 'openai', captcha_token: captchaToken,
    ...(batchId ? { batch_id: batchId } : {}),
    questions, images: images.map(image => ({ dataUrl: image.dataUrl })),
    ...(contextImages.length ? { context_images: contextImages.map(image => ({ dataUrl: image.dataUrl })) } : {}),
    ...(slices.length ? { slices } : {}),
    ...(options?.photoMode ? { photoMode: true } : {})
  }, session.user.id, isCurrent);
  checkCurrent();
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success) throw new Error('Kết quả AI chưa hợp lệ. Hãy thử lại hoặc ghi tay.');
  for (const item of parsed.data.items) if (item.draft.answerSource === 'MISSING') item.draft.correctAnswer = '';
  const explainNumbers = !parsed.data.explainTicket ? []
    : parsed.data.explainNumbers ?? parsed.data.items.map(item => item.number);
  return { ...parsed.data, explainNumbers, usage: value.usage };
}

const questionList = z.array(z.number().int().min(1).max(200)).max(200);
const resultScoresSchema = z.object({
  listening: z.number().int().min(5).max(495).multipleOf(5).nullable(),
  reading: z.number().int().min(5).max(495).multipleOf(5).nullable(),
  total: z.number().int().min(10).max(990).multipleOf(5).nullable(),
  part5Minutes: z.number().int().min(1).max(75).nullish(),
  part6Minutes: z.number().int().min(1).max(75).nullish(),
  part7Minutes: z.number().int().min(1).max(75).nullish()
});
export type ResultImageScores = z.infer<typeof resultScoresSchema>;
export type { ResultImageTiming } from '@/shared/types';
const resultsSchema = z.object({ wrong: questionList, skipped: questionList, scores: resultScoresSchema.nullish(),
  timing: resultImageTimingSchema.nullish() });

/** Read which questions a result-page screenshot or paper answer sheet marks wrong or skipped; one call counts as one AI use. */
export async function readResultsWithAI(images: PreparedImage[], getCaptcha: () => Promise<string>,
  expectedOwner?: string | null, isCurrent: () => boolean = () => true, options?: { photoMode?: boolean }): Promise<{ wrong: number[]; skipped: number[]; scores?: ResultImageScores | null; timing?: import('@/shared/types').ResultImageTiming | null; usage: AIUsage }> {
  if (!images.length || images.length > 8) throw new Error('Chọn 1 đến 8 ảnh kết quả.');
  if (!apiAvailable || !cloud) throw new Error('Phân tích AI chưa được cấu hình cho phiên bản này. Bạn vẫn có thể chạm vào các câu sai.');
  const checkCurrent = () => { if (!isCurrent()) throw new Error('Tác vụ đọc ảnh đã đóng hoặc thay đổi. Chưa gửi yêu cầu mới.'); };
  const checkOwner = (session: { user: { id: string; is_anonymous?: boolean } } | null) => {
    checkCurrent();
    if (expectedOwner !== undefined && (expectedOwner === null ? session && !session.user.is_anonymous : session?.user.id !== expectedOwner)) {
      throw new Error('Tài khoản đã thay đổi. Chưa gửi yêu cầu đọc ảnh.');
    }
  };
  checkCurrent();
  let { data: { session } } = await cloud.auth.getSession();
  checkOwner(session);
  if (!session) {
    await requireSignInWhenManaged();
    checkCurrent();
    const token = await getCaptcha();
    checkCurrent();
    // A Google sign-in may have completed while the CAPTCHA was open.
    // Never replace that session with a guest identity for this older request.
    const latest = await cloud.auth.getSession();
    checkOwner(latest.data.session);
    if (latest.data.session) throw new Error('Phiên đăng nhập đã thay đổi. Chưa gửi yêu cầu đọc ảnh.');
    const { data, error } = await cloud.auth.signInAnonymously({ options: { captchaToken: token } });
    if (error || !data.session) throw new Error('Chưa tạo được phiên khách. Vui lòng thử lại hoặc đăng nhập Google.');
    session = data.session;
    checkOwner(session);
  }
  const captchaToken = session.user.is_anonymous ? await getCaptcha() : undefined;
  checkOwner(session);
  const value = await backendRequest<{ wrong: unknown; skipped: unknown; scores?: unknown; timing?: unknown; usage: AIUsage }>('/api/v1/ai/read-results', 'POST', {
    request_id: generateUUID(), consent: true, provider: 'openai', captcha_token: captchaToken,
    images: images.map(image => ({ dataUrl: image.dataUrl })),
    ...(options?.photoMode ? { photoMode: true } : {})
  }, session.user.id, isCurrent);
  checkCurrent();
  const parsed = resultsSchema.safeParse(value);
  if (!parsed.success) throw new Error('Kết quả AI chưa hợp lệ. Hãy thử lại hoặc chạm vào các câu sai.');
  return { ...parsed.data, usage: value.usage };
}
const explainSchema = z.object({
  items: z.array(z.object({ number: z.number().int().min(1).max(200), draft: pageDraftSchema,
    /** Whether the number was printed on the page or guessed by Sóc; sent by newer backends only. */
    numberSource: z.enum(['printed', 'inferred']).optional().catch(undefined) })).max(6),
  failed: z.array(z.number().int().min(1).max(200)).max(6),
  retry: z.array(z.object({
    number: z.number().int().min(1).max(200),
    status: z.enum(['retryable', 'completed', 'exhausted']),
    remainingAttempts: z.number().int().min(0).max(3)
  })).max(6).default([])
});

/** Explanations for questions a screenshot reading already counted; the ticket from that reading stands in for a new AI use. */
export async function explainBatchWithAI(ticket: string, items: { number: number; input: MistakeInput }[], expectedOwner?: string | null)
  : Promise<{ items: PageItem[]; failed: number[]; retry: z.infer<typeof explainSchema>['retry'] }> {
  if (!apiAvailable || !cloud) throw new Error('Phân tích AI chưa được cấu hình cho phiên bản này.');
  const { data: { session } } = await cloud.auth.getSession();
  if (!session) throw new Error('Phiên đã hết. Mở lại thẻ và bấm Giải thích với AI.');
  if (expectedOwner !== undefined && (expectedOwner === null ? !session.user.is_anonymous : session.user.id !== expectedOwner)) {
    throw new Error('Tài khoản đã thay đổi. Chưa gửi yêu cầu viết lời giải.');
  }
  const value = await backendRequest<unknown>('/api/v1/ai/explain-batch', 'POST', {
    request_id: generateUUID(), consent: true, provider: 'openai', ticket, items
  }, session.user.id);
  const parsed = explainSchema.safeParse(value);
  if (!parsed.success) throw new Error('Lời giải AI trả về chưa hợp lệ.');
  for (const item of parsed.data.items) if (item.draft.answerSource === 'MISSING') item.draft.correctAnswer = '';
  return parsed.data;
}
