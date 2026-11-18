import { describe, expect, it } from 'vitest';
import { WAKE_GIVE_UP_MS, backoffDelay, describeSync, isWakingError, relativeSynced, shouldKeepWaking } from '@/features/account/lib/syncStatus';

describe('backoffDelay', () => {
  it('grows and then holds at the last step', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(backoffDelay)).toEqual([2000, 4000, 8000, 12000, 16000, 16000, 16000]);
  });
  it('makes a sensible number of quiet attempts within the give-up window', () => {
    let elapsed = 0; let attempts = 0;
    while (elapsed < WAKE_GIVE_UP_MS) { elapsed += backoffDelay(attempts++); }
    expect(attempts).toBeGreaterThanOrEqual(5);
    expect(attempts).toBeLessThanOrEqual(8);
  });
});

describe('isWakingError / shouldKeepWaking', () => {
  const http = (status: number) => Object.assign(new Error('x'), { status });
  it('treats network failures and 502/503/504 as a waking server', () => {
    expect(isWakingError(Object.assign(new Error('x'), { name: 'NetworkError' }))).toBe(true);
    expect(isWakingError(http(502))).toBe(true);
    expect(isWakingError(http(503))).toBe(true);
    expect(isWakingError(http(504))).toBe(true);
  });
  it('does not hide real errors', () => {
    expect(isWakingError(http(401))).toBe(false);
    expect(isWakingError(http(422))).toBe(false);
    expect(isWakingError(new Error('Phản hồi đồng bộ không hợp lệ.'))).toBe(false);
    expect(isWakingError(null)).toBe(false);
  });
  it('stops retrying quietly after 75 seconds', () => {
    const err = http(503);
    expect(shouldKeepWaking(1000, 1000 + 74_000, err)).toBe(true);
    expect(shouldKeepWaking(1000, 1000 + 75_000, err)).toBe(false);
    expect(shouldKeepWaking(1000, 2000, http(401))).toBe(false);
  });
});

describe('relativeSynced', () => {
  it('reads naturally', () => {
    expect(relativeSynced(null, 0)).toBe('');
    expect(relativeSynced(0, 10_000)).toBe('vừa xong');
    expect(relativeSynced(0, 120_000)).toBe('2 phút trước');
    expect(relativeSynced(0, 3 * 3_600_000)).toBe('3 giờ trước');
  });
});

describe('describeSync', () => {
  it('shows syncing with an ellipsis and a wait tone', () => {
    expect(describeSync(true, 'syncing')).toMatchObject({ label: 'Đang đồng bộ…', tone: 'wait', waiting: true, failed: false });
  });
  it('names the cold start only once the request is slow', () => {
    expect(describeSync(true, 'loading').label).toBe('Đang kết nối…');
    expect(describeSync(true, 'loading', { waking: true })).toMatchObject({ label: 'Đang kết nối máy chủ…', tone: 'wait', waking: true });
  });
  it('shows relative time after a sync, and amber only on a real failure', () => {
    expect(describeSync(true, 'synced', { syncedAt: 0, now: 5000 })).toMatchObject({ label: 'Đã đồng bộ · vừa xong', tone: 'ok' });
    expect(describeSync(true, 'error')).toMatchObject({ tone: 'warn', failed: true });
    expect(describeSync(true, 'disconnected').tone).toBe('warn');
  });
  it('guests stay local', () => {
    expect(describeSync(false, 'guest')).toMatchObject({ label: 'Chỉ lưu trên máy', tone: 'local' });
  });
});
