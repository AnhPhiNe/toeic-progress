import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBundle, setAccountWriteEnabled, StorageWriteError, writeDataBundle } from '@/shared/data/dataBundle';

const values = new Map<string, string>();
let full = false;
const fakeStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) {
    if (full) throw new DOMException('quota', 'QuotaExceededError');
    values.set(key, value);
  },
  removeItem(key: string) { values.delete(key); },
  clear() { values.clear(); }
};

describe('saves the learner must be told about', () => {
  beforeEach(() => {
    values.clear();
    full = false;
    vi.stubGlobal('localStorage', fakeStorage);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', { dispatchEvent: () => true });
  });

  afterEach(() => {
    setAccountWriteEnabled(false);
    vi.unstubAllGlobals();
  });

  it('reports a save while the signed-in account is not connected', () => {
    values.set('toeic_active_account_v1', 'user-1');
    setAccountWriteEnabled(false);
    expect(() => writeDataBundle(emptyBundle())).toThrow(StorageWriteError);
  });

  it('reports full browser storage and keeps the previous data', () => {
    writeDataBundle(emptyBundle());
    const before = values.get('toeic_progress_bundle_v3');
    full = true;
    expect(() => writeDataBundle({ ...emptyBundle(), sessions: [] })).toThrow(/Bộ nhớ trình duyệt đã đầy/);
    expect(values.get('toeic_progress_bundle_v3')).toBe(before);
  });
});
