import { useEffect, useState } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import type { GearItem, SocGearId } from '@/shared/ui/soc/socGear';
import { LEVELS } from '../lib/levels';

interface Props {
  level: number;
  item: GearItem;
  /** What Sóc wears right now (without the new item). */
  worn: SocGearId[];
  onWear: () => void;
  onLater: () => void;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const PIECES = Array.from({ length: 18 }, (_, i) => ({ a: i / 18 * Math.PI * 2, c: ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa'][i % 5], r: 90 + (i % 3) * 28 }));

/** One-time gift box when stars cross a level: closed, opens, the item flies onto Sóc, then Đeo luôn / Để sau. */
export function LevelUpGift({ level, item, worn, onWear, onLater }: Props) {
  const [phase, setPhase] = useState<'closed' | 'open' | 'worn'>(() => (reduced() ? 'worn' : 'closed'));
  useEffect(() => {
    if (phase === 'worn') return;
    const t = window.setTimeout(() => setPhase(phase === 'closed' ? 'open' : 'worn'), phase === 'closed' ? 1100 : 1100);
    return () => window.clearTimeout(t);
  }, [phase]);
  const name = LEVELS.find(l => l.n === level)?.name ?? '';
  const gear = phase === 'worn' ? [...worn.filter(id => id !== item.id), item.id] : worn;
  return (
    <div className="awd-gift" role="dialog" aria-modal="true" aria-label={`Lên cấp ${level}`}>
      <div className="awd-gift-card">
        <small>Cấp mới</small>
        <h2>Lên cấp {level}!</h2>
        <p className="awd-gift-lvl">{name}</p>
        <div className="awd-gift-stage">
          <Soc state={phase === 'worn' ? 'cheerD' : 'cheerC'} size={190} gear={gear} className="awd-gift-soc" />
          {phase !== 'worn' && (
            <button type="button" className={'awd-box' + (phase === 'open' ? ' is-open' : '')} onClick={() => setPhase(phase === 'closed' ? 'open' : 'worn')} aria-label="Mở hộp quà">
              <svg viewBox="0 0 120 120" width="128" height="128" aria-hidden="true">
                <rect x="18" y="52" width="84" height="56" rx="8" fill="#ff7a9c" />
                <rect x="54" y="52" width="12" height="56" fill="#ffe58f" />
                <g className="awd-lid"><rect x="12" y="36" width="96" height="22" rx="7" fill="#ff5c7a" /><rect x="54" y="36" width="12" height="22" fill="#ffe58f" />
                  <path d="M60 36 C44 14 28 24 40 34 Z M60 36 C76 14 92 24 80 34 Z" fill="#ffe58f" /></g>
              </svg>
              {phase === 'open' && <span className="awd-item">{item.emoji}</span>}
            </button>
          )}
          {phase === 'open' && PIECES.map((p, i) => (
            <i key={i} className="awd-pop" style={{ background: p.c, ['--tx' as string]: `${Math.cos(p.a) * p.r}px`, ['--ty' as string]: `${Math.sin(p.a) * p.r - 30}px` }} />
          ))}
        </div>
        <p className="awd-gift-say">{phase === 'closed' ? 'Sóc có quà này! Chạm để mở hộp.' : <>Sóc nhận <b>{item.label.toLowerCase()}</b> {item.emoji}</>}</p>
        <div className="awd-gift-btns">
          <button type="button" className="rd-btn" disabled={phase !== 'worn'} onClick={onWear}>Đeo luôn</button>
          <button type="button" className="rd-btn rd-btn--white" disabled={phase !== 'worn'} onClick={onLater}>Để sau</button>
        </div>
      </div>
    </div>
  );
}
