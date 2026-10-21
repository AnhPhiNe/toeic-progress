import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/app/components/MobileNav';
import type { NavTabId } from '@/shared/types';
import { ReviewSegmentedControl } from '@/features/mistakes/components/ReviewSegmentedControl';
import { formatVocabDate, summarizeVocabDays, vocabDayIndex, type VocabDay } from '../lib/vocabularyModel';

interface Props {
  today: string;
  days: VocabDay[];
  total: number;
  date: string;
  count: string;
  existing: VocabDay | undefined;
  saved: boolean;
  error: string;
  feedback: string;
  dueMistakesCount?: number;
  totalMistakesCount?: number;
  onNavigateTab?: (tab: NavTabId) => void;
  onDate: (date: string) => void;
  onCount: (count: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onEdit: (day: VocabDay) => void;
  onDelete?: (day: VocabDay) => void;
}

const PRESETS = [10, 20, 30, 50];
const STEP = 5;
const HISTORY_STEP = 10;
const dayFromIndex = (index: number) => new Date(index * 86400000).toISOString().slice(0, 10);
const shortDate = (date: string) => formatVocabDate(date).slice(0, 5);

/** Phones answer "how many words today?": one big count with −/+ and presets, a small 14-day strip, history in a sheet. */
export function PhoneVocabulary({ today, days, total, date, count, existing, saved, error, feedback, dueMistakesCount, totalMistakesCount, onNavigateTab, onDate, onCount, onSubmit, onEdit, onDelete }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shown, setShown] = useState(HISTORY_STEP);
  const value = Number(count);
  const valid = count.trim() !== '' && Number.isInteger(value) && value >= 1;
  const step = (delta: number) => onCount(String(Math.max(1, Math.min(10000, (valid ? value : 0) + delta))));

  const recent = useMemo(() => {
    const last = vocabDayIndex(today), byDate = new Map(days.map(day => [day.date, day.count]));
    return Array.from({ length: 14 }, (_, offset) => { const day = dayFromIndex(last - 13 + offset); return { date: day, count: byDate.get(day) ?? 0 }; });
  }, [days, today]);
  const recentDays = useMemo(() => days.filter(day => day.date >= recent[0].date && day.date <= today), [days, recent, today]);
  const summary = summarizeVocabDays(recentDays);
  const highest = Math.max(1, ...recent.map(day => day.count));
  const history = useMemo(() => [...days].reverse(), [days]);

