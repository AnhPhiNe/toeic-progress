import { PhoneAvatarButton } from '@/app/components/phone';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { MistakeEntry, NavTabId, StudySession, UserProfile } from '@/shared/types';

/**
 * Hành trình on phones (STUB, to be built). Serves tabs 'history' and 'analytics'.
 * Must follow design/previews/mock-phone-journey.html (desktop reference:
 * mock-journey-score3.html, mock-journey-parts4.html, mock-journey-tabs.html).
 * Header carries PhoneAvatarButton. Shell provides bottom nav and bottom padding.
 */
export interface JourneyPhoneProps {
  /** Same data and handlers JourneyPage (desktop) receives. */
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  profile: UserProfile;
  today: string;
  /** 'parts' when the active tab is 'analytics', otherwise 'score'. */
  initialTab: 'score' | 'parts' | 'tests';
  onOpenNotebook: (testName: string, part?: number) => void;
  onPractice: (part: 5 | 6 | 7) => void;
  onEditSession: (session: StudySession) => void;
  onDeleteSession: (id: string) => void;
  onOpenSessionLogger: () => void;
  /** Extras for the phone version. */
  bundle: DataBundle;
  activeTab: NavTabId;
  onNavigate: (tab: NavTabId) => void;
}

export function JourneyPhone(_props: JourneyPhoneProps) {
  return (
    <div className="rd ph-stub">
      <header><h1>Hành trình</h1><PhoneAvatarButton /></header>
      <p>Đang xây dựng.</p>
    </div>
  );
}
