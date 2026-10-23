import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateUUID } from './uuid';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('UUID generation outside a secure context', () => {
  it('uses native UUIDs when available', () => {
    const native = vi.fn(() => '12345678-1234-4123-8123-123456789abc');
    vi.stubGlobal('crypto', { randomUUID: native });
    expect(generateUUID()).toBe('12345678-1234-4123-8123-123456789abc');
    expect(native).toHaveBeenCalledOnce();
  });

  it('uses secure bytes without installing a recursive global polyfill', async () => {
    const secure = vi.fn((bytes: Uint8Array) => { bytes.fill(0); return bytes; });
    const provider = { getRandomValues: secure };
    vi.stubGlobal('crypto', provider);
    vi.stubGlobal('window', { crypto: provider });
    const weak = vi.spyOn(Math, 'random');
    vi.resetModules();
    const imported = await import('./uuid');
    expect(imported.generateUUID()).toBe('00000000-0000-4000-8000-000000000000');
    expect(provider).not.toHaveProperty('randomUUID');
    expect(secure).toHaveBeenCalledOnce();
    expect(weak).not.toHaveBeenCalled();
  });

  it('still uses secure bytes if a native UUID implementation throws or points to this helper', () => {
    const secure = vi.fn((bytes: Uint8Array) => { bytes.fill(0); return bytes; });
    vi.stubGlobal('crypto', { randomUUID: () => { throw new Error('unavailable'); }, getRandomValues: secure });
    expect(generateUUID()).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    vi.stubGlobal('crypto', { randomUUID: generateUUID, getRandomValues: secure });
    expect(generateUUID()).toBe('00000000-0000-4000-8000-000000000000');
    expect(secure).toHaveBeenCalledTimes(2);
  });

  it('returns a valid fallback when no crypto provider exists', () => {
    vi.stubGlobal('crypto', undefined);
    expect(generateUUID()).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  });
});
