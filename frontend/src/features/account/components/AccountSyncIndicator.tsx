import { useState } from 'react';
import { CloudCheck, CloudOff, HardDrive, RefreshCw } from 'lucide-react';
import type { AccountStatus } from './AccountPanel';
import { describeSync } from '@/features/account/lib/syncStatus';

interface Props {
  available: boolean;
  status: AccountStatus;
  waking?: boolean;
  onOpenSettings: () => void;
  onRetry: () => Promise<void>;
}

export { describeSync };

export function AccountSyncIndicator({ available, status, waking, onOpenSettings, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);
  const { localOnly, waiting, failed, label } = describeSync(available, status, { waking });
  const Icon = localOnly ? HardDrive : waiting ? RefreshCw : failed ? CloudOff : CloudCheck;
  const color = failed ? 'text-amber-800 dark:text-amber-300'
    : status === 'synced' && !localOnly ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300';
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  };

  // Trên màn hẹp chỉ còn icon trong cùng hàng với thanh trên; chữ hiện khi đủ rộng.
  return <div className={`flex items-center gap-2 whitespace-nowrap text-xs ${color}`}>
    <div role="status" aria-label="Trạng thái đồng bộ" aria-live="polite" aria-atomic="true">
      <button type="button" onClick={onOpenSettings} aria-label={`Tài khoản và đồng bộ: ${label}`}
        title={label} className="inline-flex min-h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-1 font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-blue-500">
        <Icon className={`h-4 w-4 xl:h-3.5 xl:w-3.5 ${waiting ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
        <span className="hidden xl:inline">{label}</span>
      </button>
    </div>
    {failed && <button type="button" onClick={() => void retry()} disabled={retrying}
      className="min-h-8 rounded-md px-1 font-bold underline disabled:cursor-wait disabled:opacity-50">
      {retrying ? 'Đang thử…' : <><span className="xl:hidden">Thử lại</span><span className="hidden xl:inline">Thử đồng bộ lại</span></>}
    </button>}
  </div>;
}
