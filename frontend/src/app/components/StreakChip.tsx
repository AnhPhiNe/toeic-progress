import { useEffect, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { Sheet } from './MobileNav';
import './streak.css';

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentWeek(today: string) {
  const now = new Date(`${today}T00:00:00`);
  const monday = new Date(now);
  monday.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay()));
  return DAY_LABELS.map((label, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return { label, iso: isoDate(day), date: day.getDate() };
  });
}

interface StreakChipProps {
  streak: number;
  studiedDates: Set<string>;
  today: string;
}

/** Phone top bar: the streak as a small flame; tapping it shows this week. */
export function StreakChip({ streak, studiedDates, today }: StreakChipProps) {
  const [open, setOpen] = useState(false);
  const studiedToday = studiedDates.has(today);
  const lit = streak > 0;
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Chuỗi học ${streak} ngày, xem tuần này`}
      data-streak-chip
      className={'flex h-9 items-center gap-1 rounded-xl border-2 border-slate-900 px-2 text-[13px] font-black tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ' + (lit ? 'bg-amber-100 text-slate-950' : 'bg-slate-100 text-slate-500')}>
      <Flame size={16} strokeWidth={2.5} className={lit ? 'text-orange-600' : 'text-slate-400'} aria-hidden="true" />
      {streak}
    </button>
    {open && (
      <Sheet title={`Chuỗi ${streak} ngày`} onClose={() => setOpen(false)}>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          {studiedToday ? 'Đã học hôm nay. Học tiếp ngày mai để giữ lửa.' : 'Chưa học hôm nay. Ghi một buổi học để giữ chuỗi.'}
        </p>
        <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="Tuần này">
          {currentWeek(today).map(day => {
            const done = studiedDates.has(day.iso);
            const isToday = day.iso === today;
            return (
              <li key={day.iso} aria-label={`${day.label} ${day.date}: ${done ? 'đã học' : isToday ? 'hôm nay, chưa học' : 'chưa học'}`}
                className={'flex h-14 flex-col items-center justify-center rounded-xl ' + (done
                  ? 'bg-amber-400 text-slate-950'
                  : isToday
                    ? 'border-2 border-dashed border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500')}>
                <span className="text-[11px] font-bold">{day.label}</span>
                <span className="text-[15px] font-black tabular-nums">{day.date}</span>
              </li>
            );
          })}
        </ol>
      </Sheet>
    )}
  </>;
}

const CELEBRATED_KEY = 'toeic_streak_celebrated_v1';

/**
 * The first study recorded today makes the flame flare up once, then it shrinks back toward the chip.
 * It never blocks input and skips the motion when the system asks for reduced motion.
 */
export function StreakCelebration({ streak, studiedToday, today }: { streak: number; studiedToday: boolean; today: string }) {
  const [visible, setVisible] = useState(false);
  const previous = useRef(studiedToday);
  useEffect(() => {
    const becameStudied = !previous.current && studiedToday;
    previous.current = studiedToday;
    if (!becameStudied || streak <= 0) return;
    try {
      if (localStorage.getItem(CELEBRATED_KEY) === today) return;
      localStorage.setItem(CELEBRATED_KEY, today);
    } catch {
      // Celebrating twice is harmless when storage is unavailable.
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(timer);
  }, [studiedToday, streak, today]);

  if (!visible) return null;
  return (
    <div className="streak-celebration pointer-events-none fixed inset-0 z-[60] flex items-center justify-center md:hidden" role="status" aria-live="polite">
      <div className="streak-celebration-card flex w-[280px] flex-col items-center rounded-3xl border-2 border-slate-900 bg-white px-6 py-7 text-center shadow-[4px_4px_0_0_#0f172a] dark:border-slate-200 dark:bg-[#111A2C]">
        <span className="streak-celebration-glow flex h-28 w-28 items-center justify-center rounded-full">
          <Flame className="streak-celebration-flame h-16 w-16 text-orange-600" strokeWidth={2.2} aria-hidden="true" />
        </span>
        <p className="mt-2 text-[28px] font-black tracking-tight text-slate-950 dark:text-white">{streak} ngày liên tiếp</p>
        <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">Học thêm ngày mai để giữ lửa</p>
      </div>
    </div>
  );
}
