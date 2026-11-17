import { ArrowDownToLine, GitMerge, Smartphone } from 'lucide-react';
import './account.css';

export type TransferChoice = 'merge' | 'account' | 'device';

interface Props {
  error: string;
  onChoose: (choice: TransferChoice) => void | Promise<unknown>;
  onSkip: () => void | Promise<unknown>;
}

/** Shown after sign-in when both this device and the account already hold data. */
export function TransferChoiceDialog({ error, onChoose, onSkip }: Props) {
  return (
    <div className="rd st fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(47,58,51,.55)] p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
      <div className="st-tr">
        <div>
          <h2 id="transfer-title">Chọn dữ liệu để đồng bộ</h2>
          <p className="st-note mt-1">Máy này và tài khoản đều có dữ liệu. Bản dữ liệu khách trên máy luôn được giữ riêng.</p>
        </div>
        {error && <p role="alert" className="st-err">{error}</p>}
        <div className="grid gap-2.5">
          <button type="button" autoFocus onClick={() => void onChoose('merge')} className="st-opt st-opt--main">
            <span className="st-ic st-g" aria-hidden="true"><GitMerge size={20} /></span>
            <span><b>Gộp — khuyên dùng</b><small>Bản cập nhật mới hơn của mỗi mục được giữ.</small></span>
          </button>
          <button type="button" onClick={() => void onChoose('account')} className="st-opt">
            <span className="st-ic st-b" aria-hidden="true"><ArrowDownToLine size={20} /></span>
            <span><b>Dùng dữ liệu tài khoản</b><small>Bỏ qua dữ liệu máy trong tài khoản; bản khách vẫn ở máy.</small></span>
          </button>
          <button type="button" onClick={() => void onChoose('device')} className="st-opt">
            <span className="st-ic st-y" aria-hidden="true"><Smartphone size={20} /></span>
            <span><b>Dùng dữ liệu máy này</b><small>Thay dữ liệu trên máy chủ bằng bản trên máy.</small></span>
          </button>
        </div>
        <button type="button" onClick={() => void onSkip()} className="st-btn st-btn--quiet">Để sau · tiếp tục chế độ khách</button>
      </div>
    </div>
  );
}
