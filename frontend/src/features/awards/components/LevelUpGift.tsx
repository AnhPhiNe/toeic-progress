import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnimationItem } from 'lottie-web';
import { Soc, useSocCoat } from '@/shared/ui/soc/Soc';
import { socMoodSvg } from '@/shared/ui/soc/socSvg';
import { gearFragment, type GearItem, type SocGearId } from '@/shared/ui/soc/socGear';
import { LEVELS } from '../lib/levels';
import { buildGiftAnimation } from '../lib/giftLottie';

interface Props {
  level: number;
  item: GearItem;
  /** What Sóc wears right now (without the new item). */
  worn: SocGearId[];
  /** Sóc's name (Tủ đồ); the line reads "Hạt Tiêu nhận khăn quàng". */
  socName?: string;
  onWear: () => void;
  onLater: () => void;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * One-time level-up reveal. A Lottie animation (built at runtime from the real Sóc drawing) plays: the gift box
 * shakes, Sóc pops out and the new item drops onto Sóc. Then the static Sóc wearing it stays with Đeo luôn / Để sau.
 * lottie-web (light build) is loaded only here.
 */
export function LevelUpGift({ level, item, worn, socName = 'Sóc', onWear, onLater }: Props) {
  const [still] = useState(reduced);
  const [done, setDone] = useState(still);
  const host = useRef<HTMLDivElement>(null);
  const coat = useSocCoat();
  // The Lottie Sóc is converted from the real SVG at runtime, so it wears the learner's coat for free.
  const data = useMemo(() => buildGiftAnimation(socMoodSvg('idle', worn.filter(id => id !== item.id), coat), gearFragment(item.id)), [worn, item.id, coat]);

  useEffect(() => {
    if (still || !host.current) return;
    let anim: AnimationItem | null = null;
    let cancelled = false;
    import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (cancelled || !host.current) return;
      const a = lottie.loadAnimation({ container: host.current, renderer: 'svg', loop: false, autoplay: true, animationData: data });
      a.addEventListener('complete', () => setDone(true));
      anim = a;
    }).catch(() => setDone(true));
    return () => { cancelled = true; anim?.destroy(); };
  }, [still, data]);

  const name = LEVELS.find(l => l.n === level)?.name ?? '';
  const gear = [...worn.filter(id => id !== item.id), item.id];
  return (
    <div className="awd-gift" role="dialog" aria-modal="true" aria-label={`Lên cấp ${level}`}>
      <div className="awd-gift-card">
        <small>Cấp mới</small>
        <h2>Lên cấp {level}!</h2>
        <p className="awd-gift-lvl">{name}</p>
        <div className="awd-gift-stage">
          {still
            ? <Soc state="proud" size={190} gear={gear} className="awd-gift-soc" />
            : <div ref={host} className="awd-gift-lottie" aria-hidden="true" />}
        </div>
        <p className="awd-gift-say">{socName} nhận <b>{item.label.toLowerCase()}</b> {item.emoji}</p>
        <div className="awd-gift-btns">
          <button type="button" className="rd-btn" disabled={!done} onClick={onWear}>Đeo luôn</button>
          <button type="button" className="rd-btn rd-btn--white" disabled={!done} onClick={onLater}>Để sau</button>
        </div>
      </div>
    </div>
  );
}
