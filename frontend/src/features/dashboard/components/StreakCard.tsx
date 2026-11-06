import { Check, Flame, ShieldCheck } from 'lucide-react';

type DayState = 'done' | 'shield' | 'today' | 'missed' | 'future';

interface StreakCardProps {
  streak: number;
  longestStreak: number;
  studiedDates: ReadonlySet<string>;
  shieldDates: ReadonlySet<string>;
  today: string;
  onStart?: () => void;
  className?: string;
}

const LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const STATE_TEXT: Record<DayState, string> = {
  done: 'đã học', shield: 'khiên giữ chuỗi', today: 'hôm nay, chưa học', missed: 'bỏ lỡ', future: 'chưa tới'
};

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Monday-to-Sunday states of the week containing `today`. */
export function weekStates(today: string, studied: ReadonlySet<string>, shields: ReadonlySet<string>): DayState[] {
  const now = new Date(`${today}T00:00:00`);
  const monday = new Date(now);
  monday.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay()));
  return LABELS.map((_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const date = iso(day);
    if (studied.has(date)) return 'done';
    if (date === today) return 'today';
    if (shields.has(date)) return 'shield';
    return date > today ? 'future' : 'missed';
  });
}

const CIRCLE: Record<DayState, string> = {
  done: 'bg-orange-500 border-2 border-slate-900 text-white dark:border-slate-200',
  shield: 'bg-blue-100 border-2 border-blue-500 text-blue-600 dark:bg-blue-950 dark:text-blue-300',
  today: 'bg-white border-2 border-dashed border-orange-500 dark:bg-orange-950/40 motion-safe:animate-[streak-today_1.8s_ease-in-out_infinite]',
  missed: 'bg-orange-200/60 dark:bg-slate-700',
  future: 'bg-white border-2 border-orange-200 dark:bg-transparent dark:border-slate-700'
};

/** Desktop streak card: flame and count on one row, one circle per day, a reminder only when it matters. */
export function StreakCard({ streak, longestStreak, studiedDates, shieldDates, today, onStart, className = '' }: StreakCardProps) {
  const days = weekStates(today, studiedDates, shieldDates);
  const studiedToday = studiedDates.has(today);
  const todayIndex = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const perfect = days.every(day => day === 'done' || day === 'shield');
  const atRisk = streak > 0 && !studiedToday;
  const hot = streak > 0;
  const reminder = !hot
    ? { text: 'Học một bài để bắt đầu chuỗi.', action: 'Bắt đầu' }
    : atRisk ? { text: 'Học hôm nay để giữ chuỗi.', action: 'Học ngay' }
      : null;

  return (
    <div role="group" aria-label={`Chuỗi học ${streak} ngày`}
      className={`flex flex-col justify-center ${className} rounded-2xl border-2 border-slate-900 bg-orange-50 px-4 py-3 2xl:px-5 2xl:py-4 dark:border-slate-200 dark:bg-orange-950/25 ${atRisk ? 'shadow-[3px_3px_0_0_#0f172a] dark:shadow-[3px_3px_0_0_#cbd5e1]' : ''}`}>
      <div className="flex items-center gap-2.5">
        <Flame aria-hidden="true" strokeWidth={1.5}
          className={`h-10 w-10 -ml-1 shrink-0 ${hot ? 'fill-orange-500 text-slate-900 dark:text-slate-100' : 'fill-slate-200 text-slate-300 dark:fill-slate-700 dark:text-slate-600'}`} />
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className={`text-4xl font-black leading-none tabular-nums tracking-tight ${hot ? 'text-slate-950 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>{streak}</span>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">ngày liên tiếp</span>
        </p>
        <p className="ml-auto text-right text-xs font-semibold text-slate-500 dark:text-slate-400">
          Kỷ lục<span className="block text-sm font-extrabold text-slate-900 dark:text-white">{Math.max(longestStreak, streak)} ngày</span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {perfect ? (
          <div className="col-span-7 grid h-8 grid-cols-7 place-items-center rounded-full border-2 border-slate-900 bg-orange-500 text-white dark:border-slate-200" aria-label="Học đủ 7 ngày tuần này">
            {days.map((day, index) => day === 'shield'
              ? <ShieldCheck key={index} className="h-4 w-4" aria-hidden="true" />
              : <Check key={index} className="h-4 w-4" strokeWidth={3.5} aria-hidden="true" />)}
          </div>
        ) : days.map((day, index) => (
          <span key={index} title={`${LABELS[index]}: ${STATE_TEXT[day]}`}
            className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full ${CIRCLE[day]}`}>
            {day === 'done' && <Check className="h-4 w-4" strokeWidth={3.5} aria-hidden="true" />}
            {day === 'shield' && <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            <span className="sr-only">{LABELS[index]}: {STATE_TEXT[day]}</span>
          </span>
        ))}
        {days.map((_, index) => (
          <span key={`label-${index}`} aria-hidden="true"
            className={`text-[11px] font-bold ${index === todayIndex ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'}`}>
            {index === todayIndex ? 'Nay' : LABELS[index]}
          </span>
        ))}
      </div>

      {perfect && <p className="mt-2 text-sm font-extrabold text-orange-700 dark:text-orange-300">Tuần hoàn hảo: học đủ 7 ngày!</p>}
      {reminder && (
        <div className={`mt-2.5 flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold bg-white/80 dark:bg-slate-900/50`}>
          <span className="min-w-0 flex-1 text-balance text-slate-800 dark:text-slate-200">{reminder.text}</span>
          {onStart && <button type="button" onClick={onStart}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-[10px] border-2 border-slate-900 bg-orange-500 px-3 py-1.5 text-xs font-black text-white shadow-[2px_2px_0_0_#0f172a] transition active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 dark:shadow-none">
            {reminder.action}
          </button>}
        </div>
      )}
    </div>
  );
}
