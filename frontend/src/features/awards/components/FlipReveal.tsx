import { FAMILY_COLOR, ddmm, type Badge, type BadgeFamily } from '../lib/badges';
import { BadgeIcon } from './BadgeIcon';
import { Soc } from '@/shared/ui/soc/Soc';

const RARITY: Record<string, string> = { b: 'Đồng', s: 'Bạc', g: 'Vàng' };
const DEEP: Record<BadgeFamily, string> = { score: '#e0a400', streak: '#e2701a', effort: '#2f8a42', part: '#136fb3', speed: '#0b8a99', secret: '#7c5ce0' };

interface Props { badge: Badge; remaining: number; flipped: boolean; onFlip: () => void; onNext: () => void }

/** Flip card for a newly earned badge (back = "?", front = the badge). */
export function FlipReveal({ badge, remaining, flipped, onFlip, onNext }: Props) {
  return (
    <div className="aw-flipwrap" role="dialog" aria-modal="true" aria-label={`Huy hiệu mới: ${badge.title}`}>
      <div className={'aw-flip' + (flipped ? ' is-flipped' : '')} onClick={onFlip}>
        <div className="aw-face aw-back"><span>?</span><small>Huy hiệu mới!</small></div>
        <div className="aw-face aw-front" style={{ background: `linear-gradient(160deg, ${FAMILY_COLOR[badge.family]}, ${DEEP[badge.family]})` }}>
          <span className="aw-rar">{badge.family === 'secret' ? 'Bí mật' : `Huy hiệu ${RARITY[badge.tier].toLowerCase()}`}</span>
          <BadgeIcon badge={badge} size={130} />
          <b>{badge.title}</b>
          <small>{badge.how}</small>
          {badge.date && <em>đạt {ddmm(badge.date)}</em>}
          <span className="aw-shine" />
        </div>
      </div>
      <div className="aw-flipbtns">
        <Soc state={flipped ? 'surprised' : 'idle'} size={64} className="aw-flipsoc" />
        {remaining > 0 && <span>còn {remaining} huy hiệu nữa</span>}
        <button type="button" className="rd-btn" onClick={onNext}>{remaining > 0 ? 'Tiếp' : 'Tuyệt!'}</button>
      </div>
    </div>
  );
}
