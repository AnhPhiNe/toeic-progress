import { createPortal } from 'react-dom';
import { Target } from 'lucide-react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';

export function PlanLimitDialog({ onClose }: { onClose: () => void }) {
  const ref = useModalA11y(true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="plan-limit-title" aria-describedby="plan-limit-description" className="plan-task-modal w-full max-w-md space-y-4 rounded-2xl border-2 border-slate-900 bg-white p-5 shadow-[3px_3px_0px_#0f172a] dark:border-slate-300 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <h3 id="plan-limit-title" className="text-base font-black">Đã có 6 mục tiêu đang làm</h3>
        </div>
        <p id="plan-limit-description" className="text-sm text-slate-600 dark:text-slate-300">Hoàn thành hoặc xóa bớt mục tiêu trước khi thêm mới để giữ kế hoạch vừa sức.</p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border-2 border-slate-900 bg-indigo-600 px-4 py-2 text-sm font-bold text-white">Đã hiểu</button>
        </div>
      </div>
    </div>, document.body
  );
}
