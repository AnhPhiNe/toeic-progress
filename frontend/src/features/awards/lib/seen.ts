import type { Badge } from './badges';

const seenKey = (owner: string | null) => `rd_badges_seen_v1:${owner ?? 'guest'}`;
const visitKey = (owner: string | null) => `rd_awards_visited_v1:${owner ?? 'guest'}`;

/** Badges the learner has not been shown yet; the very first visit marks everything as seen. */
export function unseenBadges(badges: Badge[], owner: string | null): Badge[] {
  try {
    const raw = localStorage.getItem(seenKey(owner));
    if (raw === null) return [];
    const seen = new Set<string>(JSON.parse(raw));
    return badges.filter(b => b.earned && !seen.has(b.id));
  } catch { return []; }
}

export function markBadgesSeen(badges: Badge[], owner: string | null): void {
  try { localStorage.setItem(seenKey(owner), JSON.stringify(badges.filter(b => b.earned).map(b => b.id))); } catch { /* Shown again next time. */ }
}

/** True the first time this learner opens Thành tích on this device (confetti and the star count-up). */
export function isFirstVisit(owner: string | null): boolean {
  try { return localStorage.getItem(visitKey(owner)) === null; } catch { return false; }
}
export function markVisited(owner: string | null): void {
  try { localStorage.setItem(visitKey(owner), '1'); } catch { /* Confetti may repeat; harmless. */ }
}