  return <div className="vocabulary-view space-y-4 pb-24">
    {onNavigateTab && (
      <ReviewSegmentedControl
        activeTab="vocabulary"
        onNavigateTab={onNavigateTab}
        dueCount={dueMistakesCount}
        totalCount={totalMistakesCount}
      />
    )}
    <form id="vocab-phone-form" onSubmit={onSubmit} className="rounded-2xl border-2 border-slate-900 bg-white px-4 pb-4 pt-3.5 text-center shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]">
      <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
        {date === today ? 'Hôm nay' : 'Ngày'} · {shortDate(date)}{' '}
        <label className="relative inline-block cursor-pointer font-bold text-blue-600 dark:text-blue-400">Đổi ngày
          <input type="date" aria-label="Ngày học từ vựng" required min="0001-01-01" max={today} value={date} onChange={event => event.target.value && onDate(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </p>
      <div className="mt-3 flex items-center justify-center gap-4">
        <button type="button" aria-label={`Bớt ${STEP} từ`} disabled={!valid || value <= 1} onClick={() => step(-STEP)} className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-white shadow-[2px_2px_0_0_#0f172a] disabled:opacity-40 dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-none"><Minus className="h-5 w-5" aria-hidden="true" /></button>
        <label className="flex w-[7.5rem] flex-col items-center">
          <input type="number" inputMode="numeric" data-large-text aria-label="Số từ đã học" aria-describedby={existing ? 'vocab-update-help' : undefined} required min={1} max={10000} step={1} value={count} onChange={event => onCount(event.target.value)}
            className="w-full appearance-none bg-transparent text-center text-[52px] font-black leading-none tabular-nums text-slate-950 outline-none [-moz-appearance:textfield] focus:underline focus:decoration-violet-400 focus:decoration-4 focus:underline-offset-8 dark:text-white [&::-webkit-inner-spin-button]:appearance-none" />
          <span className="mt-1 text-[13px] font-semibold text-slate-500 dark:text-slate-400">từ</span>
        </label>
        <button type="button" aria-label={`Thêm ${STEP} từ`} onClick={() => step(STEP)} className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-900 bg-white shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-none"><Plus className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <div role="group" aria-label="Số từ thường dùng" className="mt-3.5 flex justify-center gap-2">
        {PRESETS.map(preset => <button type="button" key={preset} aria-pressed={value === preset} onClick={() => onCount(String(preset))}
          className={'h-10 min-w-12 cursor-pointer rounded-full border-2 px-3 text-sm font-black tabular-nums ' + (value === preset ? 'border-slate-900 bg-violet-200 text-violet-950 dark:border-violet-300 dark:bg-violet-900 dark:text-white' : 'border-stone-200 text-slate-700 dark:border-slate-700 dark:text-slate-200')}>{preset}</button>)}
      </div>
      {existing && <p id="vocab-update-help" className="mt-3 text-[12.5px] text-slate-500 dark:text-slate-400">Đã ghi {existing.count.toLocaleString('vi-VN')} từ cho ngày này · lưu sẽ thay số cũ.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    </form>

    {recentDays.length > 0 && <section aria-labelledby="vocab-recent-heading" className="rounded-2xl border-[1.5px] border-stone-300 bg-white px-4 py-3.5 dark:border-slate-700 dark:bg-[#111A2C]">
      <div className="flex items-baseline justify-between gap-3"><h2 id="vocab-recent-heading" className="text-[15px] font-black text-slate-950 dark:text-white">14 ngày qua</h2><span className="text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">Tổng {summary.count.toLocaleString('vi-VN')} từ</span></div>
      <div className="mt-3 flex h-16 items-end gap-1" role="img" aria-label={`${recentDays.length} ngày có ghi nhận trong 14 ngày qua, tổng ${summary.count} từ`}>
        {recent.map(day => <span key={day.date} title={`${shortDate(day.date)}: ${day.count} từ`} className={'flex-1 rounded-t-[3px] ' + (day.count === 0 ? 'h-[2px] bg-stone-200 dark:bg-slate-700' : day.date === today ? 'bg-violet-600 dark:bg-violet-400' : 'bg-violet-300 dark:bg-violet-700')} style={day.count ? { height: `${Math.max(8, day.count / highest * 100)}%` } : undefined} />)}
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500" aria-hidden="true"><span>{shortDate(recent[0].date)}</span><span>Hôm nay</span></div>
      <p className="mt-2 text-[12px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">Kỷ lục {summary.record?.count.toLocaleString('vi-VN')} từ · Trung bình {summary.average?.toLocaleString('vi-VN')} từ/ngày</p>
    </section>}

    {days.length > 0 && <button type="button" aria-haspopup="dialog" onClick={() => { setShown(HISTORY_STEP); setHistoryOpen(true); }} className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-stone-300 bg-white px-4 text-left dark:border-slate-700 dark:bg-[#111A2C]">
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-slate-900 dark:text-white">Lịch sử ghi nhận</span><span className="block text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Tích lũy {total.toLocaleString('vi-VN')} từ</span></span>
      <span className="flex shrink-0 items-center text-[13px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{days.length} ngày<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
    </button>}

    <div className="fixed inset-x-0 bottom-[calc(4rem+2px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7] to-transparent px-4 pb-3 pt-6 dark:from-[#070C16] dark:via-[#070C16]">
      <button type="submit" form="vocab-phone-form" className={'flex h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 text-base font-black shadow-[3px_3px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 dark:shadow-none ' + (saved ? 'bg-emerald-300 text-slate-950' : 'bg-blue-600 text-white')}>
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />{saved ? 'Đã lưu!' : !valid ? 'Lưu từ vựng' : existing ? `Cập nhật · ${value.toLocaleString('vi-VN')} từ` : `Lưu ${value.toLocaleString('vi-VN')} từ`}
      </button>
    </div>

    <p role="status" aria-live="polite" className="sr-only">{feedback}</p>

    {historyOpen && <Sheet title="Lịch sử ghi nhận" onClose={() => setHistoryOpen(false)}>
      <ul className="divide-y divide-stone-200 pb-2 dark:divide-slate-700" aria-label="Lịch sử từ vựng">
        {history.slice(0, shown).map(day => <li key={day.date} data-vocab-day={day.date} className="flex items-center gap-2">
          <button type="button" aria-label={`Sửa ghi nhận ngày ${formatVocabDate(day.date)}`} onClick={() => onEdit(day)} className="flex min-h-[56px] min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-left">
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-slate-900 dark:text-white">{formatVocabDate(day.date)}</span>
              {(day.sourceNames.length > 0 || day.parts.length > 0) && <span className="block truncate text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">{[day.sourceNames.join(' · '), day.parts.map(part => `P${part}`).join(' ')].filter(Boolean).join(' · ')}</span>}</span>
            <span className="shrink-0 text-[15px] font-black tabular-nums text-slate-950 dark:text-white">{day.count.toLocaleString('vi-VN')} từ</span>
          </button>
          {onDelete && <button type="button" aria-label={`Xóa ghi nhận ngày ${formatVocabDate(day.date)}`} onClick={() => onDelete(day)} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:text-slate-500"><Trash2 className="h-[18px] w-[18px]" aria-hidden="true" /></button>}
        </li>)}
      </ul>
      {history.length > shown && <button type="button" onClick={() => setShown(current => current + HISTORY_STEP)} className="mb-2 min-h-11 w-full cursor-pointer text-sm font-bold text-blue-600 dark:text-blue-400">Xem thêm</button>}
    </Sheet>}
  </div>;
}
