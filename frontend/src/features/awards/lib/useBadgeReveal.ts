import { useCallback, useEffect, useState } from 'react';
import type { Badge } from './badges';
import { markBadgesSeen, unseenBadges } from './seen';

/** Queue of newly earned badges for the flip-card reveal; the first visit only marks everything as seen. */
export function useBadgeReveal(badges: Badge[], owner: string | null) {
  const [queue, setQueue] = useState<Badge[]>([]);
  const [flipped, setFlipped] = useState(false);
  /** Badges revealed in this visit: their cell pops in the collection. */
  const [popped, setPopped] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const fresh = unseenBadges(badges, owner);
    if (fresh.length) setQueue(fresh);
    markBadgesSeen(badges, owner);
  }, [badges, owner]);
  useEffect(() => {
    if (!queue.length) return;
    setFlipped(false);
    const t = window.setTimeout(() => setFlipped(true), 450);
    return () => window.clearTimeout(t);
  }, [queue]);

  const next = useCallback(() => setQueue(q => {
    if (q[0]) setPopped(p => new Set(p).add(q[0].id));
    return q.slice(1);
  }), []);
  const show = useCallback((b: Badge) => setQueue([b]), []);
  return { current: queue[0] as Badge | undefined, remaining: Math.max(0, queue.length - 1), flipped, setFlipped, next, show, popped };
}
