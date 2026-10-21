import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react';
import { Sheet } from '@/app/components/MobileNav';
import type { NavTabId } from '@/shared/types';
import { ReviewSegmentedControl } from '@/features/mistakes/components/ReviewSegmentedControl';
import { formatVocabDate, vocabDayIndex, type VocabDay } from '../lib/vocabularyModel';
import { loadUserProfile } from '@/shared/data/storage';

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

/** Bento-style phone vocabulary tracker: daily counter with presets, visual 7-day progress bar chart, history in sheet. */
export function PhoneVocabulary({ today, days, total, date, count, existing, saved, error, feedback, dueMistakesCount, totalMistakesCount, onNavigateTab, onDate, onCount, onSubmit, onEdit, onDelete }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shown, setShown] = useState(HISTORY_STEP);
  const value = Number(count);
  const valid = count.trim() !== '' && Number.isInteger(value) && value >= 1;
  const step = (delta: number) => onCount(String(Math.max(1, Math.min(10000, (valid ? value : 0) + delta))));

  // Calculate streak: prefer profile streak, fallback to consecutive vocab days
  const streak = useMemo(() => {
    try {
      const profile = loadUserProfile();
      if (profile.currentStreak > 0) return profile.currentStreak;
    } catch {
      // fallback
    }
    let consecutive = 0;
    let check = new Date(`${today}T00:00:00Z`).getTime();
    const daySet = new Set(days.map(d => d.date));
    if (!daySet.has(today)) {
      check -= 86400000;
    }
    while (daySet.has(new Date(check).toISOString().slice(0, 10))) {
      consecutive++;
      check -= 86400000;
    }
    return consecutive;
  }, [days, today]);

  // Visual 7-day progress data
  const past7Days = useMemo(() => {
    const last = vocabDayIndex(today);
    const byDate = new Map(days.map(day => [day.date, day.count]));
    return Array.from({ length: 7 }, (_, offset) => {
      const day = dayFromIndex(last - 6 + offset);
      const d = new Date(`${day}T00:00:00Z`);
      const dayNum = d.getUTCDay();
      const weekdayLabel = dayNum === 0 ? 'CN' : `T${dayNum + 1}`;
      return {
        date: day,
        count: byDate.get(day) ?? 0,
        isToday: day === today,
        label: offset === 6 ? 'Hôm nay' : weekdayLabel,
        shortDate: formatVocabDate(day).slice(0, 5)
      };
    });
  }, [days, today]);

  const weekTotal = useMemo(() => past7Days.reduce((acc, d) => acc + d.count, 0), [past7Days]);
  const highest7 = useMemo(() => Math.max(1, ...past7Days.map(d => d.count)), [past7Days]);
  const activeDaysCount = useMemo(() => past7Days.filter(d => d.count > 0).length, [past7Days]);
  const history = useMemo(() => [...days].reverse(), [days]);

  return (
    <div className="vocabulary-view space-y-4 pb-28">
      {onNavigateTab && (
        <ReviewSegmentedControl
          activeTab="vocabulary"
          onNavigateTab={onNavigateTab}
          dueCount={dueMistakesCount}
          totalCount={totalMistakesCount}
        />
      )}

      {/* Bento Card 1: Header + Counter + Presets */}
      <form
        id="vocab-phone-form"
        onSubmit={onSubmit}
        className="rounded-2xl border-2 border-slate-900 bg-white p-4.5 text-center shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]"
      >
        {/* Header: Ghi nhận từ vựng hôm nay + Streak badge */}
        <div className="flex flex-col items-center gap-1.5 pb-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="text-[17px] font-black tracking-tight text-slate-950 dark:text-white">
              {date === today ? 'Ghi nhận từ vựng hôm nay' : 'Ghi nhận từ vựng'}
            </h1>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-black text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 shadow-2xs">
                <span aria-hidden="true">🔥</span>
                <span>{streak} ngày liên tục</span>
              </span>
            )}
          </div>
          <p className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
            {date === today ? 'Hôm nay' : 'Ngày'} · {shortDate(date)}{' '}
            <label className="relative inline-block cursor-pointer font-bold text-blue-600 dark:text-blue-400">
              Đổi ngày
              <input
                type="date"
                aria-label="Ngày học từ vựng"
                required
                min="0001-01-01"
                max={today}
                value={date}
                onChange={event => event.target.value && onDate(event.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </p>
        </div>

        {/* Big Counter with +/- Buttons */}
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label={`Bớt ${STEP} từ`}
            disabled={!valid || value <= 1}
            onClick={() => step(-STEP)}
            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 border-slate-900 bg-slate-50 text-slate-800 shadow-[2px_2px_0_0_#0f172a] transition-all hover:bg-slate-100 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:shadow-none"
          >
            <Minus className="h-5 w-5 stroke-[2.5]" aria-hidden="true" />
          </button>
          <label className="flex w-[8rem] flex-col items-center">
            <input
              type="number"
              inputMode="numeric"
              data-large-text
              aria-label="Số từ đã học"
              aria-describedby={existing ? 'vocab-update-help' : undefined}
              required
              min={1}
              max={10000}
              step={1}
              value={count}
              onChange={event => onCount(event.target.value)}
              className="w-full appearance-none bg-transparent text-center text-[54px] font-black leading-none tabular-nums text-slate-950 outline-none [-moz-appearance:textfield] focus:underline focus:decoration-violet-400 focus:decoration-4 focus:underline-offset-8 dark:text-white [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="mt-1 text-[12px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">từ đã học</span>
          </label>
          <button
            type="button"
            aria-label={`Thêm ${STEP} từ`}
            onClick={() => step(STEP)}
            className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border-2 border-slate-900 bg-slate-50 text-slate-800 shadow-[2px_2px_0_0_#0f172a] transition-all hover:bg-slate-100 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none dark:border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:shadow-none"
          >
            <Plus className="h-5 w-5 stroke-[2.5]" aria-hidden="true" />
          </button>
        </div>

        {/* Presets: [10, 20, 30, 50] */}
        <div role="group" aria-label="Số từ thường dùng" className="mt-4 flex justify-center gap-2">
          {PRESETS.map(preset => (
            <button
              type="button"
              key={preset}
              aria-pressed={value === preset}
              onClick={() => onCount(String(preset))}
              className={'h-10 min-w-12 cursor-pointer rounded-xl border-2 px-3 text-sm font-black tabular-nums transition-all ' + (
                value === preset
                  ? 'border-slate-900 bg-violet-200 text-violet-950 shadow-[2px_2px_0_0_#0f172a] dark:border-violet-300 dark:bg-violet-900 dark:text-white dark:shadow-none'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
              )}
            >
              {preset}
            </button>
          ))}
        </div>

        {existing && (
          <p id="vocab-update-help" className="mt-3 text-[12.5px] font-semibold text-amber-700 dark:text-amber-300">
            Đã ghi {existing.count.toLocaleString('vi-VN')} từ cho ngày này · lưu sẽ thay số cũ.
          </p>
        )}
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
      </form>

      {/* Bento Card 2: Tiến độ 7 ngày · X từ tích lũy with Mini Bar Chart */}
      <section
        aria-labelledby="vocab-7day-heading"
        className="rounded-2xl border-2 border-slate-900 bg-white p-4.5 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-[3px_3px_0_0_#cbd5e1]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="vocab-7day-heading" className="text-[15px] font-black text-slate-950 dark:text-white">
            Tiến độ 7 ngày · {total.toLocaleString('vi-VN')} từ tích lũy
          </h2>
          <span className="text-[12px] font-bold text-violet-700 dark:text-violet-400">
            {weekTotal > 0 ? `${weekTotal.toLocaleString('vi-VN')} từ tuần này` : 'Chưa có từ tuần này'}
          </span>
        </div>

        {/* 7-day visual bar chart */}
        <div
          className="mt-4 flex h-28 items-end gap-2 pt-2"
          role="img"
          aria-label={`Tiến độ 7 ngày qua: ${activeDaysCount} ngày học, tổng ${weekTotal} từ.`}
        >
          {past7Days.map(day => {
            const heightPercent = day.count > 0 ? Math.max(18, Math.round((day.count / highest7) * 100)) : 0;
            return (
              <div key={day.date} className="flex flex-1 flex-col items-center justify-end h-full">
                {/* Daily count label above bar */}
                <span className={`mb-1 text-[11px] font-extrabold tabular-nums ${day.isToday ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {day.count > 0 ? day.count : ''}
                </span>
                {/* Bar track and fill */}
                <div className="relative flex w-full max-w-[36px] flex-1 items-end justify-center rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
                  {day.count > 0 ? (
                    <div
                      className={`w-full rounded-lg transition-all ${
                        day.isToday
                          ? 'bg-gradient-to-t from-violet-600 to-indigo-500 shadow-sm dark:from-violet-500 dark:to-indigo-400'
                          : 'bg-violet-300 dark:bg-violet-700/80'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                      title={`${day.shortDate}: ${day.count} từ`}
                    />
                  ) : (
                    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700" title={`${day.shortDate}: 0 từ`} />
                  )}
                </div>
                {/* Day label below */}
                <div className="mt-1.5 text-center leading-none">
                  <span className={`block text-[11px] font-bold ${day.isToday ? 'font-black text-violet-700 dark:text-violet-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {day.label}
                  </span>
                  <span className="block text-[9.5px] font-medium text-slate-400 dark:text-slate-500">
                    {day.shortDate}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3 mini stat pills underneath */}
        <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 text-center">
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">7 ngày qua</span>
            <span className="mt-0.5 block text-[13px] font-black text-slate-900 dark:text-white tabular-nums">{weekTotal.toLocaleString('vi-VN')} từ</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Trung bình</span>
            <span className="mt-0.5 block text-[13px] font-black text-slate-900 dark:text-white tabular-nums">{Math.round(weekTotal / 7).toLocaleString('vi-VN')} từ/ng</span>
          </div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Đã học</span>
            <span className="mt-0.5 block text-[13px] font-black text-slate-900 dark:text-white tabular-nums">{activeDaysCount}/7 ngày</span>
          </div>
        </div>
      </section>

      {/* Bento Card 3: History Trigger Button */}
      {days.length > 0 && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => { setShown(HISTORY_STEP); setHistoryOpen(true); }}
          className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-slate-900 bg-white px-4 text-left shadow-[2px_2px_0_0_#0f172a] transition-all hover:bg-slate-50 dark:border-slate-300 dark:bg-[#111A2C] dark:shadow-none"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-black text-slate-900 dark:text-white">Lịch sử ghi nhận</span>
            <span className="block text-[12px] font-semibold text-slate-500 dark:text-slate-400">
              {days.length} ngày đã học · Tích lũy {total.toLocaleString('vi-VN')} từ
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </button>
      )}

      {/* Sticky Bottom Save Button: Nút lưu to bản Lưu X từ hôm nay */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+2px+env(safe-area-inset-bottom))] z-30 bg-gradient-to-t from-[#FDFBF7] via-[#FDFBF7] to-transparent px-4 pb-3 pt-6 dark:from-[#070C16] dark:via-[#070C16]">
        <button
          type="submit"
          form="vocab-phone-form"
          className={'flex h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-900 text-base font-black shadow-[3px_3px_0_0_#0f172a] active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 dark:shadow-none ' + (
            saved ? 'bg-emerald-300 text-slate-950' : 'bg-blue-600 text-white'
          )}
        >
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <span>
            {saved
              ? 'Đã lưu!'
              : !valid
              ? 'Lưu từ vựng'
              : existing
              ? `Cập nhật · ${value.toLocaleString('vi-VN')} từ`
              : date === today
              ? `Lưu ${value.toLocaleString('vi-VN')} từ hôm nay`
              : `Lưu ${value.toLocaleString('vi-VN')} từ`}
          </span>
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">{feedback}</p>

      {historyOpen && (
        <Sheet title="Lịch sử ghi nhận" onClose={() => setHistoryOpen(false)}>
          <ul className="divide-y divide-stone-200 pb-2 dark:divide-slate-700" aria-label="Lịch sử từ vựng">
            {history.slice(0, shown).map(day => (
              <li key={day.date} data-vocab-day={day.date} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Sửa ghi nhận ngày ${formatVocabDate(day.date)}`}
                  onClick={() => onEdit(day)}
                  className="flex min-h-[56px] min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-slate-900 dark:text-white">{formatVocabDate(day.date)}</span>
                    {(day.sourceNames.length > 0 || day.parts.length > 0) && (
                      <span className="block truncate text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
                        {[day.sourceNames.join(' · '), day.parts.map(part => `P${part}`).join(' ')].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[15px] font-black tabular-nums text-slate-950 dark:text-white">
                    {day.count.toLocaleString('vi-VN')} từ
                  </span>
                </button>
                {onDelete && (
                  <button
                    type="button"
                    aria-label={`Xóa ghi nhận ngày ${formatVocabDate(day.date)}`}
                    onClick={() => onDelete(day)}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:text-slate-500"
                  >
                    <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {history.length > shown && (
            <button
              type="button"
              onClick={() => setShown(current => current + HISTORY_STEP)}
              className="mb-2 min-h-11 w-full cursor-pointer text-sm font-bold text-blue-600 dark:text-blue-400"
            >
              Xem thêm
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}
