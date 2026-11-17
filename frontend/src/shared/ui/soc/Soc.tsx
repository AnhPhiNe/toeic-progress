import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { socMoodSvg, type SocMood, type SocState } from './socSvg';
import { DEFAULT_COAT, socCoat, type SocCoatId } from './socCoat';
import './soc.css';

export type { SocMood, SocState };

/** The learner's coat (Tủ đồ / welcome); every Sóc below the provider wears it. Outside the app it is Nâu cam. */
export const SocCoatContext = createContext<SocCoatId>(DEFAULT_COAT);
export const useSocCoat = (): SocCoatId => useContext(SocCoatContext);

/** How long a sleeping Sóc stays awake after a tap. */
export const WAKE_MS = 2600;

interface SocProps {
  state?: SocMood;
  /** Rendered width in px; height follows the 240×260 artwork. */
  size?: number;
  className?: string;
  /** Worn accessories (see socGear.ts). */
  gear?: readonly string[];
  /** Coat to draw instead of the learner's (swatch previews, the brand mark). */
  coat?: SocCoatId;
  /** Spoken label; omit when the mascot is decorative next to its own text. */
  label?: string;
  /** While dozing (zzz), Sóc is a button: a tap wakes it up for a moment (Vui), then it dozes off again. */
  wakeable?: boolean;
}

/** The approved 2D Sóc mascot. The markup is a fixed, trusted template (no user data). */
export function Soc({ state = 'idle', size = 96, className, label, gear, coat, wakeable }: SocProps) {
  const learnerCoat = useSocCoat();
  const shownCoat = socCoat(coat ?? learnerCoat).id;
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!awake) return;
    const t = window.setTimeout(() => setAwake(false), WAKE_MS);
    return () => window.clearTimeout(t);
  }, [awake]);
  const sleepy = wakeable && state === 'zzz';
  const mood: SocMood = sleepy && awake ? 'hi' : state;
  const gearKey = gear ? gear.join(',') : '';
  const html = useMemo(() => socMoodSvg(mood, gearKey ? gearKey.split(',') : undefined, shownCoat), [mood, gearKey, shownCoat]);
  const cls = 'soc' + (className ? ' ' + className : '');
  if (sleepy) {
    return (
      <button type="button" className={cls + ' soc-wake'} style={{ width: size }} data-coat={shownCoat} data-mood={mood}
        aria-label={awake ? 'Sóc tỉnh rồi' : 'Sóc đang ngủ gật, chạm để đánh thức'} onClick={() => setAwake(true)}
        dangerouslySetInnerHTML={{ __html: html }} />
    );
  }
  return (
    <span
      className={cls}
      style={{ width: size }}
      data-coat={shownCoat}
      data-mood={mood}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
