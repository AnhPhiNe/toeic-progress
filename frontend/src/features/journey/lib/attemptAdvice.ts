import { z } from 'zod';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { PART_NUMBERS, type PartNumber } from '@/shared/domain/questionNumbers';
import { fullTests, partSize, wrongCountsByPart } from './journeyData';

/**
 * Per-test advice from Sóc ("Sóc nhận xét đề này", design/previews/mock-test-advice.html).
 * The backend (POST /api/v1/ai/analyze-attempt) writes 1–2 priorities; everything else here is local:
 * the request snapshot, the cache, the stale check and the praise line.
 */

const prose = (max: number) => z.string().min(5).max(max).refine(value => !/[<>]|https?:|www\./i.test(value));
export const adviceReportSchema = z.object({
  version: z.literal(2),
  model: z.string().min(1).max(100),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  priorities: z.array(z.object({
    title: prose(120), observation: prose(500), practice: prose(700),
    part: z.number().int().min(1).max(7).nullable(),
    evidenceIds: z.array(z.string().min(1).max(200)).max(5),
    minutes: z.number().int().min(5).max(45)
  }).strict()).min(1).max(2),
  parts: z.array(z.object({
    part: z.number().int().min(1).max(7), correct: z.number().int().min(0).max(54),
    total: z.number().int().min(1).max(54), wrong: z.number().int().min(0).max(54)
  }).strict()).max(7),
  linkedNotes: z.number().int().min(0).max(300),
  sampledNotes: z.number().int().min(0).max(40)
}).strict();
export type AdviceReport = z.infer<typeof adviceReportSchema>;
export type AdvicePriority = AdviceReport['priorities'][number];

export interface AdviceUsage {
  remaining: number | null; limit: number | null; guest: boolean; unlimited?: boolean;
  enabled?: boolean; accessStatus?: 'active' | 'pending' | 'blocked' | 'login_required'; accessMessage?: string;
}

/** Every live note of this attempt, blank drafts included: the backend compares the whole set before spending a turn. */
export function attemptNotes(attempt: StudySession, mistakes: MistakeEntry[]): MistakeEntry[] {
  return mistakes.filter(note => !note.deletedAt && note.sessionId === attempt.id).sort((a, b) => a.id.localeCompare(b.id));
}

export interface AdviceSnapshot { attemptId: string; sessionVersion: string; noteVersions: Record<string, string> }

export function adviceSnapshot(attempt: StudySession, mistakes: MistakeEntry[]): AdviceSnapshot {
  const notes = attemptNotes(attempt, mistakes).slice(0, 300);
  return {
    attemptId: attempt.id,
    sessionVersion: attempt.updatedAt || attempt.createdAt || '',
    noteVersions: Object.fromEntries(notes.map(note => [note.id, note.updatedAt || note.createdAt || '']))
  };
}

/** The request body, exactly the keys the backend accepts. */
export function adviceRequestBody(snapshot: AdviceSnapshot, requestId: string) {
  return { attemptId: snapshot.attemptId, sessionVersion: snapshot.sessionVersion, noteVersions: snapshot.noteVersions,
    request_id: requestId, consent: true as const, provider: 'openai' as const };
}

