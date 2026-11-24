import { getActiveAccountId, type DataBundle } from '@/shared/data/dataBundle';
import { wornGear, type SocGearId } from '@/shared/ui/soc/socGear';
import { computeBadges, totalStars } from './badges';
import { badgeValues, computeTierBadges, loadBest, tierStars } from './badgeTiers';
import { levelProgress, type LevelProgress } from './levels';

export interface SocLook { progress: LevelProgress; worn: SocGearId[] }

/**
 * Level stars: the 20 tiered badges (Đồng 1 · Bạc 2 · Vàng 3 each), never below what the old 45 badges
 * gave, so moving to the new badges never takes a level (or the gear it unlocked) away.
 */
export function levelStars(bundle: DataBundle, today: string, owner: string | null = getActiveAccountId()): number {
  const legacy = computeBadges(bundle, today);
  return Math.max(totalStars(legacy), tierStars(computeTierBadges(badgeValues(bundle, today), loadBest(owner), legacy)));
}

const OWNED_KEY = (owner: string | null) => `rd_rank_owned_v1:${owner ?? 'guest'}`;

/** Season reward items this learner owns, as last read from Xếp hạng (kept so every page can draw them). */
export function loadOwnedGear(owner: string | null = getActiveAccountId()): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(OWNED_KEY(owner)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
  } catch { return []; }
}
export function saveOwnedGear(owner: string | null, ids: readonly string[]): void {
  try { localStorage.setItem(OWNED_KEY(owner), JSON.stringify([...new Set(ids)])); } catch { /* drawn again after the next load */ }
}

/** Level and worn accessories from a learner's data, for any page that shows Sóc. `owned` = season rewards. */
export function socLook(bundle: DataBundle, today: string, owned: readonly string[] = loadOwnedGear()): SocLook {
  const progress = levelProgress(levelStars(bundle, today));
  return { progress, worn: wornGear(bundle.profile.socGear, progress.level.n, owned) };
}
