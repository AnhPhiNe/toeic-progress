import { z } from 'zod';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { backendRequest } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { generateUUID } from '@/shared/domain/uuid';

const prose = (max: number) => z.string().min(5).max(max).refine(value => !/[<>]|https?:|www\./i.test(value));
export const analysisReportSchema = z.object({
  version: z.literal(1), model: z.literal('deepseek-ai/DeepSeek-V4.1-Flash-1017'), signature: z.string().regex(/^[a-f0-9]{64}$/),
  priorities: z.array(z.object({ title: prose(120), observation: prose(500), practice: prose(700),
    part: z.number().int().min(1).max(7).nullable(), evidenceIds: z.array(z.string().min(1).max(200)).max(5), minutes: z.number().int().min(5).max(45) }).strict()).min(1).max(3),
  parts: z.array(z.object({ part: z.number().int().min(1).max(7), correct: z.number().int().min(0).max(54),
    total: z.number().int().min(1).max(54), wrong: z.number().int().min(0).max(54) }).strict()).max(7),
  linkedNotes: z.number().int().min(0).max(300), sampledNotes: z.number().int().min(0).max(40)
}).strict();
export type AttemptAnalysisReport = z.infer<typeof analysisReportSchema>;

/** Full identity, including blank drafts for synchronization checks. Source-only notes never enter this snapshot. */
export function attemptAnalysisInput(attempt: StudySession, mistakes: MistakeEntry[]) {
  const notes = mistakes.filter(note => !note.deletedAt && note.sessionId === attempt.id).sort((a, b) => a.id.localeCompare(b.id));
  return { attempt, notes, noteVersions: Object.fromEntries(notes.map(note => [note.id, note.updatedAt || note.createdAt])),
    sessionVersion: attempt.updatedAt || attempt.createdAt };
}

export async function analysisFingerprint(attempt: StudySession, mistakes: MistakeEntry[]): Promise<string> {
  const input = attemptAnalysisInput(attempt, mistakes);
  const bytes = new TextEncoder().encode(JSON.stringify([input.attempt, input.notes]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

const cacheKey = (owner: string) => `toeic_attempt_advice_${owner}_v1`;
interface CachedAdvice { attemptId: string; fingerprint: string; generatedAt: string; report: AttemptAnalysisReport }
export function readAnalysisCache(owner: string, attemptId: string): CachedAdvice | null {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(cacheKey(owner)) || '[]');
    if (!Array.isArray(rows)) return null;
    const row = rows.find(item => item?.attemptId === attemptId);
    if (!row || !/^[a-f0-9]{64}$/.test(row.fingerprint) || typeof row.generatedAt !== 'string') return null;
    const report = analysisReportSchema.safeParse(row.report);
    return report.success ? { ...row, report: report.data } : null;
  } catch { return null; }
}
export function saveAnalysisCache(owner: string, row: CachedAdvice): boolean {
  if (getActiveAccountId() !== owner) return false;
  try {
    let previous: CachedAdvice[] = [];
    try { const value = JSON.parse(localStorage.getItem(cacheKey(owner)) || '[]'); if (Array.isArray(value)) previous = value; } catch { /* Replace invalid cache. */ }
    localStorage.setItem(cacheKey(owner), JSON.stringify([row, ...previous.filter(item => item?.attemptId !== row.attemptId)].slice(0, 8)));
    return true;
  } catch { return false; }
}
export function clearAnalysisCache(owner: string): void { localStorage.removeItem(cacheKey(owner)); }

export async function analyzeAttempt(attempt: StudySession, mistakes: MistakeEntry[], owner: string, isCurrent: () => boolean): Promise<AttemptAnalysisReport> {
  const current = () => isCurrent() && getActiveAccountId() === owner;
  if (!current()) throw new Error('Đề hoặc tài khoản đã thay đổi. Chưa gửi yêu cầu AI.');
  const session = await cloud?.auth.getSession();
  if (!current()) throw new Error('Đề hoặc tài khoản đã thay đổi. Chưa gửi yêu cầu AI.');
  if (!session?.data.session || session.data.session.user.is_anonymous || session.data.session.user.id !== owner)
    throw new Error('Đăng nhập để phân tích lần làm đã đồng bộ của tài khoản.');
  const { noteVersions, sessionVersion } = attemptAnalysisInput(attempt, mistakes);
  const response = await backendRequest<{ report: unknown }>('/api/v1/ai/analyze-attempt', 'POST', {
    attemptId: attempt.id, sessionVersion, noteVersions, request_id: generateUUID(), consent: true
  }, owner, current);
  if (!current()) throw new Error('Đề hoặc tài khoản đã thay đổi. Kết quả cũ không được mở trong đề mới.');
  const result = analysisReportSchema.safeParse(response.report);
  if (!result.success) throw new Error('Báo cáo AI chưa hợp lệ. Dữ liệu bài thi vẫn được giữ.');
  const known = new Set(attemptAnalysisInput(attempt, mistakes).notes.map(note => note.id));
  if (result.data.priorities.some(priority => priority.evidenceIds.some(id => !known.has(id))))
    throw new Error('Báo cáo AI dẫn câu ngoài lần làm đã chọn. Chưa hiển thị báo cáo.');
  return result.data;
}
