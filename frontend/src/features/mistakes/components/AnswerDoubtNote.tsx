import { AlertTriangle } from 'lucide-react';

/**
 * AI solved the question to a different option than the page's answer. The page's answer stays until the learner
 * decides, because answer keys on practice sites are sometimes wrong and a card must not teach the wrong option.
 */
export function AnswerDoubtNote({ doubt, current, onSwitch, onKeep }: { doubt: string; current: string; onSwitch: () => void; onKeep: () => void }) {
  const button = 'min-h-9 cursor-pointer rounded-lg border-[1.5px] px-3 text-[13px] font-black';
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13.5px] text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <p className="min-w-0 flex-1">AI giải ra <b>{doubt}</b>, khác đáp án trang đề (<b>{current}</b>). Đáp án trang đề có thể bị nhầm.</p>
      <span className="flex gap-2">
        <button type="button" onClick={onSwitch} className={button + ' border-amber-600 bg-amber-500 text-slate-950'}>Đổi sang {doubt}</button>
        <button type="button" onClick={onKeep} className={button + ' border-amber-300 bg-white text-amber-900 dark:bg-slate-900 dark:text-amber-100'}>Giữ {current}</button>
      </span>
    </div>
  );
}
