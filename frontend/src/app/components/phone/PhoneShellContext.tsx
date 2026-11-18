import { createContext, useContext } from 'react';
import type { SocLook } from '@/features/awards/lib/outfit';
import type { NavTabId } from '@/shared/types';

/** What the phone shell hands to any phone page header (PhoneAvatarButton reads it, pages need no props). */
export interface PhoneShellValue {
  soc: SocLook;
  /** Badges earned but not yet seen (0 while on Thành tích). */
  newBadges: number;
  goTab: (tab: NavTabId) => void;
  openSettings: () => void;
  /** Giải đấu tuần: live line for the avatar sheet row and the 🛡 chip on Hôm nay (goTab('league') opens it). */
  league?: { label: string; chip: string; chipShort: string; chipAria: string };
}

export const PhoneShellContext = createContext<PhoneShellValue | null>(null);

export function usePhoneShell(): PhoneShellValue {
  const value = useContext(PhoneShellContext);
  if (!value) throw new Error('usePhoneShell must be used inside the phone shell');
  return value;
}
