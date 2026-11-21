import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), remember: vi.fn() }));
vi.mock('@/features/account/services/cloud', async original => ({ ...await original<typeof import('@/features/account/services/cloud')>(), exchangeCloudChanges: mocks.exchange, rememberSync: mocks.remember }));
import { recordsFromBundle } from '@/features/account/services/cloud';
import { activateAccount, emptyBundle, getActiveAccountId, readAccountBundle, readGuestBundle, writeAccountBundle, writeDataBundle } from '@/shared/data/dataBundle';
import { hasPersonalData } from '@/shared/data/syncMerge';
import { finishAccountTransfer, synchronizeAccount } from '@/features/account/services/cloudSync';

const values = new Map<string, string>();
let failSave = false;
beforeEach(() => {
  values.clear(); failSave = false; vi.clearAllMocks();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    setItem: (key: string, value: string) => { if (failSave) throw new Error('quota'); values.set(key, value); },
    removeItem: (key: string) => values.delete(key)
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('sync persistence boundaries', () => {
  it('does not apply an in-flight reply once reset invalidates it', async () => {
    const before = emptyBundle();
    writeAccountBundle('alice',before);
    mocks.exchange.mockResolvedValue({cursor:2,records:recordsFromBundle(before),hasRecords:true});
    expect(await synchronizeAccount('alice',()=>false)).toBe(false);
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(readAccountBundle('alice')).toEqual(before);
  });
  it('discards stale local content when the server returns a reset barrier', async () => {
    const before = emptyBundle();
    before.vocabLog = [{id:'old-unsynced',date:'2026-10-06',count:123,updatedAt:before.profile.updatedAt,deletedAt:null}];
    writeAccountBundle('alice',before);
    const reset = emptyBundle();
    mocks.exchange.mockResolvedValue({cursor:20,records:recordsFromBundle(reset),hasRecords:true,resetBarrier:true});
    await synchronizeAccount('alice');
    expect(readAccountBundle('alice')?.vocabLog).toEqual([]);
    expect(mocks.remember).toHaveBeenCalledWith('alice',expect.objectContaining({resetBarrier:true}),true);
  });
  it('preserves edits made while a request is in flight', async () => {
    const previous = emptyBundle();
    previous.profile.updatedAt = '2026-10-05T00:00:00.000Z';
    writeAccountBundle('alice', previous);
    mocks.exchange.mockImplementation(async () => {
      writeAccountBundle('alice', { ...previous, profile: { ...previous.profile, name: 'Edited while syncing', updatedAt: '2026-10-05T01:00:00.000Z' } });
      return { cursor: 7, records: recordsFromBundle(previous), hasRecords: true };
    });
    await synchronizeAccount('alice');
    expect(readAccountBundle('alice')?.profile.name).toBe('Edited while syncing');
  });
  it('does not advance a cursor if local persistence fails', async () => {
    const bundle = emptyBundle(); writeAccountBundle('alice', bundle);
    mocks.exchange.mockImplementation(async () => { failSave = true; return { cursor: 8, records: recordsFromBundle(bundle), hasRecords: true }; });
    await expect(synchronizeAccount('alice')).rejects.toThrow('quota');
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(readAccountBundle('alice')).toEqual(bundle);
  });
  it('cannot reactivate an account after the user switched identities', async () => {
    const bundle = emptyBundle(); writeAccountBundle('alice', bundle);
    activateAccount('bob');
    mocks.exchange.mockResolvedValue({ cursor: 9, records: recordsFromBundle(bundle), hasRecords: true });
    await synchronizeAccount('alice');
    expect(getActiveAccountId()).toBe('bob');
  });
  it('does not reset an established account profile when merging a fresh guest', async () => {
    const guest = emptyBundle();
    const account = emptyBundle();
    account.profile = { ...account.profile, name: 'Alice', targetScore: 800, updatedAt: '2026-09-01T00:00:00.000Z' };
    mocks.exchange.mockImplementation(async (_id, bundle) => ({ cursor: 10, records: recordsFromBundle(bundle), hasRecords: true }));
    await finishAccountTransfer('alice', guest, account, 'merge');
    expect(readAccountBundle('alice')?.profile.targetScore).toBe(800);
    expect(readAccountBundle('alice')?.profile.name).toBe('Alice');
  });

  it('consumes the browser guest bundle after transfer so a second account cannot inherit it', async () => {
    const guest = emptyBundle();
    guest.vocabLog = [{ id: 'g1', date: '2026-11-20', count: 15, updatedAt: guest.profile.updatedAt, deletedAt: null }];
    writeDataBundle(guest);
    expect(hasPersonalData(readGuestBundle())).toBe(true);
    mocks.exchange.mockImplementation(async (_id, bundle) => ({ cursor: 11, records: recordsFromBundle(bundle), hasRecords: true }));
    await finishAccountTransfer('alice', guest, emptyBundle(), 'merge');
    expect(readAccountBundle('alice')?.vocabLog).toHaveLength(1);
    expect(hasPersonalData(readGuestBundle())).toBe(false);
    expect(readGuestBundle().vocabLog).toEqual([]);
  });

  it('clears local retired copies and AI caches when receiving a remote reset barrier', async () => {
    const before = emptyBundle();
    writeAccountBundle('alice', before);
    values.set('toeic_attempt_advice_alice_v2', 'stale advice');
    values.set('toeic_explain_tickets_v1', JSON.stringify({ c1: { owner: 'alice', ticket: 't1', expires: 9999999999999 } }));
    mocks.exchange.mockResolvedValue({ cursor: 20, records: recordsFromBundle(emptyBundle()), hasRecords: true, resetBarrier: true });
    await synchronizeAccount('alice');
    expect(values.has('toeic_attempt_advice_alice_v2')).toBe(false);
    expect(values.has('toeic_explain_tickets_v1')).toBe(false);
  });
});
