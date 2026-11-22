import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_ACCOUNT_KEY, accountBundleKey, emptyBundle } from '@/shared/data/dataBundle';
import { recordsFromBundle, rememberSync } from '@/features/account/services/cloud';
import { crossTabAccountChange, unsyncedRecordCount } from '@/features/account/lib/signOutSafety';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
});

const store = (id: string, bundle = emptyBundle()) => values.set(accountBundleKey(id), JSON.stringify(bundle));

describe('sign-out warning is based on records the server has not acknowledged', () => {
  it('warns about nothing when every stored record is acknowledged', () => {
    const bundle = emptyBundle();
    store('alice', bundle);
    rememberSync('alice', { cursor: 3, records: recordsFromBundle(bundle), hasRecords: true });
    expect(unsyncedRecordCount('alice')).toBe(0);
  });

  it('counts edits made after the last acknowledged sync, even when no sync is running', () => {
    const bundle = emptyBundle();
    store('alice', bundle);
    rememberSync('alice', { cursor: 3, records: recordsFromBundle(bundle), hasRecords: true });
    bundle.profile = { ...bundle.profile, name: 'Alice edited', updatedAt: '2026-11-22T10:00:00.000Z' };
    bundle.vocabLog = [{ id: 'v1', date: '2026-11-22', count: 5, updatedAt: '2026-11-22T10:00:00.000Z', deletedAt: null }];
    store('alice', bundle);
    expect(unsyncedRecordCount('alice')).toBe(2);
    // A later acknowledgement clears the warning.
    rememberSync('alice', { cursor: 4, records: recordsFromBundle(bundle), hasRecords: true });
    expect(unsyncedRecordCount('alice')).toBe(0);
  });

  it('treats a missing or unreadable local copy as nothing to lose', () => {
    expect(unsyncedRecordCount('nobody')).toBe(0);
    values.set(accountBundleKey('broken'), '{not json');
    expect(unsyncedRecordCount('broken')).toBe(0);
  });
});

describe('cross-tab account changes', () => {
  it('re-checks the account when another tab changes or clears the active pointer', () => {
    expect(crossTabAccountChange(ACTIVE_ACCOUNT_KEY, 'alice')).toBe('account');
    expect(crossTabAccountChange(ACTIVE_ACCOUNT_KEY, null)).toBe('account');
    expect(crossTabAccountChange(null, 'alice')).toBe('account');
  });

  it('refreshes only for the shown account bundle', () => {
    expect(crossTabAccountChange(accountBundleKey('alice'), 'alice')).toBe('data');
    expect(crossTabAccountChange(accountBundleKey('bob'), 'alice')).toBeNull();
    expect(crossTabAccountChange(accountBundleKey('alice'), null)).toBeNull();
    expect(crossTabAccountChange('toeic_pomodoro_settings_v2_alice', 'alice')).toBeNull();
  });
});
