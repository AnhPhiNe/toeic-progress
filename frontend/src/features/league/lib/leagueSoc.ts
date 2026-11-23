import { socMoodSvg } from '@/shared/ui/soc/socSvg';
import { SOC_COATS, isSocCoat } from '@/shared/ui/soc/socCoat';

const cache = new Map<string, string>();

/**
 * The coat to draw for a board row: the member's own coat when it is a known one, otherwise a
 * coat picked from `seed` (the nickname; the app never receives other learners' ids), so rows differ.
 */
export function rowCoat(coat: string, seed = ''): string {
  if (isSocCoat(coat)) return coat;
  let h = 2166136261;
  for (const ch of seed || coat) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return SOC_COATS[(h >>> 0) % SOC_COATS.length].id;
}

/**
 * Sóc artwork for a league row in that learner's coat (and any season gear shown on boards).
 * The markup is a fixed, trusted template: no learner text ever reaches it (the seed only picks a coat).
 */
export function leagueSocSvg(coat: string, seed = '', gear: readonly string[] = []): string {
  const shown = rowCoat(coat, seed);
  const key = `${shown}|${gear.join(',')}`;
  let svg = cache.get(key);
  if (!svg) {
    svg = socMoodSvg('idle', gear, shown);
    cache.set(key, svg);
  }
  return svg;
}
