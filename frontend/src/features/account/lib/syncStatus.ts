import type { AccountStatus } from '@/features/account/components/AccountPanel';

/** A request that takes longer than this is treated as "the server is waking up". */
export const SLOW_AFTER_MS = 4_000;
/** Keep retrying a cold start quietly for this long before telling the learner the sync failed. */
export const WAKE_GIVE_UP_MS = 75_000;
const BACKOFF_MS = [2_000, 4_000, 8_000, 12_000, 16_000];

/** Delay before retry number `attempt` (0-based); grows, then stays at the last step. */
export function backoffDelay(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(0, attempt), BACKOFF_MS.length - 1)];
}

/** Network failures, timeouts and 502/503/504 are what a sleeping Render instance looks like. */
export function isWakingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, status, message } = error as { name?: unknown; status?: unknown; message?: unknown };
  if (name === 'NetworkError' || name === 'AuthRetryableFetchError') return true;
  if (typeof status === 'number' && [0, 502, 503, 504].includes(status)) return true;
  return typeof message === 'string' && message.startsWith('Chưa kết nối được backend');
}

/** Retry quietly only for waking errors, and only until WAKE_GIVE_UP_MS after the first failure. */
export function shouldKeepWaking(startedAt: number, now: number, error: unknown): boolean {
  return isWakingError(error) && now - startedAt < WAKE_GIVE_UP_MS;
}

/** "vừa xong", "3 phút trước", ... for the last successful sync. */
export function relativeSynced(at: number | null, now: number): string {
  if (at === null) return '';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'vừa xong';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} phút trước`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} giờ trước` : 'hơn 1 ngày trước';
}

export interface SyncDetail { waking?: boolean; syncedAt?: number | null; now?: number }

/** One reading of the account state, shared by the sidebar, the phone avatar row and the Settings pill. */
export function describeSync(available: boolean, status: AccountStatus, detail: SyncDetail = {}) {
  const localOnly = !available || status === 'guest';
  const waiting = !localOnly && (status === 'loading' || status === 'syncing');
  const waking = waiting && Boolean(detail.waking);
  const failed = !localOnly && (status === 'error' || status === 'disconnected');
  const ago = status === 'synced' && detail.syncedAt != null ? relativeSynced(detail.syncedAt, detail.now ?? Date.now()) : '';
  const label = localOnly ? 'Chỉ lưu trên máy'
    : status === 'synced' ? (ago ? `Đã đồng bộ · ${ago}` : 'Đã đồng bộ')
      : waking ? 'Đang kết nối máy chủ…'
        : status === 'syncing' ? 'Đang đồng bộ…' : status === 'loading' ? 'Đang kết nối…'
          : status === 'choice' ? 'Chọn dữ liệu đồng bộ' : status === 'error' ? 'Đồng bộ lỗi' : 'Chưa kết nối';
  const tone: 'local' | 'wait' | 'warn' | 'ok' = localOnly ? 'local' : failed ? 'warn' : waiting ? 'wait' : 'ok';
  return { localOnly, waiting, waking, failed, label, tone };
}
