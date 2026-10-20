import React from 'react';
import { CloudOff, X } from 'lucide-react';
import type { AccountStatus } from '@/features/account/components/AccountPanel';

interface ConnectionBannerProps {
  /** A signed-in account is active on this device */
  accountActive: boolean;
  status: AccountStatus;
  error: string;
  /** A save that failed (not connected, storage full); shown until dismissed */
  writeNotice: string;
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
  accountActive, status, error, writeNotice, onDismissNotice, onRetry, onUseGuest
}) => {
  const failed = accountActive && (status === 'error' || status === 'disconnected');
  if (!writeNotice && !failed) return null;

  return (
    <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-3 space-y-2">
      {writeNotice && (
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
          <p className="min-w-[min(100%,14rem)] flex-1">{error || 'Chưa kết nối tài khoản. Dữ liệu vẫn xem được; kết nối lại để tiếp tục lưu và đồng bộ.'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onRetry} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-500 cursor-pointer">Thử lại</button>
            <button type="button" onClick={onUseGuest} className="rounded-lg border border-amber-500 px-3 py-1.5 text-[13px] font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer">Dùng chế độ khách</button>
          </div>
        </div>
      )}
    </div>
  );
};
