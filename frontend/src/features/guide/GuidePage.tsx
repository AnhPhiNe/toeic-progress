import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { getActiveAccountId } from '@/shared/data/dataBundle';
import { Soc } from '@/shared/ui/soc/Soc';
import type { NavTabId } from '@/shared/types';
import { TIP_IDS, readSeenTips, resetTips } from './lib/guideTips';
import './guide.css';

interface Props {
  onBack: () => void;
  onOpenSessionLogger: () => void;
  onNavigate: (tab: NavTabId) => void;
}

/** "Cách dùng app": three steps, each straight to its place, and a reset for the page tips (mock-guide.html, row 2). */
export function GuidePage({ onBack, onOpenSessionLogger, onNavigate }: Props) {
  const owner = getActiveAccountId();
  const [seen, setSeen] = useState(() => readSeenTips(owner).length);
  const steps = [
    { n: 1, color: 'var(--rd-green)', border: '#d6f0dc', link: 'var(--rd-green-d)', title: 'Làm đề ở đâu cũng được',
      text: <>Xong thì bấm <b>+ Ghi</b>, dán ảnh kết quả. Sóc đọc điểm giúp bạn.</>, go: 'Ghi điểm', run: onOpenSessionLogger },
    { n: 2, color: 'var(--rd-pink)', border: '#ffd9e3', link: '#e0577b', title: 'Chụp trang chữa bài',
      text: 'Câu sai thành thẻ trong Sổ tay, đến hạn thì ôn lại.', go: 'Mở Sổ tay', run: () => onNavigate('mistakes') },
    { n: 3, color: 'var(--rd-violet)', border: '#e6dcff', link: 'var(--rd-violet-d)', title: 'Mỗi ngày mở Hôm nay',
      text: 'Làm việc Sóc gợi ý để giữ chuỗi và leo bậc lên cúp.', go: 'Về Hôm nay', run: () => onNavigate('dashboard') }
  ];

  return (
    <div className="rd gd">
      <div className="gd-in">
        <button type="button" className="gd-back" aria-label="Quay lại" onClick={onBack}><ChevronLeft size={22} strokeWidth={3} aria-hidden="true" /></button>
        <div className="gd-hero">
          <h1>Ba bước<br />là <em>đủ</em></h1>
          <Soc state="idle" size={110} />
        </div>
        <div className="gd-steps">
        {steps.map(s => (
          <button key={s.n} type="button" className="gd-step" style={{ ['--gd-b' as string]: s.border }} onClick={s.run}>
            <span className="gd-n" style={{ background: s.color }} aria-hidden="true">{s.n}</span>
            <span className="gd-step__body">
              <b className="gd-t">{s.title}</b>
              <small>{s.text}</small>
              <span className="gd-go" style={{ color: s.link }}>{s.go} ›</span>
            </span>
          </button>
        ))}
        </div>
        <p className="gd-note">GỢI Ý TRÊN TỪNG TRANG</p>
        <div className="gd-row">
          <div>
            <b>Đã xem {seen}/{TIP_IDS.length} trang</b>
            <small>{seen === 0 ? 'Sóc sẽ chỉ nút chính khi bạn mở trang' : 'Sóc chỉ lại nút chính khi bạn mở trang'}</small>
          </div>
          <button type="button" className="gd-again" disabled={seen === 0} onClick={() => { resetTips(owner); setSeen(0); }}>Xem lại</button>
        </div>
      </div>
    </div>
  );
}
