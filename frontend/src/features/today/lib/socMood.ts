import { useCallback, useEffect, useState } from 'react';
import { calendarDayIndex, validCalendarDate } from '@/shared/domain/dateRange';
import type { SocMood } from '@/shared/ui/soc/socSvg';
import { WAKE_MS } from '@/shared/ui/soc/Soc';

/** Days without any study after which Sóc dozes off on Hôm nay. */
export const IDLE_DAYS = 3;
export const BROKE_LINE = 'Không sao, hôm nay làm lại nhé';

/** Sóc's resting face on Hôm nay when it is not the default: Buồn nhẹ (streak just broke) or Ngủ gật (long break). */
export type RestMood = 'sad' | 'zzz' | null;

export function lastDoneDate(dates: Iterable<string>, today: string): string | null {
  let last: string | null = null;
  for (const d of dates) if (validCalendarDate(d) && d <= today && (last === null || d > last)) last = d;
  return last;
}

/**
 * - nothing studied for IDLE_DAYS days or more: Ngủ gật (also when the streak broke);
 * - otherwise a streak that existed is back to 0: Buồn nhẹ, with "Không sao, hôm nay làm lại nhé";
 * - a brand-new learner (no study day yet) or anyone who studied recently keeps the default Vui.
 */
export function todaySocMood(input: { today: string; lastDone: string | null; current: number; longest: number }): RestMood {
  const { today, lastDone, current, longest } = input;
  if (!lastDone || !validCalendarDate(today)) return null;
  const idle = calendarDayIndex(today) - calendarDayIndex(lastDone);
  if (idle >= IDLE_DAYS) return 'zzz';
  if (idle >= 1 && current <= 0 && longest > 0) return 'sad';
  return null;
}

/** A dozing Sóc wakes up (Vui, greeting pose) for a moment when tapped. */
export function useWake(rest: RestMood): [RestMood | 'hi', () => void] {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!awake) return;
    const t = window.setTimeout(() => setAwake(false), WAKE_MS);
    return () => window.clearTimeout(t);
  }, [awake]);
  const wake = useCallback(() => setAwake(true), []);
  return [rest === 'zzz' && awake ? 'hi' : rest, wake];
}

/** Rest pose on the stairs: the special face replaces the bounce (C) or star eyes (D), never a new-step cheer. */
export function stairsMood(base: SocMood, rest: RestMood | 'hi'): SocMood {
  return rest && (base === 'cheerC' || base === 'cheerD' || base === 'idle') ? rest : base;
}
