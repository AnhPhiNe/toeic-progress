/**
 * Lightweight safe haptic vibration for mobile micro-interactions.
 * Silently catches and ignores if unsupported or blocked by browser permissions.
 */
export function triggerHaptic(duration: number = 8): void {
  if (typeof window === 'undefined') return;
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(duration);
    }
  } catch {
    // Vibration can fail if user hasn't interacted or if OS permission is disabled
  }
}
