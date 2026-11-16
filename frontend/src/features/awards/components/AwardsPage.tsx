import type { DataBundle } from '@/shared/data/dataBundle';
import type { UserProfile } from '@/shared/types';
import { PHONE_QUERY, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { AwardsDesktop } from './AwardsDesktop';
import { AwardsPhone } from './AwardsPhone';

export { unseenBadges } from '../lib/seen';

interface Props {
  bundle: DataBundle;
  today: string;
  owner: string | null;
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
}

/** Thành tích: the colourful desktop page, or the original shelves on phones. */
export function AwardsPage({ bundle, today, owner, onUpdateProfile }: Props) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  return isPhone
    ? <AwardsPhone bundle={bundle} today={today} owner={owner} onUpdateProfile={onUpdateProfile} />
    : <AwardsDesktop bundle={bundle} today={today} owner={owner} onUpdateProfile={onUpdateProfile} />;
}
