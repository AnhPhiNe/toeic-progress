import { PhoneAvatarButton } from '@/app/components/phone';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { NavTabId, UserProfile } from '@/shared/types';
import type { SocLook } from '@/features/awards/lib/outfit';
import type { TodayTask } from '../lib/todayTasks';

/**
 * Hôm nay on phones (STUB, to be built).
 * Must follow: design/previews/mock-phone-today.html and mock-phone-today-c.html (the approved frame; header + avatar via PhoneAvatarButton).
 * The shell already provides the bottom nav and bottom padding; render a full-height page.
 */
export interface TodayPhoneProps {
  bundle: DataBundle;
  today: string;
  onStartTask: (task: TodayTask) => void;
  onPracticeMore: () => void;
  /** Opens the score logger (full test). */
  onOpenSessionLogger: () => void;
  onOpenSettings: () => void;
  onUpdateProfile: (update: (profile: UserProfile) => UserProfile) => void;
  /** Current streak in days. */
  streak: number;
  /** Mistake cards due today. */
  dueMistakesCount: number;
  soc: SocLook;
  onNavigate: (tab: NavTabId) => void;
}

export function TodayPhone(_props: TodayPhoneProps) {
  return (
    <div className="rd ph-stub">
      <header><h1>Hôm nay</h1><PhoneAvatarButton /></header>
      <p>Đang xây dựng.</p>
    </div>
  );
}
