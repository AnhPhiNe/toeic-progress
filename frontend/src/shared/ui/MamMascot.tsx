import { useId } from 'react';

/** How far the potted sprout has grown. It follows the best score so far, so it never shrinks when a test goes worse. */
export type MamStage = 'sprout' | 'leaves' | 'lush' | 'bloom';

const INK = '#3A2A1E', MOUTH = '#9C4434', CHEEK = '#FF8F80', ARM = '#DDA263', STEM = '#4E9A4A', SUN = '#F2B93B';

/**
 * Mầm, the app's mascot: a terracotta pot with a face and a plant that grows with the learner's best score.
 * `happy` celebrates with open arms; `calm` smiles quietly, used when a score drops.
 */
export function MamMascot({ mood, stage, className }: { mood: 'happy' | 'calm'; stage: MamStage; className?: string }) {
  const id = useId().replace(/:/g, '');
  const leaf = `mam-leaf-${id}`, leaf2 = `mam-leaf2-${id}`, pot = `mam-pot-${id}`;
  const happy = mood === 'happy';
  return (
    <svg viewBox="0 -14 120 134" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={leaf} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#A6E08F" /><stop offset="1" stopColor="#4C9F55" /></linearGradient>
        <linearGradient id={leaf2} x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9BDA87" /><stop offset="1" stopColor="#3F9450" /></linearGradient>
        <radialGradient id={pot} cx=".35" cy=".3" r=".85"><stop offset="0" stopColor="#FBB596" /><stop offset=".6" stopColor="#EE8B62" /><stop offset="1" stopColor="#D2663F" /></radialGradient>
      </defs>

      {happy
        ? <g transform="translate(60,86) scale(0.82,1) translate(-60,-78)" fill={ARM}>
            <ellipse cx="18" cy="78" rx="6.5" ry="11.5" transform="rotate(62 18 78)" /><ellipse cx="102" cy="78" rx="6.5" ry="11.5" transform="rotate(-62 102 78)" />
          </g>
        : <g transform="translate(60,88) scale(0.84,1) translate(-60,-88)" fill={ARM}>
            <ellipse cx="25" cy="88" rx="6.5" ry="10.5" transform="rotate(-22 25 88)" /><ellipse cx="95" cy="88" rx="6.5" ry="10.5" transform="rotate(22 95 88)" />
          </g>}

      <ellipse cx="60" cy="113" rx="27" ry="4" fill="#2F4A1F" opacity=".1" />
      <path d="M33 66 L87 66 L80.5 106 Q60 112 39.5 106Z" fill={`url(#${pot})`} />
      <rect x="27" y="55" width="66" height="15" rx="7.5" fill="#E8794F" />
      <rect x="33" y="58.5" width="22" height="4" rx="2" fill="#fff" opacity=".38" />
      <ellipse cx="60" cy="56.5" rx="28" ry="4.5" fill="#6E4B30" />
      {stage === 'bloom' && <>
        <path d="M30 62 L90 62" stroke={SUN} strokeWidth="7" strokeLinecap="round" />
        <path d="M78 62 l-6 12 l7 -3 l3 7 l2 -16Z" fill="#E9A21F" /><circle cx="80" cy="62" r="4.5" fill={SUN} />
      </>}

      <g transform="translate(0,6)">
        {happy ? <>
          <path d="M39 80 Q46.5 71 54 80" stroke={INK} strokeWidth="4.2" fill="none" strokeLinecap="round" />
          <path d="M66 80 Q73.5 71 81 80" stroke={INK} strokeWidth="4.2" fill="none" strokeLinecap="round" />
          <ellipse cx="37" cy="90" rx="6.5" ry="4.2" fill={CHEEK} opacity=".55" /><ellipse cx="83" cy="90" rx="6.5" ry="4.2" fill={CHEEK} opacity=".55" />
          <path d="M51 87 Q60 100 69 87 Z" fill={MOUTH} /><ellipse cx="60" cy="94.5" rx="4.5" ry="2.6" fill="#F27C6C" />
        </> : <>
          <ellipse cx="47" cy="79" rx="6.2" ry="7.6" fill={INK} /><ellipse cx="73" cy="79" rx="6.2" ry="7.6" fill={INK} />
          <circle cx="49.2" cy="75.8" r="2.5" fill="#fff" /><circle cx="75.2" cy="75.8" r="2.5" fill="#fff" />
          <circle cx="45" cy="82" r="1.2" fill="#fff" /><circle cx="71" cy="82" r="1.2" fill="#fff" />
          <ellipse cx="36" cy="90" rx="6.5" ry="4.2" fill={CHEEK} opacity=".45" /><ellipse cx="84" cy="90" rx="6.5" ry="4.2" fill={CHEEK} opacity=".45" />
          <path d="M54.5 90 Q60 94.5 65.5 90" stroke={MOUTH} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>}
      </g>

      <g transform="translate(0,13)">
        {stage === 'sprout' ? <>
          <path d="M60 43 Q59 36 61 31" stroke={STEM} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <path d="M61 33 C66 22 80 21 83 28 C75 36 67 36 61 33Z" fill={`url(#${leaf2})`} />
        </> : stage === 'leaves' ? <>
          <path d="M60 44 Q58 32 60 22" stroke={STEM} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <path d="M59 29 C46 13 27 14 21 25 C32 36 49 37 59 29Z" fill={`url(#${leaf})`} />
          <path d="M61 25 C70 6 92 3 101 13 C91 28 73 31 61 25Z" fill={`url(#${leaf2})`} />
        </> : <>
          <path d="M60 44 Q58 26 60 4" stroke={STEM} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <path d="M59 31 C46 15 27 16 21 27 C32 38 49 39 59 31Z" fill={`url(#${leaf})`} />
          <path d="M61 27 C70 8 92 5 101 15 C91 30 73 33 61 27Z" fill={`url(#${leaf2})`} />
          {stage === 'lush' ? <>
            <path d="M60 12 C52 0 40 -2 34 4 C42 14 52 15 60 12Z" fill={`url(#${leaf})`} />
            <path d="M60 8 C66 -4 78 -6 84 -1 C78 9 68 11 60 8Z" fill={`url(#${leaf2})`} />
          </> : <g transform="translate(60,-2)" fill="#FFD36B">
            <circle cx="0" cy="-8" r="6.5" /><circle cx="7.6" cy="-2.5" r="6.5" /><circle cx="4.7" cy="6.5" r="6.5" /><circle cx="-4.7" cy="6.5" r="6.5" /><circle cx="-7.6" cy="-2.5" r="6.5" />
            <circle r="5.5" fill="#F29E4C" />
          </g>}
        </>}
      </g>

      {happy && <g fill={SUN}>
        <circle cx="12" cy="38" r="3" /><circle cx="104" cy="62" r="2.2" />
        <path d="M106 40 l0 8 M102 44 l8 0" stroke={SUN} strokeWidth="2.6" strokeLinecap="round" />
      </g>}
    </svg>
  );
}
