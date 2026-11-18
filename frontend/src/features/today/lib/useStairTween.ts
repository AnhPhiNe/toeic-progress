import { useEffect, useRef, useState } from 'react';

/** How long the stairs take to re-space after the goal changes. */
export const RESPACE_MS = 600;

export const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ease = (t: number) => 1 - (1 - t) ** 3;

/**
 * Stair plate values that glide to their new numbers when the stairs re-space (goal changed): the eight stairs
 * stay put and their labels count over RESPACE_MS. Reduced motion jumps straight to the new values.
 */
export function useStairTween(values: number[]): number[] {
  const [shown, setShown] = useState(values);
  const last = useRef(values);
  const key = values.join(',');
  useEffect(() => {
    const from = last.current;
    const to = values;
    if (from.join(',') === key) return;
    if (from.length !== to.length || reduceMotion() || typeof requestAnimationFrame === 'undefined') {
      last.current = to;
      setShown(to);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / RESPACE_MS);
      const frame = t >= 1 ? to : to.map((v, i) => Math.round(from[i] + (v - from[i]) * ease(t)));
      last.current = frame;
      setShown(frame);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `key` stands for `values` (a new array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown;
}