/** Stable text of attempt + versions; a report is stale once the test or any of its notes changed. */
export function adviceFingerprint(snapshot: AdviceSnapshot): string {
  const notes = Object.keys(snapshot.noteVersions).sort().map(id => [id, snapshot.noteVersions[id]]);
  const text = JSON.stringify([snapshot.attemptId, snapshot.sessionVersion, notes]);
  // FNV-1a, twice with different seeds: short, synchronous and good enough to tell versions apart.
  let a = 0x811c9dc5, b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** A report may only point at this attempt's own notes; anything else is dropped, not shown. */
export function evidenceBelongs(report: AdviceReport, attempt: StudySession, mistakes: MistakeEntry[]): boolean {
  const known = new Set(attemptNotes(attempt, mistakes).map(note => note.id));
  return report.priorities.every(priority => priority.evidenceIds.every(id => known.has(id)));
}

export function parseReport(value: unknown, attempt: StudySession, mistakes: MistakeEntry[]): AdviceReport | null {
  const result = adviceReportSchema.safeParse(value);
  if (!result.success || !evidenceBelongs(result.data, attempt, mistakes)) return null;
  return result.data;
}

// ---------- Cache (per owner, newest first, at most 8 attempts) ----------

export const ADVICE_CACHE_MAX = 8;
export const adviceCacheKey = (owner: string) => `toeic_attempt_advice_${owner}_v2`;
export interface CachedAdvice { attemptId: string; fingerprint: string; generatedAt: string; report: AdviceReport }

function readRows(owner: string): CachedAdvice[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(adviceCacheKey(owner)) || '[]');
    return Array.isArray(rows) ? rows as CachedAdvice[] : [];
  } catch { return []; }
}

export function readAdvice(owner: string, attempt: StudySession): CachedAdvice | null {
  const row = readRows(owner).find(item => item?.attemptId === attempt.id);
  if (!row || typeof row.fingerprint !== 'string' || typeof row.generatedAt !== 'string') return null;
  // Evidence was checked when the report arrived; a note deleted since then only makes the report stale.
  const report = adviceReportSchema.safeParse(row.report);
  return report.success ? { attemptId: row.attemptId, fingerprint: row.fingerprint, generatedAt: row.generatedAt, report: report.data } : null;
}

export function saveAdvice(owner: string, row: CachedAdvice): boolean {
  try {
    const rows = [row, ...readRows(owner).filter(item => item?.attemptId !== row.attemptId)].slice(0, ADVICE_CACHE_MAX);
    localStorage.setItem(adviceCacheKey(owner), JSON.stringify(rows));
    return true;
  } catch { return false; }
}

export const isStale = (cached: CachedAdvice, snapshot: AdviceSnapshot) => cached.fingerprint !== adviceFingerprint(snapshot);

// ---------- Consent (per owner, remembered once ticked) ----------

const consentKey = (owner: string) => `toeic_attempt_advice_consent_${owner}_v1`;
export function hasAdviceConsent(owner: string): boolean {
  try { return localStorage.getItem(consentKey(owner)) === 'openai'; } catch { return false; }
}
export function rememberAdviceConsent(owner: string): void {
  try { localStorage.setItem(consentKey(owner), 'openai'); } catch { /* Asked again next time. */ }
}

// ---------- Praise line (local, never AI) ----------

const GAIN_LABEL = { total: 'Tổng', listening: 'Nghe', reading: 'Đọc' } as const;
/** A Part below this share is not praised as "chắc tay". */
const PRAISE_MIN_PCT = 60;

/**
 * One friendly line from this test's own numbers: the biggest gain over the previous full test
 * (Tổng/Nghe/Đọc), else the strongest Part by share correct. Null when neither applies.
 */
export function praiseLine(session: StudySession, sessions: StudySession[]): string | null {
  const list = fullTests(sessions);
  const at = list.findIndex(s => s.id === session.id);
  const prev = at > 0 ? list[at - 1] : null;
  if (prev) {
    const gains: Array<[keyof typeof GAIN_LABEL, number]> = [
      ['total', (session.totalScore ?? NaN) - (prev.totalScore ?? NaN)],
      ['listening', (session.scaledListening ?? NaN) - (prev.scaledListening ?? NaN)],
      ['reading', (session.scaledReading ?? NaN) - (prev.scaledReading ?? NaN)]
    ];
    let best: [keyof typeof GAIN_LABEL, number] | null = null;
    for (const gain of gains) if (Number.isFinite(gain[1]) && gain[1] > 0 && (!best || gain[1] > best[1])) best = gain;
    if (best) return `${GAIN_LABEL[best[0]]} tăng ${best[1]} so với đề trước`;
  }
  const counts = wrongCountsByPart(session);
  if (!counts) return null;
  let top: { part: PartNumber; correct: number; total: number } | null = null;
  for (const part of PART_NUMBERS) {
    const total = partSize(part), correct = Math.max(0, total - counts[part]);
    if (!top || correct / total > top.correct / top.total) top = { part, correct, total };
  }
  if (!top || top.correct / top.total * 100 < PRAISE_MIN_PCT) return null;
  return `Part ${top.part} đúng ${top.correct}/${top.total}, chắc tay rồi`;
}

