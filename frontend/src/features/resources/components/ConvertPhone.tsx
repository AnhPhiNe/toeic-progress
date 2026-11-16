import { PhoneAvatarButton } from '@/app/components/phone';
import type { StudySession } from '@/shared/types';

/**
 * Quy đổi điểm on phones (STUB, to be built).
 * Must follow design/previews/mock-phone-convert2.html (also mock-phone-convert.html; direction B, no CEFR mini ladder)
 * and the desktop ConvertPage. Header carries PhoneAvatarButton.
 */
export interface ConvertPhoneProps {
  /** Same data ConvertPage (desktop) receives. */
  sessions?: StudySession[];
  /** The learner's goal total; 990 when none is set. */
  targetScore?: number;
  /** What Sóc wears. */
  gear?: readonly string[];
}

export function ConvertPhone(_props: ConvertPhoneProps) {
  return (
    <div className="rd ph-stub">
      <header><h1>Quy đổi điểm</h1><PhoneAvatarButton /></header>
      <p>Đang xây dựng.</p>
    </div>
  );
}
