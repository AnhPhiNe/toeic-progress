import { apiAvailable, backendRequest } from '@/shared/api/api';
import { cloud } from '@/shared/api/supabaseClient';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import type { AdviceUsage } from '../lib/attemptAdvice';

/**
 * The only place the advice block talks to Supabase and the backend, so the UI can be tested with this
 * module replaced (tests/e2e/test-advice.spec.ts routes it and answers the analyze-attempt URL itself).
 */

/** False when this build has no backend: the advice block is not shown at all. */
export function adviceEnabled(): boolean {
  return apiAvailable;
}

export type AdviceAccount = { kind: 'off' } | { kind: 'guest' } | { kind: 'signed'; owner: string };

/** Advice needs a signed-in (non-anonymous) account whose data is the one on screen. */
export async function adviceAccount(): Promise<AdviceAccount> {
  if (!apiAvailable || !cloud) return { kind: 'off' };
  const { data } = await cloud.auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return { kind: 'guest' };
  return getActiveAccountId() === user.id ? { kind: 'signed', owner: user.id } : { kind: 'off' };
}

export async function readAdviceUsage(owner: string): Promise<AdviceUsage | null> {
  try { return await backendRequest<AdviceUsage>('/api/v1/ai/usage', 'GET', undefined, owner); } catch { return null; }
}

export async function postAnalyzeAttempt(body: unknown, owner: string, isCurrent: () => boolean, cancel: AbortSignal): Promise<{ report: unknown; usage?: AdviceUsage }> {
  return backendRequest('/api/v1/ai/analyze-attempt', 'POST', body, owner, isCurrent, cancel);
}
