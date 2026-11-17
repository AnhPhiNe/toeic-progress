import type { DataBundle } from '@/shared/data/dataBundle';
import { wornGear, type SocGearId } from '@/shared/ui/soc/socGear';
import { computeBadges, totalStars } from './badges';
import { levelProgress, type LevelProgress } from './levels';

export interface SocLook { progress: LevelProgress; worn: SocGearId[] }

/** Level and worn accessories from a learner's data, for any page that shows Sóc. */
export function socLook(bundle: DataBundle, today: string): SocLook {
  const progress = levelProgress(totalStars(computeBadges(bundle, today)));
  return { progress, worn: wornGear(bundle.profile.socGear, progress.level.n) };
}
