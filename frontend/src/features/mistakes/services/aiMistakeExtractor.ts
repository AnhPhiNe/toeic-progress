import { z } from 'zod';
import { backendRequest, apiAvailable } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';

const draftSchema = z.object({
  part: z.number().int().min(1).max(7).nullable(),
  category: z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']),
  questionContext: z.string().min(1).max(4000), userMistake: z.string().max(2000),
  correctAnswer: z.string().max(1000), trapTip: z.string().max(2000),
  options: z.array(z.string().max(1000)).max(4), tags: z.array(z.string().max(50)).max(5),
  missingInformation: z.array(z.string().max(300)).max(8), answerSource: z.enum(['PROVIDED', 'AI_PROPOSED', 'MISSING'])
});
export type AIMistakeParseResult = z.infer<typeof draftSchema>;
export interface AIUsage { remaining: number | null; limit: number | null; guest: boolean; unlimited?: boolean }
export type AIProvider = 'openai' | 'gemini';
export interface AIConfiguration { provider: AIProvider; requireProviderConsent: boolean }

export async function getAIConfiguration(): Promise<AIConfiguration> {
  if (!apiAvailable) throw new Error('AI thật chưa được cấu hình. Bạn có thể nhập thủ công hoặc xem mẫu minh họa.');
  const message = 'Chưa kết nối được AI. Vui lòng thử kết nối lại hoặc nhập thủ công.';
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
  if (!value.ai_configured) throw new Error('AI đang tạm tắt. Bạn vẫn có thể nhập thủ công hoặc xem mẫu minh họa.');
  // Older Gemini deployments have no provider field. This also keeps a rolling
  // frontend/backend deployment compatible without sending unknown JSON fields.
  if (value.ai_provider === undefined) return { provider: 'gemini', requireProviderConsent: false };
  if (value.ai_provider !== 'openai' && value.ai_provider !== 'gemini') throw new Error('Cấu hình AI chưa hợp lệ.');
  return { provider: value.ai_provider, requireProviderConsent: true };
}

export async function getAIUsage(): Promise<AIUsage | null> {
  if (!apiAvailable || !cloud) return null;
  const { data: { session } } = await cloud.auth.getSession();
  if (!session) return null;
  const usage = await backendRequest<AIUsage>('/api/v1/ai/usage', 'GET', undefined, session.user.id);
  const { data: { session: current } } = await cloud.auth.getSession();
  return current?.user.id === session.user.id ? usage : null;
}

export async function extractMistakeWithAI(rawInput: string, getCaptcha: () => Promise<string>, provider?: AIProvider): Promise<{ draft: AIMistakeParseResult; usage: AIUsage }> {
  if (rawInput.trim().length < 20 || rawInput.length > 8000) throw new Error('Dán nội dung từ 20 đến 8.000 ký tự để phân tích.');
  if (!apiAvailable || !cloud) throw new Error('AI thật chưa được cấu hình. Bạn có thể nhập thủ công hoặc xem mẫu minh họa.');
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
    ...(provider ? { provider } : {})
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
      trapTip: `Dịch ngữ cảnh: Bà Watson yêu cầu tất cả báo cáo chi phí được nộp cho phòng kế toán trước 5 giờ chiều thứ Sáu.

Từ vựng/phương án: (A) are: dạng hiện tại của be với chủ ngữ số nhiều; (B) be: động từ nguyên thể; (C) were: dạng quá khứ; (D) will be: dạng tương lai. expense report: báo cáo chi phí; submit: nộp; accounting department: phòng kế toán.

Phân tích: requested that diễn tả yêu cầu, dùng cấu trúc giả định request + that + chủ ngữ + động từ nguyên thể không to. Báo cáo được nộp nên dùng bị động be + submitted (V3). Theo đáp án chuẩn B, be phù hợp. A dễ gây nhầm do reports là số nhiều, nhưng động từ trong mệnh đề giả định không chia theo số ít/số nhiều. C chia quá khứ và D dùng tương lai, đều không theo cấu trúc đang được kiểm tra.

Mẹo 10s: Gặp request that, kiểm tra động từ nguyên thể; nếu chủ ngữ nhận hành động thì dùng be + V3. Đừng chỉ nhìn chủ ngữ số nhiều để chọn are.`,
      options: ['(A) are', '(B) be', '(C) were', '(D) will be'],
      tags: ['subjunctive', 'part5'], missingInformation: [], answerSource: 'PROVIDED'
    }
  };
}
