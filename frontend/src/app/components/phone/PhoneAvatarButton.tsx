import { useState } from 'react';
import { ArrowLeftRight, ChevronRight, Settings, Trophy } from 'lucide-react';
import { Soc } from '@/shared/ui/soc/Soc';
import { PhoneSheet } from './PhoneSheet';
import { usePhoneShell } from './PhoneShellContext';
import './phone.css';

/** Round Sóc avatar with the level number; opens the account sheet. Drop it in any phone page header (no props). */
export function PhoneAvatarButton({ className }: { className?: string }) {
  const { soc } = usePhoneShell();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={'rd ph-av' + (className ? ' ' + className : '')} aria-haspopup="dialog" onClick={() => setOpen(true)}
        aria-label={`Hồ sơ của bạn, cấp ${soc.progress.level.n}`}>
        <span className="ph-av__face"><Soc state="idle" size={50} gear={soc.worn} /></span>
        <em>{soc.progress.level.n}</em>
      </button>
      {open && <AvatarSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function AvatarSheet({ onClose }: { onClose: () => void }) {
  const { soc, newBadges, goTab, openSettings } = usePhoneShell();
  const { level, next, stars, toNext, ratio } = soc.progress;
  const go = (run: () => void) => () => { onClose(); run(); };
  return (
    <PhoneSheet title="Hồ sơ" onClose={onClose} hideTitle>
      <div className="ph-lvl">
        <Soc state="idle" size={62} gear={soc.worn} />
        <div>
          <b>Cấp {level.n} · {level.name}</b>
          <small>{next ? `${stars}/${next.stars} sao · còn ${toNext} sao lên cấp ${next.n}` : `${stars} sao · cấp cao nhất`}</small>
          <div className="ph-lvl__bar" role="progressbar" aria-label="Tiến độ lên cấp" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
            <i style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        </div>
      </div>
      <button type="button" className="ph-row" onClick={go(() => goTab('awards'))}>
        <i style={{ background: 'var(--rd-blue)' }}><Trophy size={20} aria-hidden="true" /></i>
        <span><b>Thành tích</b><small>Huy hiệu và đồ cho Sóc</small></span>
        {newBadges > 0 ? <em className="ph-pill">{newBadges} mới</em> : <ChevronRight size={20} className="ph-row__ar" aria-hidden="true" />}
      </button>
      <button type="button" className="ph-row" onClick={go(() => goTab('resources'))}>
        <i style={{ background: '#14b8a6' }}><ArrowLeftRight size={20} aria-hidden="true" /></i>
        <span><b>Quy đổi điểm</b><small>TOEIC, CEFR, IELTS, VSTEP</small></span>
        <ChevronRight size={20} className="ph-row__ar" aria-hidden="true" />
      </button>
      <div className="ph-sep" />
      <button type="button" className="ph-row" onClick={go(openSettings)}>
        <i style={{ background: '#9aa39d' }}><Settings size={20} aria-hidden="true" /></i>
        <span><b>Tài khoản &amp; cài đặt</b><small>Mục tiêu, ngày thi, đồng bộ</small></span>
        <ChevronRight size={20} className="ph-row__ar" aria-hidden="true" />
      </button>
    </PhoneSheet>
  );
}
