import type { DataBundle } from './dataBundle';
import { activateAccount, readAccountBundle, setAccountWriteEnabled, writeAccountBundle } from './dataBundle';
import { applyCloudBundle, fetchCloudBundle } from './cloud';
import { reconcileBundles, type TransferChoice } from './syncMerge';

export async function finishAccountTransfer(userId: string, device: DataBundle, account: DataBundle, choice: TransferChoice): Promise<void> {
  const selected = reconcileBundles(device, account, choice);
  if (choice !== 'account') await applyCloudBundle(selected, choice === 'device');
  const canonical = choice === 'account' ? account : (await fetchCloudBundle(userId)).bundle;
  writeAccountBundle(userId, canonical);
  activateAccount(userId);
  setAccountWriteEnabled(true);
}

export async function synchronizeAccount(userId: string): Promise<boolean> {
  const previous = readAccountBundle(userId);
  const remote = (await fetchCloudBundle(userId)).bundle;
  const merged = previous ? reconcileBundles(previous, remote, 'merge') : remote;
  await applyCloudBundle(merged);
  const canonical = (await fetchCloudBundle(userId)).bundle;
  const latest = readAccountBundle(userId);
  const final = latest ? reconcileBundles(latest, canonical, 'merge') : canonical;
  writeAccountBundle(userId, final);
  activateAccount(userId);
  setAccountWriteEnabled(true);
  return JSON.stringify(previous) !== JSON.stringify(final);
}
