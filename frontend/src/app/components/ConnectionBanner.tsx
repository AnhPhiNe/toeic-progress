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
      <span className="inline-flex items-center gap-2 rd rounded-full bg-[#46b35a] px-4 py-2 text-sm font-black text-white shadow-[0_4px_0_#2f8a42]">
        <CloudCheck className="h-4 w-4" aria-hidden="true" />Đã lưu và đồng bộ
      </span>
    </div>
  );
  if (!writeNotice && !failed && !calm) return toast || null;

  return (<>
    {toast}
    <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-3 space-y-2">
      {calm && (
        <div role="status" aria-live="polite" className="rd flex items-start gap-2.5 rounded-[18px] bg-[#e6f3fd] px-3.5 py-2.5 text-sm font-bold text-[#136fb3]">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{waking ? 'Đang kết nối máy chủ… (lần đầu có thể mất khoảng 30 giây)' : 'Đang kết nối tài khoản…'}</p>
            <p className="text-[13px] opacity-90">{writeNotice ? 'Lần lưu vừa rồi chưa được ghi. Hãy lưu lại khi thanh trạng thái báo đã đồng bộ.' : 'Dữ liệu của bạn vẫn lưu trên máy này.'}</p>
          </div>
          {writeNotice && (
            <button type="button" onClick={onDismissNotice} aria-label="Đóng thông báo" className="shrink-0 rounded p-0.5 hover:bg-white/60 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {writeNotice && !calm && (
        <div role="alert" className="rd flex items-start gap-2.5 rounded-[18px] bg-[#fff3d1] px-3.5 py-2.5 text-sm font-bold text-[#7a5200]">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{writeNotice}</p>
          <button type="button" onClick={onDismissNotice} aria-label="Đóng thông báo" className="shrink-0 rounded p-0.5 hover:bg-white/60 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {failed && (
        <div role="alert" className="rd flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] bg-[#fff3d1] px-3.5 py-2.5 text-sm font-bold text-[#7a5200]">
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-[min(100%,14rem)] flex-1">
            <p className="font-semibold">Dữ liệu vẫn lưu trên máy này. Sẽ đồng bộ khi kết nối lại.</p>
            {error && <p className="text-[13px] opacity-80">{error}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onRetry} className="rounded-xl bg-[#46b35a] px-3 py-1.5 text-[13px] font-black text-white shadow-[0_3px_0_#2f8a42] hover:brightness-105 active:translate-y-0.5 active:shadow-none cursor-pointer">Thử lại</button>
            <button type="button" onClick={onUseGuest} className="rounded-xl bg-white px-3 py-1.5 text-[13px] font-black text-[#2f3a33] shadow-[0_3px_0_#f0dfa8] hover:brightness-105 cursor-pointer">Dùng chế độ khách</button>
          </div>
        </div>
      )}
    </div>
  </>);
};
