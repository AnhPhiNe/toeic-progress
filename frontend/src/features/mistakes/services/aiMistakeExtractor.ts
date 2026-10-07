import { z } from 'zod';
import { backendRequest, apiAvailable } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';

const draftSchema = z.object({
  part: z.number().int().min(1).max(7).nullable(),
  category: z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']),
  questionContext: z.string().min(1).max(4000), userMistake: z.string().max(2000),
  correctAnswer: z.string().max(1000), trapTip: z.string().max(2000),
  options: z.array(z.string().max(1000)).max(4), tags: z.array(z.string().max(50)).max(5),
  missingInformation: z.array(z.string().max(300)).max(8), answerSource: z.enum(['PROVIDED', 'MISSING'])
});
export type AIMistakeParseResult = z.infer<typeof draftSchema>;
export interface AIUsage { remaining: number | null; limit: number | null; guest: boolean; unlimited?: boolean }

export async function getAIUsage(): Promise<AIUsage | null> {
  if (!apiAvailable || !cloud) return null;
  const { data: { session } } = await cloud.auth.getSession();
  if (!session) return null;
  const usage = await backendRequest<AIUsage>('/api/v1/ai/usage', 'GET', undefined, session.user.id);
  const { data: { session: current } } = await cloud.auth.getSession();
  return current?.user.id === session.user.id ? usage : null;
}

export async function extractMistakeWithAI(rawInput: string, getCaptcha: () => Promise<string>): Promise<{ draft: AIMistakeParseResult; usage: AIUsage }> {
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
    text: rawInput.trim(), request_id: crypto.randomUUID(), consent: true, captcha_token: captchaToken
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
      trapTip: 'Cấu trúc giả định: request + that + chủ ngữ + động từ nguyên thể (be submitted).',
      options: ['(A) are', '(B) be', '(C) were', '(D) will be'],
      tags: ['subjunctive', 'part5'], missingInformation: [], answerSource: 'PROVIDED'
    }
  };
}
