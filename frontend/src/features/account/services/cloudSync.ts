import type { DataBundle } from '@/shared/data/dataBundle';
import { clearRetiredCopies, consumeTransferredGuestBundle, readAccountBundle, writeAccountBundle } from '@/shared/data/dataBundle';
import { bundleFromRecords, exchangeCloudChanges, rememberSync } from '@/features/account/services/cloud';
import { hasCustomizedProfile, reconcileBundles, type TransferChoice } from '@/shared/data/syncMerge';

export async function finishAccountTransfer(userId: string, device: DataBundle, account: DataBundle, choice: TransferChoice): Promise<void> {
  const selected = reconcileBundles(device, account, choice);
  // A fresh guest profile may have a newer timestamp simply from opening the
  // app. It must not reset the established account's name, goal or exam date.
  if (choice === 'merge' && !hasCustomizedProfile(device)) selected.profile = account.profile;
  if (choice === 'account') {
    writeAccountBundle(userId, account);
    localStorage.removeItem(`toeic_sync_cursor_${userId}_v3`);
    return;
  }
  const reply = await exchangeCloudChanges(userId, selected, choice === 'device', true);
  writeAccountBundle(userId, bundleFromRecords(reply.records));
  rememberSync(userId, reply, true);
  // Consume the browser's guest bundle so signing into a second account later cannot absorb it.
  consumeTransferredGuestBundle();
}

export async function synchronizeAccount(userId: string, shouldApply: () => boolean = () => true): Promise<boolean> {
  const previous = readAccountBundle(userId);
  if (!previous) throw new Error('Chưa khởi tạo dữ liệu tài khoản.');
  const reply = await exchangeCloudChanges(userId, previous);
  if (!shouldApply()) return false;
  const canonical = bundleFromRecords(reply.records);
  const latest = readAccountBundle(userId);
  let final = canonical;
  if (latest && !reply.resetBarrier) {
    // Behind a tombstone purge the reply is the whole set: a record this device had
    // already synced and that the server no longer has was deleted elsewhere.
    final = reconcileBundles(reply.fullSnapshot ? withoutServerDeleted(latest, previous, canonical) : latest, canonical, 'merge');
  }
  writeAccountBundle(userId, final);
  // Advance the cursor only AFTER the account snapshot is saved successfully.
  rememberSync(userId, reply, Boolean(reply.resetBarrier || reply.fullSnapshot));
  if (reply.resetBarrier) clearRetiredCopies(userId);
  return JSON.stringify(previous) !== JSON.stringify(final);
}

const COLLECTIONS = ['sessions', 'mistakes', 'pacingRuns', 'vocabLog', 'shieldDays'] as const;
type Synced = { id: string; updatedAt: string };
/** Drop local records already synced (unchanged since `previous`) that a full server snapshot no longer has. */
export function withoutServerDeleted(latest: DataBundle, previous: DataBundle, canonical: DataBundle): DataBundle {
  const result = { ...latest };
  for (const key of COLLECTIONS) {
    const onServer = new Set((canonical[key] as Synced[]).map(item => item.id));
    const before = new Map((previous[key] as Synced[]).map(item => [item.id, item.updatedAt]));
    (result as unknown as Record<string, Synced[]>)[key] = (latest[key] as Synced[])
      .filter(item => onServer.has(item.id) || before.get(item.id) !== item.updatedAt);
  }
  return result;
}
