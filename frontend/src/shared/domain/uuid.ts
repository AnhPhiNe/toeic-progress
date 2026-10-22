export type UUIDv4 = `${string}-${string}-${string}-${string}-${string}`;

/**
 * Safe UUID v4 generator with full fallback for both Secure Contexts (HTTPS, localhost)
 * and Non-Secure Contexts (e.g. mobile devices connecting over LAN HTTP: http://192.168.x.x:3000).
 */
export function generateUUID(): UUIDv4 {
  try {
    if (typeof crypto !== 'undefined') {
      if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      if (typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
        return Array.from(bytes, b => b.toString(16).padStart(2, '0'))
          .join('')
          .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') as UUIDv4;
      }
    }
  } catch {
    /* Fallback to Math.random below */
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }) as UUIDv4;
}

// Polyfill window.crypto.randomUUID if absent (such as in non-secure HTTP contexts)
if (typeof window !== 'undefined') {
  try {
    const gCrypto = window.crypto;
    if (gCrypto && typeof gCrypto.randomUUID !== 'function') {
      try {
        (gCrypto as { randomUUID?: () => string }).randomUUID = generateUUID;
      } catch {
        Object.defineProperty(gCrypto, 'randomUUID', {
          value: generateUUID,
          writable: true,
          configurable: true
        });
      }
    }
  } catch {
    /* Ignore if window.crypto is restricted */
  }
}
