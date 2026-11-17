import React, { useState } from 'react';
import { Cloud, LogOut, Mail, RefreshCw, Trash2 } from 'lucide-react';
import './account.css';

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
  showSignOut?: boolean;
}

export const AccountPanel: React.FC<Props> = ({ available, status, email, error, onGoogle, onSendOtp, onVerifyOtp, onRetry, onSignOut, onDelete, showSignOut = true }) => {
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
    <section className="rd st st-group st-acct" aria-label="Tài khoản và đồng bộ">
      <div className="st-acct__top"><span className="st-ic st-b" aria-hidden="true"><Cloud size={18} /></span>Tài khoản và đồng bộ</div>
      {!available ? <p className="st-note">Đồng bộ chưa được cấu hình. Bạn vẫn dùng chế độ khách và dữ liệu lưu trên máy này.</p>
        : email ? <>
          <p className="st-note"><b className="font-black text-[var(--rd-ink)]">{email}</b> · {status === 'synced' ? 'Đã đồng bộ' : status === 'syncing' ? 'Đang đồng bộ' : status === 'disconnected' ? 'Chưa kết nối' : status === 'error' ? 'Đồng bộ lỗi' : 'Đang kiểm tra'}</p>
          {error && <p role="alert" className="st-err">{error}</p>}
          <div className="st-acct__acts">
            <button type="button" onClick={onRetry} disabled={busy} className="st-btn"><RefreshCw size={15} aria-hidden="true" />Thử đồng bộ lại</button>
            {showSignOut && <button type="button" onClick={() => void act(onSignOut)} disabled={busy} className="st-btn"><LogOut size={15} aria-hidden="true" />Đăng xuất</button>}
            <button type="button" onClick={() => void act(onDelete)} disabled={busy} className="st-btn st-btn--quiet st-danger"><Trash2 size={15} aria-hidden="true" />Xóa tài khoản</button>
          </div>
        </> : <>
          <p className="st-note">Dùng không cần tài khoản. Đăng nhập chỉ khi bạn muốn đồng bộ giữa các thiết bị.</p>
          {error && <p role="alert" className="st-err">{error}</p>}
          <button type="button" onClick={() => void act(onGoogle)} disabled={busy} className="st-btn st-btn--wide">Đăng nhập với Google</button>
          {import.meta.env.VITE_ENABLE_EMAIL_OTP === 'true' && <>
          <label className="st-label">Email
            <input type="email" autoComplete="email" value={inputEmail} onChange={event => setInputEmail(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="ban@example.com" className="st-text" />
          </label>
          {sent && <label className="st-label">Mã đăng nhập
            <input inputMode="numeric" autoComplete="one-time-code" value={token} onChange={event => setToken(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} className="st-text" />
          </label>}
          <button type="button" disabled={busy || !inputEmail.trim()} onClick={() => sent ? void act(() => onVerifyOtp(inputEmail.trim(), token.trim())) : void sendCode()} className="st-btn"><Mail size={15} aria-hidden="true" />{sent ? 'Xác nhận mã' : 'Gửi mã qua email'}</button>
          </>}
        </>}
    </section>
  );
};
