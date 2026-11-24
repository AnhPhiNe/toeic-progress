import { useEffect, useState } from 'react';
import { DateField } from '@/shared/components/DateField';
import { loadVocabLog } from '@/shared/data/storage';
import { VOCAB_CHIPS, dayMonth, vocabWeek, type VocabEditApi } from './phone/phoneLogLib';

const INK = 'border-2 border-[var(--rd-line)]';

interface Props {
  count: number; setCount: (v: number) => void;
  date: string; setDate: (v: string) => void;
  today: string;
  vocab: VocabEditApi;
}

export const DesktopVocabBody = ({ count, setCount, date, today, vocab }: Props) => {
  const [dateOpen, setDateOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { setConfirmDel(false); }, [date]);
  // Text mirror of the count so the field can be empty while typing.
  const [text, setText] = useState(String(count));
  useEffect(() => { if (Number(text) !== count) setText(String(count)); }, [count]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = (delta: number) => setCount(Math.max(1, (Number(count) || 0) + delta));
 const stepBtn = `grid h-11 w-11 cursor-pointer place-items-center rounded-xl bg-white text-xl font-extrabold text-[var(--rd-ink)] hover:bg-[var(--rd-soft)] disabled:cursor-not-allowed disabled:opacity-40 ${INK}`;
  const [, m, d] = date.split('-');
  const label = `${date === today ? 'Hôm nay, ' : ''}${d}/${m}`;
  const week = vocabWeek(loadVocabLog(), today);
  const maxBar = Math.max(30, ...week.map(day => day.count));
  const dm = dayMonth(date);
  return (
    <div className="space-y-4 text-center">
      <div className="pt-2">
        {vocab.edit && (
          <button type="button" onClick={vocab.onBack} className="mb-1 cursor-pointer text-[13px] font-extrabold text-[var(--rd-violet-d)] hover:underline">‹ Hôm nay</button>
        )}
        <div className="text-[13px] font-bold text-[#5c675f]">{vocab.edit ? `Ngày ${dm} bạn học bao nhiêu từ?` : 'Hôm nay bạn học bao nhiêu từ?'}</div>
        {/* − and + change one word at a time; the number itself can still be typed, and clearing it does not jump to 0 */}
        <div className="mt-2 flex items-center justify-center gap-3.5">
          <button type="button" aria-label="Bớt 1 từ" disabled={(Number(count) || 0) <= 1} onClick={() => step(-1)} className={stepBtn}>−</button>
          <input type="number" min={1} step={1} required inputMode="numeric" aria-label="Số từ đã học" value={text}
            onChange={e => { setText(e.target.value); if (e.target.value !== '') setCount(Number(e.target.value)); }}
            onBlur={() => { if (text === '' || Number(text) < 1) { setText('1'); setCount(1); } }}
            onFocus={e => e.target.select()}
 className={`w-[150px] rounded-2xl bg-white px-4 py-0.5 text-center text-[52px] font-extrabold leading-[1.15] tabular-nums text-[var(--rd-ink)] focus:outline-none focus:ring-[3px] focus:ring-[var(--rd-violet)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${INK}`} />
          <button type="button" aria-label="Thêm 1 từ" onClick={() => step(1)} className={stepBtn}>+</button>
        </div>
        <div className="mt-1 text-base font-bold text-[var(--rd-mut)]">từ</div>
        <div className="mt-3.5 grid grid-cols-4 gap-2" role="group" aria-label="Chọn nhanh số từ">
          {VOCAB_CHIPS.map(n => (
            <button key={n} type="button" aria-pressed={Number(count) === n} onClick={() => setCount(n)}
              className={`cursor-pointer rounded-[10px] py-2 text-[13px] font-extrabold tabular-nums ${Number(count) === n ? "bg-[var(--rd-green)] text-white" : "bg-white text-[var(--rd-ink)] hover:bg-[var(--rd-violet-l)] hover:text-[var(--rd-violet-d)]"} ${INK}`}>
              {n}
            </button>
          ))}
        </div>
        <button type="button" aria-expanded={dateOpen} onClick={() => setDateOpen(o => !o)}
          className="mt-3 cursor-pointer text-xs font-bold text-[#5c675f] hover:text-[var(--rd-ink)]">
          {label} · đổi ngày {dateOpen ? '▴' : '▾'}
        </button>
        {dateOpen && (
          <div className="mt-2">
            <label className="sr-only" htmlFor="vocab-date">Ngày học</label>
            <DateField id="vocab-date" required max={today} value={date} onChange={next => next && vocab.onPick(next)}
              className={`min-w-[164px] rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-[var(--rd-ink)] ${INK}`} />
          </div>
        )}
      </div>
      <div className="text-left">
        <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[var(--rd-mut)]">7 ngày qua · bấm để sửa</p>
        <div className="flex items-end gap-1.5">
          {week.map((day, index) => {
            const on = day.date === date;
            return (
              <button key={day.date} type="button" aria-pressed={on} onClick={() => vocab.onPick(day.date)}
                aria-label={`Ngày ${dayMonth(day.date)}: ${day.count > 0 ? `${day.count} từ` : 'chưa có từ'}`}
                className="flex h-[88px] flex-1 cursor-pointer flex-col items-stretch justify-end gap-1 rounded-lg px-0.5 text-center hover:bg-[var(--rd-violet-l)]">
                <i className={`block rounded-md ${on ? 'bg-[var(--rd-green)]' : 'bg-[var(--rd-violet-l)]'}`} style={{ height: 4 + (day.count / maxBar) * 56 }} />
                <small className={`text-[10.5px] font-extrabold ${on ? 'text-[var(--rd-violet-d)]' : 'text-[var(--rd-mut)]'}`}>
                  {index === 6 ? 'Nay' : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(day.date + 'T00:00:00').getDay()]}
                </small>
              </button>
            );
          })}
        </div>
        {vocab.edit && vocab.existing > 0 && (confirmDel
          ? (
            <div role="group" aria-label="Xác nhận xóa ngày" className="mt-3 text-center text-[13px] font-bold text-[#5c675f]">
              Xóa {vocab.existing} từ của ngày {dm}?
              <div className="mt-1.5 flex justify-center gap-2">
                <button type="button" onClick={() => { setConfirmDel(false); vocab.onDelete(); }}
                  className="cursor-pointer rounded-full bg-[var(--rd-pink-l)] px-4 py-1.5 text-[13px] font-extrabold text-[var(--rd-pink-d)] hover:bg-[var(--rd-pink-l)]">Xóa</button>
                <button type="button" onClick={() => setConfirmDel(false)}
                  className="cursor-pointer rounded-full bg-[var(--rd-soft)] px-4 py-1.5 text-[13px] font-extrabold text-[#5c675f] hover:bg-[#f1f3f1]">Giữ lại</button>
              </div>
            </div>
          )
          : (
            <button type="button" onClick={() => setConfirmDel(true)}
              className="mx-auto mt-4 block cursor-pointer text-[13px] font-bold text-[var(--rd-pink-d)] hover:underline">Xóa ngày này</button>
          ))}
      </div>
      <p className="text-xs text-[var(--rd-mut)]">Ghi riêng theo ngày, không tạo buổi thi hay cộng điểm TOEIC.</p>
    </div>
  );
};
