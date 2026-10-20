import { z } from 'zod';
import { backendRequest, apiAvailable } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';
import { explanationSchema, optionNoteSchema } from '@/shared/data/mistakeFields';
import type { MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import type { PreparedImage } from '@/features/mistakes/lib/imageInput';

const draftSchema = z.object({
  part: z.number().int().min(1).max(7).nullable(),
  category: z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']),
  questionContext: z.string().min(1).max(4000), userMistake: z.string().max(4000),
  question: z.string().max(4000).nullish(), context: z.string().max(4000).nullish(),
  correctAnswer: z.string().max(1000), trapTip: z.string().max(4000),
  options: z.array(z.string().max(1000)).max(4), tags: z.array(z.string().max(50)).max(5),
  missingInformation: z.array(z.string().max(300)).max(8), answerSource: z.enum(['PROVIDED', 'AI_PROPOSED', 'MISSING']),
  // Older saved drafts may omit the learner's choice and structured fields.
  userChoice: z.enum(['A', 'B', 'C', 'D', '']).default(''),
  userChoiceState: z.enum(['CHOSEN', 'UNKNOWN', 'BLANK']).optional(),
  userReason: z.string().max(2000).optional(),
  optionNotes: z.array(optionNoteSchema).max(4).default([]),
  explanation: explanationSchema.nullable().default(null),
  // Set when AI solved the question differently from the page's answer: the page may be wrong.
  answerDoubt: z.enum(['A', 'B', 'C', 'D', '']).optional()
});
export type AIMistakeParseResult = z.infer<typeof draftSchema>;
export interface AIUsage { remaining: number | null; limit: number | null; guest: boolean; unlimited?: boolean;
  enabled?: boolean; accessStatus?: 'active' | 'pending' | 'blocked' | 'login_required'; accessMessage?: string }
export interface AIConfiguration { provider: 'openai'; structuredInput?: boolean; freeformInput?: boolean; managedAccess?: boolean; part7Images?: boolean; part1Images?: boolean; learnerCategory?: boolean; persistentImages?: boolean; pageImages?: boolean; resultImages?: boolean }

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
    ...(value.part1_picture_input === true ? { part1Images: true } : {}),
    ...(value.learner_error_category === true ? { learnerCategory: true } : {}),
    ...(value.persistent_source_images === true ? { persistentImages: true } : {}),
    ...(value.page_image_extraction === true ? { pageImages: true } : {}),
    ...(value.result_image_reading === true ? { resultImages: true } : {}) };
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
  images: PreparedImage[] = [], sourceImageIds: string[] = []): Promise<{ draft: AIMistakeParseResult; usage: AIUsage }> {
  if (rawInput.trim().length < 20 || rawInput.length > 8000) throw new Error('Dán nội dung từ 20 đến 8.000 ký tự để phân tích.');
  if (!apiAvailable || !cloud) throw new Error('Phân tích AI chưa được cấu hình cho phiên bản này. Bạn vẫn có thể lưu thủ công.');
  let { data: { session } } = await cloud.auth.getSession();
  if (!session) {
    const token = await getCaptcha();
    const { data, error } = await cloud.auth.signInAnonymously({ options: { captchaToken: token } });
    if (error || !data.session) throw new Error('Chưa tạo được phiên khách. Vui lòng thử lại hoặc đăng nhập Google.');
    session = data.session;
  }
  // Supabase consumes the sign-up token. The API needs a NEW, single-use token.
  const captchaToken = session.user.is_anonymous ? await getCaptcha() : undefined;
  const value = await backendRequest<{ draft: unknown; usage: AIUsage }>('/api/v1/ai/extract', 'POST', {
    text: rawInput.trim(), request_id: crypto.randomUUID(), consent: true, captcha_token: captchaToken,
    provider: 'openai', ...(input ? { input } : {}), ...(images.length ? { images: images.map(image => ({ dataUrl: image.dataUrl })) } : {}),
    ...(sourceImageIds.length ? { sourceImageIds } : {})
  }, session.user.id);
  const parsed = draftSchema.safeParse(value.draft);
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
const pageSchema = z.object({
  items: z.array(z.object({ number: z.number().int().min(1).max(200), draft: pageDraftSchema })).max(6),
  missing: z.array(z.number().int().min(1).max(200)).max(200),
  explainTicket: z.string().max(2048).nullish()
});
export type PageItem = z.infer<typeof pageSchema>['items'][number];

/** Read the learner's wrong questions from 1–3 screenshots; one call counts as one AI use. */
export async function extractPageWithAI(questions: { number: number; part: number }[], images: PreparedImage[], getCaptcha: () => Promise<string>)
  : Promise<{ items: PageItem[]; missing: number[]; explainTicket?: string | null; usage: AIUsage }> {
  if (!questions.length) throw new Error('Không còn câu sai nào để tìm trong ảnh.');
  if (!images.length || images.length > 3) throw new Error('Chọn 1 đến 3 ảnh màn hình.');
  if (!apiAvailable || !cloud) throw new Error('Phân tích AI chưa được cấu hình cho phiên bản này. Bạn vẫn có thể ghi tay.');
  let { data: { session } } = await cloud.auth.getSession();
  if (!session) {
    const token = await getCaptcha();
    const { data, error } = await cloud.auth.signInAnonymously({ options: { captchaToken: token } });
    if (error || !data.session) throw new Error('Chưa tạo được phiên khách. Vui lòng thử lại hoặc đăng nhập Google.');
    session = data.session;
  }
  const captchaToken = session.user.is_anonymous ? await getCaptcha() : undefined;
  const value = await backendRequest<{ items: unknown; missing: unknown; explainTicket?: unknown; usage: AIUsage }>('/api/v1/ai/extract-page', 'POST', {
    request_id: crypto.randomUUID(), consent: true, provider: 'openai', captcha_token: captchaToken,
    questions, images: images.map(image => ({ dataUrl: image.dataUrl }))
  }, session.user.id);
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success) throw new Error('Kết quả AI chưa hợp lệ. Hãy thử lại hoặc ghi tay.');
  for (const item of parsed.data.items) if (item.draft.answerSource === 'MISSING') item.draft.correctAnswer = '';
  return { ...parsed.data, usage: value.usage };
}

