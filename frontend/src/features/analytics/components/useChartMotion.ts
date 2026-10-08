import { useCallback, useRef, useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
const subscribe = (listener: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const snapshot = () => window.matchMedia(query).matches;

/** First appearance is slower; later changes interpolate directly to the next values. */
export function useChartMotion(entranceDuration: number) {
  const reduced = useSyncExternalStore(subscribe, snapshot, () => true);
  const entered = useRef(false);
  // Completion must not rerender the other chart and interrupt its entrance.
  const finish = useCallback(() => { entered.current = true; }, []);
  return { enabled: !reduced, duration: entered.current ? 300 : entranceDuration, finish };
}
