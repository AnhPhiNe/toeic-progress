import { describe, expect, it } from 'vitest';
import { emptyBundle, type SyncMeta } from '@/shared/data/dataBundle';
import { mergeRecords, reconcileBundles } from '@/shared/data/syncMerge';

const older = '2026-09-20T00:00:00.000Z';
const newer = '2026-09-21T00:00:00.000Z';

describe('multi-device reconciliation', () => {
  it('keeps the newer version for the same ID', () => {
    const local = [{ id: 'a', count: 5, updatedAt: newer, deletedAt: null }];
    const remote = [{ id: 'a', count: 3, updatedAt: older, deletedAt: null }];
    expect(mergeRecords(local, remote)[0].count).toBe(5);
  });

  it('lets a deletion win an equal timestamp on either device', () => {
    const live: Array<{ id: string } & SyncMeta> = [{ id: 'a', updatedAt: newer, deletedAt: null }];
    const deleted: Array<{ id: string } & SyncMeta> = [{ id: 'a', updatedAt: newer, deletedAt: newer }];
    expect(mergeRecords(live, deleted)[0].deletedAt).toBe(newer);
    expect(mergeRecords(deleted, live)[0].deletedAt).toBe(newer);
  });

  it('merges vocabulary and shields separately and preserves both histories', () => {
    const device = emptyBundle();
    const account = emptyBundle();
    device.vocabLog = [{ id: 'v1', date: '2026-09-20', count: 5, updatedAt: newer, deletedAt: null }];
    account.vocabLog = [{ id: 'v2', date: '2026-09-21', count: 7, updatedAt: older, deletedAt: null }];
    device.shieldDays = [{ id: 'shield:2026-09-20', date: '2026-09-20', updatedAt: older, deletedAt: null }];
    account.shieldDays = [{ id: 'shield:2026-09-21', date: '2026-09-21', updatedAt: newer, deletedAt: null }];
    const result = reconcileBundles(device, account, 'merge');
    expect(result.vocabLog).toHaveLength(2);
    expect(result.shieldDays).toHaveLength(2);
  });

  it('uses the account without mutating guest data when chosen', () => {
    const device = emptyBundle();
    const account = emptyBundle();
    device.profile.name = 'Máy này';
    account.profile.name = 'Tài khoản';
    expect(reconcileBundles(device, account, 'account').profile.name).toBe('Tài khoản');
    expect(device.profile.name).toBe('Máy này');
  });

  it('soft-deletes server-only records when choosing device data', () => {
    const device = emptyBundle();
    const account = emptyBundle();
    account.vocabLog = [{ id: 'vocab:2026-09-20', date: '2026-09-20', count: 8, updatedAt: older, deletedAt: null }];
    const result = reconcileBundles(device, account, 'device', newer);
    expect(result.vocabLog[0].deletedAt).toBe(newer);
    expect(account.vocabLog[0].deletedAt).toBeNull();
  });
});