const questionList = z.array(z.number().int().min(1).max(200)).max(200);
const resultsSchema = z.object({ wrong: questionList, skipped: questionList });

/** Read which questions a result-page screenshot marks wrong or skipped; one call counts as one AI use. */
export async function readResultsWithAI(images: PreparedImage[], getCaptcha: () => Promise<string>): Promise<{ wrong: number[]; skipped: number[]; usage: AIUsage }> {
  if (!images.length || images.length > 8) throw new Error('Chọn 1 đến 8 ảnh kết quả.');
  if (!apiAvailable || !cloud) throw new Error('Phân tích AI chưa được cấu hình cho phiên bản này. Bạn vẫn có thể chạm vào các câu sai.');
  let { data: { session } } = await cloud.auth.getSession();
  if (!session) {
    const token = await getCaptcha();
    const { data, error } = await cloud.auth.signInAnonymously({ options: { captchaToken: token } });
    if (error || !data.session) throw new Error('Chưa tạo được phiên khách. Vui lòng thử lại hoặc đăng nhập Google.');
    session = data.session;
  }
  const captchaToken = session.user.is_anonymous ? await getCaptcha() : undefined;
  const value = await backendRequest<{ wrong: unknown; skipped: unknown; usage: AIUsage }>('/api/v1/ai/read-results', 'POST', {
    request_id: crypto.randomUUID(), consent: true, provider: 'openai', captcha_token: captchaToken, images: images.map(image => ({ dataUrl: image.dataUrl }))
  }, session.user.id);
  const parsed = resultsSchema.safeParse(value);
  if (!parsed.success) throw new Error('Kết quả AI chưa hợp lệ. Hãy thử lại hoặc chạm vào các câu sai.');
  return { ...parsed.data, usage: value.usage };
}

const explainSchema = z.object({
  items: z.array(z.object({ number: z.number().int().min(1).max(200), draft: pageDraftSchema })).max(6),
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
    request_id: crypto.randomUUID(), consent: true, provider: 'openai', ticket, items
  }, session.user.id);
  const parsed = explainSchema.safeParse(value);
  if (!parsed.success) throw new Error('Lời giải AI trả về chưa hợp lệ.');
  for (const item of parsed.data.items) if (item.draft.answerSource === 'MISSING') item.draft.correctAnswer = '';
  return parsed.data;
}