// ---------- What to do with a priority ----------

export interface AdviceAction {
  kind: 'timer' | 'notebook';
  part: number | null;
  /** "Bấm giờ Part 7" / "Ôn 9 câu trong Sổ tay" */
  label: string;
  minutes: number;
}

/** Part 5–7 → that Part's bakery timer; anything else → this test's notes in Sổ tay. */
export function adviceAction(priority: AdvicePriority, attempt: StudySession, mistakes: MistakeEntry[]): AdviceAction {
  const part = priority.part;
  if (part === 5 || part === 6 || part === 7) return { kind: 'timer', part, label: `Bấm giờ Part ${part}`, minutes: priority.minutes };
  const notes = attemptNotes(attempt, mistakes).filter(note => part === null || note.part === part).length;
  const label = notes > 0 ? `Ôn ${notes} câu trong Sổ tay` : part ? `Ôn câu sai Part ${part} trong Sổ tay` : 'Ôn câu sai trong Sổ tay';
  return { kind: 'notebook', part, label, minutes: priority.minutes };
}

/** "Part 7: đọc kép" → "Part 7: đọc kép." so the headline reads as Sóc's sentence. */
export function headline(priority: AdvicePriority): string {
  const title = priority.title.trim();
  return /[.!?…]$/.test(title) ? title : `${title}.`;
}

// ---------- Errors ----------

export type AdviceFailure =
  | { kind: 'guest' }
  | { kind: 'access'; message: string }
  | { kind: 'quota' }
  /** Refused or not answered; `kept` when the backend refused before reserving a turn. */
  | { kind: 'refused'; message: string; kept: boolean }
  | { kind: 'failed'; message: string };

interface ErrorLike { status?: number; code?: string; retryAfter?: number; message?: string }

/**
 * Which state an error leads to. Provider failures (ANALYSIS_*) and timeouts happen after the backend
 * reserved a turn; everything else (sync check, total-only test, access, rate limit) is refused before it.
 */
export function classifyAdviceError(error: unknown): AdviceFailure {
  const e = (error && typeof error === 'object' ? error : {}) as ErrorLike;
  const message = typeof e.message === 'string' && e.message ? e.message : 'Chưa nhận được nhận xét.';
  const status = typeof e.status === 'number' ? e.status : 0;
  const code = typeof e.code === 'string' ? e.code : '';
  if (code === 'AI_LOGIN_REQUIRED' || status === 401 || (status === 403 && /đăng nhập/i.test(message))) return { kind: 'guest' };
  if (status === 403) return { kind: 'access', message };
  if (code === 'ANALYSIS_WAIT_SYNC' || status === 409 || status === 422 || status === 404) return { kind: 'refused', message, kept: true };
  if (code.startsWith('ANALYSIS_') || status === 504) return { kind: 'failed', message };
  if (status === 429) return e.retryAfter ? { kind: 'refused', message, kept: true } : { kind: 'quota' };
  // Other statuses are refused before the reservation; without a status (no connection) it is unknown.
  return { kind: 'refused', message, kept: status > 0 };
}

/** "1/12": first day of the month after `today` (YYYY-MM-DD), when monthly turns come back. */
export function nextMonthStart(today: string): string {
  const month = Number(today.slice(5, 7));
  return `1/${month === 12 ? 1 : month + 1}`;
}
