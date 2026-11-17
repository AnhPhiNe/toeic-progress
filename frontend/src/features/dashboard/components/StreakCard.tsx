import { Check, ShieldCheck } from 'lucide-react';

type DayState = 'done' | 'shield' | 'today' | 'missed' | 'future';
type FlameMood = 'hot' | 'weak' | 'cold';

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

function mondayOf(today: string) {
  const now = new Date(`${today}T00:00:00`);
  const monday = new Date(now);
  monday.setDate(now.getDate() + (now.getDay() === 0 ? -6 : 1 - now.getDay()));
  return monday;
}

/** Monday-to-Sunday states of the week containing `today`. */
export function weekStates(today: string, studied: ReadonlySet<string>, shields: ReadonlySet<string>): DayState[] {
  const monday = mondayOf(today);
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
  missed: 'bg-slate-200 border-2 border-slate-300 dark:bg-slate-700 dark:border-slate-600',
  future: 'bg-white border-2 border-orange-300 dark:bg-transparent dark:border-slate-600'
};

/** Two-layer flame. Mood decides motion: hot burns, weak flutters and shrinks, cold sits still. */
function StreakFlame({ mood, large }: { mood: FlameMood; large: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 56 62" className={`sf sf-${mood} shrink-0 ${large ? 'h-[60px] w-[54px]' : 'h-[52px] w-[47px]'}`}>
      <path className="sf-outer" d="M28 4c2.5 9 14 14 14 29a14 14 0 0 1-28 0c0-6 3-9 5-12 .8 3.4 2.8 5.4 5 6C23 21 23.4 11 28 4Z" />
      <path className="sf-core" d="M28 21c1.6 4.4 7.4 7.4 7.4 14.2a7.4 7.4 0 0 1-14.8 0c0-3 1.4-4.8 2.8-6.2.4 1.8 1.2 2.8 2.6 3.2C25.6 29 26 25 28 21Z" />
      {mood === 'hot' && <>
        <circle className="sf-spark" cx="14" cy="22" r="2.2" style={{ ['--dx' as string]: '-8px' }} />
        <circle className="sf-spark sf-spark-b" cx="42" cy="20" r="2.2" style={{ ['--dx' as string]: '8px' }} />
      </>}
    </svg>
  );
}

/** Desktop streak card: flame and count on one row, one circle per day, a reminder only when it matters. */
export function StreakCard({ streak, longestStreak, studiedDates, shieldDates, today, onStart, className = '' }: StreakCardProps) {
  const days = weekStates(today, studiedDates, shieldDates);
  const studiedToday = studiedDates.has(today);
  const todayIndex = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const perfect = days.every(day => day === 'done' || day === 'shield');
  const atRisk = streak > 0 && !studiedToday;
  const mood: FlameMood = studiedToday ? 'hot' : streak > 0 ? 'weak' : 'cold';
  const reminder = streak === 0 && !studiedToday
    ? { text: 'Học một bài để bắt đầu chuỗi.', action: 'Bắt đầu' }
    : atRisk ? { text: 'Học hôm nay để giữ chuỗi.', action: 'Học ngay' }
      : null;

  return (
    <div role="group" aria-label={`Chuỗi học ${streak} ngày`}
      className={`flex flex-col justify-center ${className} rounded-2xl border-2 border-slate-900 bg-orange-50 px-5 py-4 dark:border-slate-200 dark:bg-orange-950/25 ${atRisk ? 'shadow-[3px_3px_0_0_#0f172a] dark:shadow-[3px_3px_0_0_#cbd5e1]' : ''}`}>
      <div className="flex items-center gap-3.5">
        <StreakFlame mood={mood} large={streak >= 7} />
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className={`text-4xl font-black leading-none tabular-nums tracking-tight ${mood === 'cold' ? 'text-slate-400 dark:text-slate-500' : mood === 'weak' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-950 dark:text-white'}`}>{streak}</span>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">ngày liên tiếp</span>
          </p>
          <p className="mt-1.5 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
            {atRisk
              ? <span className="font-extrabold text-orange-700 dark:text-orange-300">Học để giữ chuỗi</span>
              : <>{perfect ? <span className="font-extrabold text-orange-700 dark:text-orange-300">Tuần hoàn hảo! </span> : null}Kỷ lục <b className="font-extrabold text-slate-900 dark:text-white">{Math.max(longestStreak, streak)} ngày</b></>}
          </p>
        </div>
        {/* The reminder is the button itself: it appears only when there is no streak or it is at risk */}
        {reminder && onStart && <button type="button" onClick={onStart} title={reminder.text}
          className="ml-auto shrink-0 cursor-pointer whitespace-nowrap rounded-[10px] border-2 border-slate-900 bg-orange-500 px-3 py-1.5 text-xs font-black text-white shadow-[2px_2px_0_0_#0f172a] transition active:translate-x-px active:translate-y-px active:shadow-none dark:border-slate-200 dark:shadow-none">
          {reminder.action}<span className="sr-only">: {reminder.text}</span>
        </button>}
      </div>

      <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
        {perfect ? (
          <div className="col-span-7 grid h-8 grid-cols-7 place-items-center rounded-full border-2 border-slate-900 bg-orange-500 text-white dark:border-slate-200" aria-label="Học đủ 7 ngày tuần này">
            {days.map((day, index) => day === 'shield'
              ? <ShieldCheck key={index} className="h-4 w-4" aria-hidden="true" />
              : <Check key={index} className="h-4 w-4" strokeWidth={3.5} aria-hidden="true" />)}
          </div>
        ) : days.map((day, index) => (
          <span key={index} title={`${LABELS[index]}: ${STATE_TEXT[day]}`}
            className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full ${CIRCLE[day]} ${index === todayIndex && day === 'done' ? 'streak-pop' : ''}`}>
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

    </div>
  );
}
