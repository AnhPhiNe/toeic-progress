import React from 'react';
import { CloudCheck, CloudOff, RefreshCw, X } from 'lucide-react';
import type { AccountStatus } from '@/features/account/components/AccountPanel';

interface ConnectionBannerProps {
  /** A signed-in account is active on this device */
  accountActive: boolean;
  status: AccountStatus;
  error: string;
  /** A save that failed (not connected, storage full); shown until dismissed */
  writeNotice: string;
  /** Still connecting or syncing (the server may be waking up): calm status, no warning colours */
  connecting?: boolean;
  /** The first request is slow: the free-tier server is probably waking up */
  waking?: boolean;
  /** A save just reached the server: show a brief confirmation */
  savedFlash?: boolean;
  onDismissNotice: () => void;
  onRetry: () => void;
  onUseGuest: () => void;
}

/**
 * Non-blocking connection and save feedback under the top bar. The account's data stays
 * readable while the server wakes up or a sync fails; only saving waits for the connection.
 * Connecting gets no banner: the sync indicator (avatar dot on phones) already shows it, and
 * a banner on every page load pushed the content down.
 */
export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({
  accountActive, status, error, writeNotice, connecting = false, waking = false, savedFlash = false, onDismissNotice, onRetry, onUseGuest
}) => {
  const failed = accountActive && (status === 'error' || status === 'disconnected');
  const calm = !failed && connecting && (waking || Boolean(writeNotice));
  const toast = savedFlash && !failed && !calm && (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-6">
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        <CloudCheck className="h-4 w-4" aria-hidden="true" />Đã lưu và đồng bộ
      </span>
    </div>
  );
  if (!writeNotice && !failed && !calm) return toast || null;

  return (<>
    {toast}
    <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-3 space-y-2">
      {calm && (
        <div role="status" aria-live="polite" className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{waking ? 'Đang kết nối máy chủ… (lần đầu có thể mất khoảng 30 giây)' : 'Đang kết nối tài khoản…'}</p>
            <p className="text-[13px] opacity-90">{writeNotice ? 'Lần lưu vừa rồi chưa được ghi. Hãy lưu lại khi thanh trạng thái báo đã đồng bộ.' : 'Dữ liệu của bạn vẫn lưu trên máy này.'}</p>
          </div>
          {writeNotice && (
            <button type="button" onClick={onDismissNotice} aria-label="Đóng thông báo" className="shrink-0 rounded p-0.5 hover:bg-sky-100 dark:hover:bg-sky-900/50 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {writeNotice && !calm && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border-2 border-amber-400 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{writeNotice}</p>
          <button type="button" onClick={onDismissNotice} aria-label="Đóng thông báo" className="shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {failed && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-amber-400 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-[min(100%,14rem)] flex-1">
            <p className="font-semibold">Dữ liệu vẫn lưu trên máy này. Sẽ đồng bộ khi kết nối lại.</p>
            {error && <p className="text-[13px] opacity-80">{error}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onRetry} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-500 cursor-pointer">Thử lại</button>
            <button type="button" onClick={onUseGuest} className="rounded-lg border border-amber-500 px-3 py-1.5 text-[13px] font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer">Dùng chế độ khách</button>
          </div>
        </div>
      )}
    </div>
  </>);
};
