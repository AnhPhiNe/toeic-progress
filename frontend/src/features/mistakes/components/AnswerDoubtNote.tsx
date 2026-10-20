/**
 * AI solved the question to a different option than the page's answer. The page's answer stays until the learner
 * decides, because answer keys on practice sites are sometimes wrong and a card must not teach the wrong option.
 */
export function AnswerDoubtNote({ doubt, current, onSwitch, onKeep }: { doubt: string; current: string; onSwitch: () => void; onKeep: () => void }) {
  const button = 'min-h-9 cursor-pointer rounded-lg border-[1.5px] border-slate-300 bg-white px-3 text-[13px] font-black text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] text-slate-700 dark:text-slate-200">
      <p className="min-w-0 flex-1"><span className="mr-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] font-black text-amber-800 dark:bg-amber-950 dark:text-amber-200">Nghi đáp án</span>
        AI chọn <b>{doubt}</b>, trang đề chọn <b>{current}</b>.</p>
      <span className="flex gap-2">
        <button type="button" onClick={onSwitch} className={button}>Đổi sang {doubt}</button>
        <button type="button" onClick={onKeep} className={button}>Giữ {current}</button>
      </span>
    </div>
  );
}
