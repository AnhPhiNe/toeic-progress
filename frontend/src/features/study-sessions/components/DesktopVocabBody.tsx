import { useState } from 'react';

const INK = 'border-2 border-slate-900 dark:border-slate-300';

interface Props {
  count: number; setCount: (v: number) => void;
  date: string; setDate: (v: string) => void;
  today: string;
}

export const DesktopVocabBody = ({ count, setCount, date, setDate, today }: Props) => {
  const [dateOpen, setDateOpen] = useState(false);
  const [, m, d] = date.split('-');
  const label = `${date === today ? 'Hôm nay, ' : ''}${d}/${m}`;
  return (
    <div className="space-y-4 text-center">
      <div className="pt-2">
        <div className="text-[13px] font-bold text-slate-600 dark:text-slate-300">Hôm nay bạn học bao nhiêu từ?</div>
        <div className="mt-2 inline-flex items-baseline gap-2">
          <input type="number" min={1} step={1} required inputMode="numeric" aria-label="Số từ đã học" value={count}
            onChange={e => setCount(Number(e.target.value))} onFocus={e => e.target.select()}
            className={`w-[170px] rounded-2xl bg-white px-4 py-0.5 text-center text-[56px] font-extrabold leading-[1.15] tabular-nums text-slate-900 focus:outline-none focus:ring-[3px] focus:ring-blue-300 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${INK}`} />
          <span className="text-lg font-bold text-slate-500 dark:text-slate-400">từ</span>
        </div>
        <div className="mt-3.5 grid grid-cols-5 gap-2">
          {[5, 10, 20, 30, 50].map(n => (
            <button key={n} type="button" onClick={() => setCount((Number(count) || 0) + n)}
              className={`cursor-pointer rounded-[10px] bg-white py-2 text-[13px] font-extrabold tabular-nums text-slate-900 hover:bg-blue-100 hover:text-blue-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-blue-900 dark:hover:text-blue-100 ${INK}`}>
              +{n}
            </button>
          ))}
        </div>
        <button type="button" aria-expanded={dateOpen} onClick={() => setDateOpen(o => !o)}
          className="mt-3 cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
          {label} · đổi ngày {dateOpen ? '▴' : '▾'}
        </button>
        {dateOpen && (
          <div className="mt-2">
            <label className="sr-only" htmlFor="vocab-date">Ngày học</label>
            <input id="vocab-date" type="date" required max={today} value={date} onChange={e => setDate(e.target.value)}
              className={`rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 dark:bg-slate-950 dark:text-white ${INK}`} />
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Ghi riêng theo ngày, không tạo buổi thi hay cộng điểm TOEIC.</p>
    </div>
  );
};
