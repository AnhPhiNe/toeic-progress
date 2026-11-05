import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Flame } from 'lucide-react';
import { useModalA11y } from '@/shared/hooks/useModalA11y';
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
  longestStreak: number;
  studiedDates: Set<string>;
  today: string;
}

/** Phone top bar: the streak as a small flame; tapping it drops this week's card right under the chip. */
export function StreakChip({ streak, longestStreak, studiedDates, today }: StreakChipProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const lit = streak > 0;
  return <>
    <button ref={chipRef} type="button" aria-haspopup="dialog" aria-expanded={anchor !== null} aria-label={`Chuỗi học ${streak} ngày, xem tuần này`}
      onClick={() => setAnchor(chipRef.current?.getBoundingClientRect() ?? null)}
      className={'flex h-9 items-center gap-1 rounded-xl border-2 border-slate-900 px-2 text-[13px] font-black tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer '
        + (lit ? 'bg-amber-100 text-slate-950' : 'bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400')
        + (anchor ? ' ring-[3px] ring-orange-300 ring-offset-1' : '')}>
      <Flame size={16} strokeWidth={2.5} className={lit ? 'text-orange-600' : 'text-slate-400'} aria-hidden="true" />
      {streak}
    </button>
    {anchor && <StreakPopover anchor={anchor} streak={streak} longestStreak={longestStreak} studiedDates={studiedDates} today={today} onClose={() => setAnchor(null)} />}
  </>;
}

function StreakPopover({ anchor, streak, longestStreak, studiedDates, today, onClose }: StreakChipProps & { anchor: DOMRect; onClose: () => void }) {
  const ref = useModalA11y(true, onClose);
  const studiedToday = studiedDates.has(today);
  const width = Math.min(300, window.innerWidth - 24);
  const right = 12;
  // Keep the arrow pointing at the middle of the chip whatever the card's offset.
  const arrowRight = Math.min(width - 28, Math.max(16, window.innerWidth - right - (anchor.left + anchor.width / 2) - 7));
  const message = streak === 0
    ? 'Ghi một buổi học hôm nay để bắt đầu chuỗi.'
    : studiedToday ? 'Hôm nay đã học. Mai học tiếp để giữ lửa.' : 'Hôm nay chưa học. Học một chút để giữ chuỗi.';
  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" tabIndex={-1} aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-950/20 cursor-default" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Chuỗi ${streak} ngày`} tabIndex={-1}
        style={{ top: anchor.bottom + 12, right, width }}
        className="streak-popover absolute rounded-[22px] border-2 border-slate-900 bg-white p-[18px] pb-4 text-slate-950 shadow-[4px_4px_0_0_#0f172a] outline-none dark:border-slate-300 dark:bg-[#111A2C] dark:text-white dark:shadow-[4px_4px_0_0_#cbd5e1]">
        <span aria-hidden="true" style={{ right: arrowRight }}
          className="absolute -top-[9px] h-3.5 w-3.5 rotate-45 border-l-2 border-t-2 border-slate-900 bg-white dark:border-slate-300 dark:bg-[#111A2C]" />
        <div className="flex items-center gap-3.5">
          <span className="streak-popover-flame flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[18px] text-orange-600">
            <Flame size={34} strokeWidth={2.4} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="flex items-baseline gap-1.5 leading-none">
              <span className="text-[30px] font-black tracking-tight tabular-nums">{streak}</span>
              <span className="text-base font-bold text-slate-500 dark:text-slate-400">ngày liên tiếp</span>
            </p>
            <p className="mt-1.5 text-[13px] font-semibold leading-snug text-slate-600 dark:text-slate-300">{message}</p>
          </div>
        </div>
        <ol className="mt-[18px] flex justify-between border-t border-stone-200 pt-3.5 dark:border-slate-700" aria-label="Tuần này">
          {currentWeek(today).map(day => {
            const done = studiedDates.has(day.iso);
            const isToday = day.iso === today;
            return (
              <li key={day.iso} aria-label={`${day.label}: ${done ? 'đã học' : isToday ? 'hôm nay, chưa học' : 'chưa học'}`}
                className={'flex flex-col items-center gap-1.5 text-[11px] font-bold ' + (done ? 'text-slate-950 dark:text-white' : isToday ? 'text-orange-700 dark:text-orange-300' : 'text-slate-400 dark:text-slate-500')}>
                <span className={'flex h-[30px] w-[30px] items-center justify-center rounded-full ' + (done
                  ? 'bg-orange-500 text-white'
                  : isToday ? 'border-2 border-dashed border-orange-500' : 'bg-slate-100 dark:bg-slate-800')}>
                  {done && (isToday ? <Flame size={16} strokeWidth={2.6} aria-hidden="true" /> : <Check size={16} strokeWidth={3} aria-hidden="true" />)}
                </span>
                {day.label}
              </li>
            );
          })}
        </ol>
        <p className="mt-3.5 flex justify-between text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
          Kỷ lục chuỗi <strong className="font-black text-slate-950 dark:text-white">{Math.max(longestStreak, streak)} ngày</strong>
        </p>
      </div>
    </div>,
    document.body
  );
}

const CELEBRATED_KEY = 'toeic_streak_celebrated_v1';

/**
 * The first study recorded today makes the flame flare up once, then it shrinks back toward the chip.
 * It never blocks input, steps aside as soon as the learner taps or types (so it never sits over the
 * next form), and skips the motion when the system asks for reduced motion.
 */
export function StreakCelebration({ streak, studiedToday, today, held = false }: { streak: number; studiedToday: boolean; today: string; held?: boolean }) {
  const [visible, setVisible] = useState(false);
  // While another screen holds the stage (a test's result screen), the flare waits until that screen closes.
  const [pending, setPending] = useState(false);
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
    setPending(true);
  }, [studiedToday, streak, today]);

  useEffect(() => {
    if (!pending || held) return;
    setPending(false);
    setVisible(true);
  }, [pending, held]);

  useEffect(() => {
    if (!visible) return;
    const hide = () => setVisible(false);
    const timer = window.setTimeout(hide, 2600);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('keydown', hide, true);
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', hide, true); window.removeEventListener('keydown', hide, true); };
  }, [visible]);

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
