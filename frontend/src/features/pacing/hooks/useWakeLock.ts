import { useEffect } from 'react';

/** Keeps the screen awake while `active` (Mẻ tự do and its breaks), asking again when the tab comes back. Optional: errors are ignored. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null, done = false;
    const request = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (done) void next.release().catch(() => {}); else lock = next;
      } catch { /* not allowed or unsupported: the timer still works */ }
    };
    const visible = () => { if (document.visibilityState === 'visible') void request(); };
    void request();
    document.addEventListener('visibilitychange', visible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', visible);
      if (lock) void lock.release().catch(() => {});
    };
  }, [active]);
}
