import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { StudySession } from '@/shared/types';
import { SuccessMark } from '@/shared/ui/SuccessMark';

const SHOWN_MS = 20_000;

/**
 * Computers: after a test is logged by its wrong questions the form closes and this note offers the next step,
 * so the learner can fill in the questions now or later from the notebook.
 */
export function SavedTestNotice({ session, onDetails, onClose }: { session: StudySession; onDetails: () => void; onClose: () => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, SHOWN_MS);
    return () => window.clearTimeout(timeout);
  }, [session.id, onClose]);
  const wrong = session.wrongQuestions?.length ?? 0;
  return (
    <div role="status" className="fixed bottom-6 right-6 z-40 flex max-w-[calc(100vw-3rem)] items-center gap-3 rounded-2xl border-2 border-slate-900 bg-white py-3 pl-4 pr-2 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
      <SuccessMark />
      <p className="min-w-0 text-[14px] font-bold text-slate-900 dark:text-slate-100">
        Đã lưu <span className="font-black">{session.testName}</span> · {wrong} câu sai vào Sổ tay
      </p>
      <button type="button" onClick={onDetails}
        className="min-h-10 shrink-0 cursor-pointer rounded-xl border-2 border-slate-900 bg-emerald-400 px-4 text-[14px] font-black text-slate-950 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-200 dark:shadow-none">
        Ghi chi tiết ›
      </button>
      <button type="button" aria-label="Đóng thông báo" onClick={onClose}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
