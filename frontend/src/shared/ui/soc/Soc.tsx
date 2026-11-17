import { useMemo } from 'react';
import { socMoodSvg, type SocMood, type SocState } from './socSvg';
import './soc.css';

export type { SocMood, SocState };

interface SocProps {
  state?: SocMood;
  /** Rendered width in px; height follows the 240×260 artwork. */
  size?: number;
  className?: string;
  /** Worn accessories (see socGear.ts). */
  gear?: readonly string[];
  /** Spoken label; omit when the mascot is decorative next to its own text. */
  label?: string;
}

/** The approved 2D Sóc mascot. The markup is a fixed, trusted template (no user data). */
export function Soc({ state = 'idle', size = 96, className, label, gear }: SocProps) {
  const gearKey = gear ? gear.join(',') : '';
  const html = useMemo(() => socMoodSvg(state, gearKey ? gearKey.split(',') : undefined), [state, gearKey]);
  return (
    <span
      className={'soc' + (className ? ' ' + className : '')}
      style={{ width: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
