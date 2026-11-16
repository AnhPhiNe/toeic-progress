import { PhoneAvatarButton } from '@/app/components/phone';
import type { ReadingPartType, StudySession } from '@/shared/types';

/**
 * Luyện tập on phones (STUB, to be built).
 * Must follow design/previews/mock-phone-practice.html (desktop reference: the bakery sketches
 * behind PracticePage / BakeryChoose / BakeryRun / BakeryDone).
 * While a clock runs, is paused or awaits its result call onFocusChange(true): the shell then hides the bottom nav.
 * Call onFocusChange(false) when back on the chooser.
 */
export interface PracticePhoneProps {
  /** Same data and handlers PracticePage (desktop) receives. */
  sessions: StudySession[];
  initialPart?: ReadingPartType;
  resultDialogBlocked?: boolean;
  onOpenSessionLogger: (prefill?: { sessionType?: 'PART_PRACTICE'; partNumber?: number; durationMinutes?: number }) => void;
  onEditSession: (session: StudySession) => void;
  onSessionsChanged: () => void;
  onOpenPomodoro: () => void;
  onFocusChange: (focus: boolean) => void;
}

export function PracticePhone(_props: PracticePhoneProps) {
  return (
    <div className="rd ph-stub">
      <header><h1>Luyện tập</h1><PhoneAvatarButton /></header>
      <p>Đang xây dựng.</p>
    </div>
  );
}
