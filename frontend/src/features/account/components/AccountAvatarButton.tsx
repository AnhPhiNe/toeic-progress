import type { AccountStatus } from './AccountPanel';
import { describeSync } from './AccountSyncIndicator';

interface Props {
  initials: string;
  available: boolean;
  status: AccountStatus;
  onOpenSettings: () => void;
}

/** Phone top bar: the avatar opens settings, and its dot is the only sync signal that fits there. */
export function AccountAvatarButton({ initials, available, status, onOpenSettings }: Props) {
  const { localOnly, waiting, failed, label } = describeSync(available, status);
  const dot = failed ? 'bg-amber-500' : waiting ? 'bg-sky-400 animate-pulse motion-reduce:animate-none'
    : localOnly ? 'bg-slate-400' : 'bg-emerald-500';
  return (
    <div role="status" aria-label="Trạng thái đồng bộ" aria-live="polite" aria-atomic="true">
      <button type="button" onClick={onOpenSettings} aria-label={`Tài khoản và cài đặt: ${label}`} title={label}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#f1ecff] text-[12px] font-black text-[#7c5ce0] shadow-[0_3px_0_#e0d6fb] outline-none focus-visible:ring-2 focus-visible:ring-[#1c8fe3] cursor-pointer">
        {initials}
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${dot}`} aria-hidden="true" />
      </button>
    </div>
  );
}
