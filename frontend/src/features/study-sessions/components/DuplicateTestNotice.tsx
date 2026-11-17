import type { StudySession } from '@/shared/types';
import { getTodayDateString } from '@/shared/data/storage';
import { duplicateDayLabel } from '../lib/duplicateTest';
import './duplicate-notice.css';

/** Shown above the save button (which then reads "Vẫn lưu") when the same test was already logged that day. */
export function DuplicateTestNotice({ session, onOpen }: { session: StudySession; onOpen?: () => void }) {
  const score = session.totalScore ? ` · ${session.totalScore}` : '';
  return (
    <div role="alert" className="rdd">
      <p className="rdd-t">Bạn đã ghi “{session.testName}” {duplicateDayLabel(session.date, getTodayDateString())}{score}</p>
      {onOpen && <button type="button" className="rdd-open" onClick={onOpen}>Mở đề cũ</button>}
    </div>
  );
}
