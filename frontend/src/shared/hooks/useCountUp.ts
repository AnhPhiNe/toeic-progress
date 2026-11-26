import { useEffect, useState } from 'react';

/** Smoothly counts up from 0 to `target` over `durationMs`, honoring reduced-motion preference. */
export function useCountUp(target: number, durationMs = 600): number {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [value, setValue] = useState(() => (reduced || !Number.isFinite(target) ? target : 0));

  useEffect(() => {
    if (!Number.isFinite(target) || reduced) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);

  return value;
}
