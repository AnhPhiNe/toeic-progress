import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertWriteOwner, emptyBundle, OWNER_CHANGED_WRITE_EVENT, OwnerChangedError, runAsOwner, setAccountWriteEnabled,
  StorageWriteError, updateDataBundle, writeDataBundle
} from '@/shared/data/dataBundle';

const values = new Map<string, string>();
const fakeStorage = {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, value); },
  removeItem(key: string) { values.delete(key); },
  clear() { values.clear(); }
};
const GUEST = 'toeic_progress_bundle_v3';
const ALICE = 'toeic_progress_account_alice_v3';
let events: Array<{ type: string; detail: unknown }> = [];

describe('a form opened for one owner never saves into another', () => {
  beforeEach(() => {
    values.clear();
    events = [];
    vi.stubGlobal('localStorage', fakeStorage);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', { dispatchEvent: (event: Event) => { events.push({ type: event.type, detail: (event as CustomEvent).detail }); return true; } });
  });

  afterEach(() => {
    setAccountWriteEnabled(false);
    vi.unstubAllGlobals();
  });

  it('refuses a save after another tab signed out, leaves the guest bundle alone and tells the app', () => {
    values.set('toeic_active_account_v1', 'alice');
    setAccountWriteEnabled(true);
    const owner = 'alice'; // captured when the form opened
    // Another tab signs out: the pointer is gone, the guest bundle is what is shown now.
    values.delete('toeic_active_account_v1');
    values.set(GUEST, JSON.stringify(emptyBundle()));
    const guestBefore = values.get(GUEST);

    let error: unknown;
    try {
      runAsOwner(owner, () => updateDataBundle(bundle => ({ ...bundle, vocabLog: [{ id: 'v', date: '2026-11-22', count: 5, updatedAt: '', deletedAt: null }] })));
    } catch (reason) { error = reason; }
    expect(error).toBeInstanceOf(OwnerChangedError);
    expect(error).toBeInstanceOf(StorageWriteError);
    expect((error as OwnerChangedError).reason).toBe('owner-changed');
    expect((error as Error).message).toBe('Tài khoản đã đăng xuất ở tab khác — thay đổi này chưa được lưu.');
    expect(values.get(GUEST)).toBe(guestBefore);
    expect(values.has(ALICE)).toBe(false);
    expect(events).toEqual([{ type: OWNER_CHANGED_WRITE_EVENT, detail: {
      message: 'Tài khoản đã đăng xuất ở tab khác — thay đổi này chưa được lưu.', expected: 'alice', active: null } }]);
  });

  it('refuses a guest form after another tab signed in, and a switch to a different account', () => {
    values.set('toeic_active_account_v1', 'bob');
    setAccountWriteEnabled(true);
    expect(() => runAsOwner(null, () => writeDataBundle(emptyBundle()))).toThrow('Tài khoản đã thay đổi — thay đổi này chưa được lưu.');
    expect(() => runAsOwner('alice', () => writeDataBundle(emptyBundle()))).toThrow(OwnerChangedError);
    expect(values.has('toeic_progress_account_bob_v3')).toBe(false);
  });

  it('saves normally while the owner is unchanged, and only guards inside the scope', () => {
    values.set('toeic_active_account_v1', 'alice');
    setAccountWriteEnabled(true);
    runAsOwner('alice', () => writeDataBundle(emptyBundle()));
    expect(values.has(ALICE)).toBe(true);
    expect(events.map(event => event.type)).toEqual(['toeic:account-data-changed']);
    values.delete('toeic_active_account_v1');
    expect(() => runAsOwner('alice', () => writeDataBundle(emptyBundle()))).toThrow(OwnerChangedError);
    // Outside a form scope (and after a refused one) writes follow the active owner as before.
    writeDataBundle(emptyBundle());
    expect(values.has(GUEST)).toBe(true);
    expect(runAsOwner(null, () => 7)).toBe(7);
  });

  it('assertWriteOwner passes for the same owner and throws the typed error otherwise', () => {
    expect(() => assertWriteOwner(null)).not.toThrow();
    values.set('toeic_active_account_v1', 'alice');
    expect(() => assertWriteOwner('alice')).not.toThrow();
    expect(() => assertWriteOwner(null)).toThrow(OwnerChangedError);
  });
});
