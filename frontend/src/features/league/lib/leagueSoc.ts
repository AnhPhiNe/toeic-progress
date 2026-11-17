import { socMoodSvg } from '@/shared/ui/soc/socSvg';

const cache = new Map<string, string>();

/**
 * Sóc artwork for a league row.
 *
 * COAT HOOK: `coat` is the short colour id stored on the league membership (default "nau-cam").
 * Sóc coat colours are being added to shared/ui/soc in parallel; until that palette lands this
 * ignores `coat` and returns the default look. After the merge, wire the palette in HERE only.
 * The markup is a fixed, trusted template: no learner text ever reaches it.
 */
export function leagueSocSvg(coat: string): string {
  let svg = cache.get(coat);
  if (!svg) {
    svg = socMoodSvg('idle');
    cache.set(coat, svg);
  }
  return svg;
}
