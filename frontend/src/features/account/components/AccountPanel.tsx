import React, { useState } from 'react';
import { Cloud, LogOut, Mail, RefreshCw, Trash2 } from 'lucide-react';

export type AccountStatus = 'guest' | 'loading' | 'syncing' | 'synced' | 'disconnected' | 'error' | 'choice';

interface Props {
  available: boolean;
  status: AccountStatus;
  email: string | null;
  error: string;
  onGoogle: () => Promise<void>;
  onSendOtp: (email: string) => Promise<boolean>;
  onVerifyOtp: (email: string, token: string) => Promise<void>;
  onRetry: () => void;
  onSignOut: () => Promise<void>;
  onDelete: () => Promise<void>;
}

export const AccountPanel: React.FC<Props> = ({ available, status, email, error, onGoogle, onSendOtp, onVerifyOtp, onRetry, onSignOut, onDelete }) => {
  const [inputEmail, setInputEmail] = useState('');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };
  const sendCode = () => act(async () => setSent(await onSendOtp(inputEmail.trim())));

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-700 dark:bg-slate-900" aria-label="Tài khoản và đồng bộ">
      <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><Cloud size={16} /> Tài khoản và đồng bộ</div>
      {!available ? <p className="text-slate-500 dark:text-slate-400">Đồng bộ chưa được cấu hình. Bạn vẫn dùng chế độ khách và dữ liệu lưu trên máy này.</p>
        : email ? <>
          <p className="text-slate-600 dark:text-slate-300">{email} · {status === 'synced' ? 'Đã đồng bộ' : status === 'syncing' ? 'Đang đồng bộ' : status === 'disconnected' ? 'Chưa kết nối' : status === 'error' ? 'Đồng bộ lỗi' : 'Đang kiểm tra'}</p>
          {error && <p role="alert" className="text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onRetry} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold dark:border-slate-600"><RefreshCw size={13} className="inline mr-1" />Thử đồng bộ lại</button>
            <button type="button" onClick={() => void act(onSignOut)} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold dark:border-slate-600"><LogOut size={13} className="inline mr-1" />Đăng xuất</button>
            <button type="button" onClick={() => void act(onDelete)} disabled={busy} className="rounded-lg px-3 py-2 font-semibold text-rose-600 dark:text-rose-400"><Trash2 size={13} className="inline mr-1" />Xóa tài khoản</button>
          </div>
        </> : <>
          <p className="text-slate-500 dark:text-slate-400">Dùng không cần tài khoản. Đăng nhập chỉ khi bạn muốn đồng bộ giữa các thiết bị.</p>
          {error && <p role="alert" className="text-rose-600 dark:text-rose-400">{error}</p>}
          <button type="button" onClick={() => void act(onGoogle)} disabled={busy} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold dark:border-slate-600 dark:bg-slate-800">Đăng nhập với Google</button>
          {import.meta.env.VITE_ENABLE_EMAIL_OTP === 'true' && <>
          <label className="block font-semibold">Email
            <input type="email" autoComplete="email" value={inputEmail} onChange={event => setInputEmail(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="ban@example.com" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          {sent && <label className="block font-semibold">Mã đăng nhập
            <input inputMode="numeric" autoComplete="one-time-code" value={token} onChange={event => setToken(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>}
          <button type="button" disabled={busy || !inputEmail.trim()} onClick={() => sent ? void act(() => onVerifyOtp(inputEmail.trim(), token.trim())) : void sendCode()} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-50"><Mail size={13} className="inline mr-1" />{sent ? 'Xác nhận mã' : 'Gửi mã qua email'}</button>
          </>}
        </>}
    </section>
  );
};
