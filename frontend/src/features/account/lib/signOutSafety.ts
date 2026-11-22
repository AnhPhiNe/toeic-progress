import { ACTIVE_ACCOUNT_KEY, accountBundleKey, readAccountBundle } from '@/shared/data/dataBundle';
import { pendingRecords, readSyncState } from '@/features/account/services/cloud';

/**
 * Records of this account stored on this device that the server has not
 * acknowledged yet. They are lost if the local copy is purged on sign-out.
 * Unreadable local data counts as nothing to keep (it cannot be saved either).
 */
export function unsyncedRecordCount(userId: string): number {
  try {
    const bundle = readAccountBundle(userId);
    return bundle ? pendingRecords(bundle, readSyncState(userId)).length : 0;
  } catch {
    return 0;
  }
}

/**
 * What a `storage` event from another tab means for this tab:
 * 'account' — the active-account pointer changed (sign-in, sign-out, switch);
 * 'data' — the shown account's bundle was written or purged elsewhere;
 * null — unrelated key.
 * `key === null` is localStorage.clear() in another tab.
 */
export function crossTabAccountChange(key: string | null, shownUserId: string | null): 'account' | 'data' | null {
  if (key === null || key === ACTIVE_ACCOUNT_KEY) return 'account';
  if (shownUserId && key === accountBundleKey(shownUserId)) return 'data';
  return null;
}
