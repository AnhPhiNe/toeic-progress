import { useCallback, useSyncExternalStore } from 'react';

/** Live result of a CSS media query; read synchronously so the first paint already matches. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Phones get the bottom bar and single-column layouts; matches Tailwind's `md` breakpoint. */
export const PHONE_QUERY = '(max-width: 767px)';
