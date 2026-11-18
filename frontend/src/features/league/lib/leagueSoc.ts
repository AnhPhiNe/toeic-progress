import { socMoodSvg } from '@/shared/ui/soc/socSvg';

const cache = new Map<string, string>();

/**
 * Sóc artwork for a league row in that learner's coat. Unknown ids (e.g. the server default "nau-cam")
 * fall back to Nâu cam. The markup is a fixed, trusted template: no learner text ever reaches it.
 */
export function leagueSocSvg(coat: string): string {
  let svg = cache.get(coat);
  if (!svg) {
    svg = socMoodSvg('idle', undefined, coat);
    cache.set(coat, svg);
  }
  return svg;
}
