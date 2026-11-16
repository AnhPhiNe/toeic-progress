import { useContext, useEffect, useMemo, useRef } from 'react';
import type { AnimationItem } from 'lottie-web';
import { PhoneShellContext } from '@/app/components/phone';
import { Soc } from '@/shared/ui/soc/Soc';
import { buildFirstStakeAnimation, SIGN, STAKE_H, STAKE_W } from '../lib/firstStakeLottie';
import { firstStakeLine } from '../lib/firstStake';
import './first-stake.css';

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Props {
  score: number;
  stair: { index: number; total: number } | null;
  remaining: number | null;
  target?: number;
  /** Closes the result screen (the card's button first opens Hành trình). */
  onClose: () => void;
  /** 'card' = white card on the phone hero; 'panel' = text on the coloured desktop panel. */
  variant: 'card' | 'panel';
}

/**
 * Celebration for the very first full test: a stake drops onto a small slope (Lottie, built at runtime), Sóc pops up beside it,
 * confetti. Reduced motion: Sóc and a planted stake, no Lottie. lottie-web (light build) is loaded only here.
 */
export function FirstStakeCard({ score, stair, remaining, target, onClose, variant }: Props) {
  const shell = useContext(PhoneShellContext);
  const still = useMemo(reduced, []);
  const host = useRef<HTMLDivElement>(null);
  const data = useMemo(buildFirstStakeAnimation, []);

  useEffect(() => {
    if (still || !host.current) return;
    let anim: AnimationItem | null = null;
    let cancelled = false;
    import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (cancelled || !host.current) return;
      anim = lottie.loadAnimation({ container: host.current, renderer: 'svg', loop: false, autoplay: true, animationData: data });
    }).catch(() => { /* The score and Sóc still show. */ });
    return () => { cancelled = true; anim?.destroy(); };
  }, [still, data]);

  const goJourney = () => { shell?.goTab('history'); onClose(); };

  return (
    <section className={`fsk is-${variant}${still ? ' is-still' : ''}`} aria-label="Cọc đầu tiên">
      <small className="fsk-kick">CỌC ĐẦU TIÊN</small>
      <div className="fsk-stage" style={{ aspectRatio: `${STAKE_W} / ${STAKE_H}` }}>
        {still
          ? <svg className="fsk-static" viewBox={`0 0 ${STAKE_W} ${STAKE_H}`} aria-hidden="true">
              <ellipse cx={STAKE_W * 0.5} cy="222" rx="145" ry="50" fill="#3a9a4d" /><ellipse cx={STAKE_W * 0.54} cy="218" rx="125" ry="45" fill="#5fc472" />
              <rect x={STAKE_W * SIGN.x - 4} y="142" width="8" height="76" rx="3" fill="#b7834f" />
              <rect x={STAKE_W * SIGN.x - 37} y="94" width="74" height="46" rx="9" fill="#ffc83d" />
            </svg>
          : <div ref={host} className="fsk-lottie" aria-hidden="true" />}
        <Soc state="idle" size={104} className="fsk-soc" />
        <b className="fsk-score" style={{ left: `${SIGN.x * 100}%`, top: `${SIGN.y * 100}%`, width: `${SIGN.w * 100}%`, height: `${SIGN.h * 100}%` }}>{score}</b>
      </div>
      <h3>Cắm cọc {score}!</h3>
      <p>{firstStakeLine(stair, remaining, target)}</p>
      <button type="button" className="fsk-go" onClick={goJourney}>Xem hành trình</button>
    </section>
  );
}
