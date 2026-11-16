/** First-visit welcome moments on Hôm nay (Sóc greets, stairs grow, goal pick, first stake). Sketch: design/previews/mock-welcome.html */

const seenKey = (owner: string | null) => `rd_welcome_seen_v1:${owner ?? 'guest'}`;

export function hasSeenWelcome(owner: string | null): boolean {
  try { return localStorage.getItem(seenKey(owner)) !== null; } catch { return true; }
}
export function markWelcomeSeen(owner: string | null): void {
  try { localStorage.setItem(seenKey(owner), '1'); } catch { /* The greeting may repeat; harmless. */ }
}

/** Learner who has neither a test nor a chosen goal: the goal pick and its animations apply. */
export function isFreshLearner(input: { hasTests: boolean; chosen: boolean }): boolean {
  return !input.hasTests && !input.chosen;
}

/** Sóc greets once per owner, only for a fresh learner who has not seen it yet. */
export function shouldGreet(input: { hasTests: boolean; chosen: boolean; seen: boolean }): boolean {
  return isFreshLearner(input) && !input.seen;
}

export const BUBBLE_MS = 4000;
export const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
