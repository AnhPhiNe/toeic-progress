/**
 * AI solved the question to a different option than the page's answer. The page's answer stays until the learner
 * decides, because answer keys on practice sites are sometimes wrong and a card must not teach the wrong option.
 */
export function AnswerDoubtNote({ doubt, current, onSwitch, onKeep }: { doubt: string; current: string; onSwitch: () => void; onKeep: () => void }) {
  const button = 'min-h-9 cursor-pointer rounded-xl border-2 border-[#f0dfb0] bg-white px-3 text-[13px] font-black text-[var(--rd-ink)] shadow-[0_2px_0_#f0dfb0] hover:bg-[#fffaf0]';
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] font-bold text-[#5a4a18]">
      <p className="min-w-0 flex-1"><span className="mr-1.5 rounded-full bg-[#ffe58a] px-2.5 py-0.5 text-[11.5px] font-black text-[#7a5200]">Nghi đáp án</span>
        AI chọn <b>{doubt}</b>, trang đề chọn <b>{current}</b>.</p>
      <span className="flex gap-2">
        <button type="button" onClick={onSwitch} className={button}>Đổi sang {doubt}</button>
        <button type="button" onClick={onKeep} className={button}>Giữ {current}</button>
      </span>
    </div>
  );
}
