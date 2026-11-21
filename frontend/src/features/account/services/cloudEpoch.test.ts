import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyBundle } from '@/shared/data/dataBundle';

const requests: Array<{ records: Array<{ record_id: string }>; cursor: number }> = [];
let replies: Array<Record<string, unknown>> = [];
vi.mock('@/shared/api/api', () => ({
  backendRequest: vi.fn(async (_path: string, _method: string, body: { records: Array<{ record_id: string }>; cursor: number }) => {
    requests.push(body);
    return replies.shift();
  })
}));
vi.mock('@/shared/api/supabaseClient', () => ({ cloud: null }));
const { exchangeCloudChanges, readSyncState, recordsFromBundle, rememberSync } = await import('@/features/account/services/cloud');

const values = new Map<string, string>();
const stamp = '2026-11-10T00:00:00.000Z';
function bundleWith(count: number) {
  const bundle = emptyBundle();
  bundle.vocabLog = Array.from({ length: count }, (_, n) => ({ id: `v${n}`, date: '2026-11-09', count: 1, updatedAt: stamp, deletedAt: null }));
  return bundle;
}
beforeEach(() => {
  values.clear();
  requests.length = 0;
  replies = [];
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});

describe('server database generation (epoch)', () => {
  it('re-sends every record once, in chunks, when the server was rebuilt', async () => {
    const bundle = bundleWith(1200);
    rememberSync('alice', { cursor: 40, records: recordsFromBundle(bundle), hasRecords: true, epoch: 'old' });
    replies = [{ cursor: 900, records: [], hasRecords: true, epoch: 'new' },
      ...[1, 2, 3].map(() => ({ cursor: 900, records: [], hasRecords: true, epoch: 'new' })),
      { cursor: 901, records: [{ entity_type: 'profile', record_id: 'profile', payload: {}, updated_at: stamp, deleted_at: null }], hasRecords: true, epoch: 'new' }];
    const reply = await exchangeCloudChanges('alice', bundle);
    expect(requests[0].records).toHaveLength(0);
    expect(requests.slice(1, 4).map(r => r.records.length)).toEqual([500, 500, 201]);
    expect(requests.slice(1, 4).every(r => r.cursor === 40)).toBe(true);
    expect(requests[4]).toMatchObject({ records: [], cursor: 0 });
    expect(reply.fullResync).toBe(true);
    rememberSync('alice', reply);
    const state = readSyncState('alice');
    expect(state.epoch).toBe('new');
    expect(Object.keys(state.acknowledged)).toEqual(['profile:profile']);
  });

  it('does nothing extra while the epoch matches or the server sends none', async () => {
    const bundle = bundleWith(3);
    rememberSync('alice', { cursor: 5, records: recordsFromBundle(bundle), hasRecords: true, epoch: 'same' });
    replies = [{ cursor: 5, records: [], hasRecords: true, epoch: 'same' }];
    await exchangeCloudChanges('alice', bundle);
    replies = [{ cursor: 5, records: [], hasRecords: true }];
    await exchangeCloudChanges('alice', bundle);
    expect(requests).toHaveLength(2);
  });

  it('stops at a reset barrier instead of re-sending erased data', async () => {
    const bundle = bundleWith(3);
    rememberSync('alice', { cursor: 5, records: recordsFromBundle(bundle), hasRecords: true, epoch: 'old' });
    replies = [{ cursor: 9, records: [], hasRecords: true, epoch: 'new', resetBarrier: true }];
    const reply = await exchangeCloudChanges('alice', bundle);
    expect(reply.resetBarrier).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('does not send everything twice when nothing was acknowledged yet', async () => {
    replies = [{ cursor: 9, records: [], hasRecords: true, epoch: 'new' }];
    await exchangeCloudChanges('alice', bundleWith(3));
    expect(requests).toHaveLength(1);
    expect(requests[0].records).toHaveLength(4);
  });

  it('chunks large outbound sync payloads and only sets replace on the first chunk', async () => {
    const big = bundleWith(1100);
    replies = [
      { cursor: 0, records: [], hasRecords: false, epoch: 'e1' },
      { cursor: 10, records: [{ entity_type: 'profile', record_id: 'profile', payload: {}, updated_at: stamp, deleted_at: null }], hasRecords: true, epoch: 'e1' },
      { cursor: 11, records: [], hasRecords: true, epoch: 'e1' },
      { cursor: 12, records: [], hasRecords: true, epoch: 'e1' },
      { cursor: 12, records: [{ entity_type: 'profile', record_id: 'profile', payload: {}, updated_at: stamp, deleted_at: null }], hasRecords: true, epoch: 'e1' },
    ];
    await exchangeCloudChanges('alice', big, true, true);
    expect(requests[0].records).toHaveLength(0);
    expect(requests.slice(1, 4).map(r => r.records.length)).toEqual([500, 500, 101]);
    expect((requests[1] as { replace?: boolean }).replace).toBe(true);
    expect((requests[2] as { replace?: boolean }).replace).toBe(false);
    expect((requests[3] as { replace?: boolean }).replace).toBe(false);
    expect(requests[4]).toMatchObject({ records: [], cursor: 0 });
  });
});
