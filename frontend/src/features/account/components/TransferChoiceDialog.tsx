import { ArrowDownToLine, GitMerge, Smartphone } from 'lucide-react';
import './account.css';

export type TransferChoice = 'merge' | 'account' | 'device';

interface Props {
  error: string;
  accountHasData?: boolean;
  onChoose: (choice: TransferChoice) => void | Promise<unknown>;
  onSkip: () => void | Promise<unknown>;
}

/** Shown after sign-in whenever this device holds guest data, so the learner explicitly confirms any transfer. */
export function TransferChoiceDialog({ error, accountHasData = true, onChoose, onSkip }: Props) {
  return (
    <div className="rd st fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(47,58,51,.55)] p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
      <div className="st-tr">
        <div>
          <h2 id="transfer-title">Chọn dữ liệu để đồng bộ</h2>
          <p className="st-note mt-1">
            {accountHasData
              ? 'Máy này và tài khoản đều có dữ liệu. Nếu chuyển dữ liệu máy vào tài khoản, bản khách trên trình duyệt này sẽ được dọn sạch để tránh trộn sang tài khoản khác.'
              : 'Trình duyệt này đang có dữ liệu chế độ khách, còn tài khoản vừa đăng nhập chưa có dữ liệu. Bạn muốn đưa dữ liệu này vào tài khoản không?'}
          </p>
        </div>
        {error && <p role="alert" className="st-err">{error}</p>}
        <div className="grid gap-2.5">
          <button type="button" autoFocus onClick={() => void onChoose('merge')} className="st-opt st-opt--main">
            <span className="st-ic st-g" aria-hidden="true"><GitMerge size={20} /></span>
            <span>
              <b>{accountHasData ? 'Gộp — khuyên dùng' : 'Chuyển dữ liệu máy này vào tài khoản'}</b>
              <small>{accountHasData
                ? 'Bản cập nhật mới hơn của mỗi mục được giữ; bản khách trên máy được dọn sau khi chuyển.'
                : 'Đưa toàn bộ dữ liệu khách lên tài khoản này và dọn bản khách trên trình duyệt.'}</small>
            </span>
          </button>
          <button type="button" onClick={() => void onChoose('account')} className="st-opt">
            <span className="st-ic st-b" aria-hidden="true"><ArrowDownToLine size={20} /></span>
            <span>
              <b>{accountHasData ? 'Dùng dữ liệu tài khoản' : 'Bắt đầu tài khoản trống'}</b>
              <small>Không nhập dữ liệu máy vào tài khoản này; bản khách vẫn giữ riêng ở chế độ khách.</small>
            </span>
          </button>
          {accountHasData && (
            <button type="button" onClick={() => void onChoose('device')} className="st-opt">
              <span className="st-ic st-y" aria-hidden="true"><Smartphone size={20} /></span>
              <span><b>Dùng dữ liệu máy này</b><small>Thay dữ liệu trên máy chủ bằng bản trên máy và dọn bản khách sau khi chuyển.</small></span>
            </button>
          )}
        </div>
        <button type="button" onClick={() => void onSkip()} className="st-btn st-btn--quiet">Để sau · tiếp tục chế độ khách</button>
      </div>
    </div>
  );
}
