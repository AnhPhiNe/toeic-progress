import { useState } from 'react';
import { Download } from 'lucide-react';
import { exportDataAsJSON } from '@/shared/data/storage';
import './account.css';

interface Props {
  count: number;
  onStay: () => void;
  onSignOut: () => void;
}

/** Shown when sign-out would remove changes that never reached the server. */
export function SignOutWarningDialog({ count, onStay, onSignOut }: Props) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="rd st fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(47,58,51,.55)] p-4" role="alertdialog" aria-modal="true"
      aria-labelledby="signout-warning-title" aria-describedby="signout-warning-note"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onStay(); } }}>
      <div className="st-tr">
        <div>
          <h2 id="signout-warning-title">Còn {count} thay đổi chưa lưu lên mây</h2>
          <p id="signout-warning-note" className="st-note mt-1">
            Máy chủ chưa nhận được chúng. Đăng xuất bây giờ sẽ xóa chúng khỏi máy này. Tải bản sao lưu để giữ lại nhé.
          </p>
        </div>
        <button type="button" autoFocus className="st-btn st-btn--green st-btn--wide" onClick={() => { exportDataAsJSON(); setSaved(true); }}>
          <Download size={17} aria-hidden="true" />Tải bản sao lưu
        </button>
        {saved && <p role="status" className="st-note">Đã tải bản sao lưu về máy.</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className="st-btn" onClick={onStay}>Ở lại</button>
          <button type="button" className="st-btn st-btn--danger" onClick={onSignOut}>Vẫn đăng xuất</button>
        </div>
      </div>
    </div>
  );
}
