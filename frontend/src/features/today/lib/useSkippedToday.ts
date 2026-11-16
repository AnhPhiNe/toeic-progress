import { useEffect, useState } from 'react';

/** Same storage key as the desktop page, so both layouts agree on what was set aside. */
export const SKIP_KEY = 'rd_task_skip_v1';

/** Suggested tasks the learner set aside for today (per device; they come back tomorrow if still needed). */
export function useSkippedToday(today: string) {
  const read = () => {
    try { const v = JSON.parse(localStorage.getItem(SKIP_KEY) ?? 'null'); return v && v.date === today && Array.isArray(v.ids) ? v.ids as string[] : []; } catch { return []; }
  };
  const [ids, setIds] = useState<string[]>(read);
  useEffect(() => { setIds(read()); }, [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const skip = (id: string) => setIds(prev => {
    const next = prev.includes(id) ? prev : [...prev, id];
    try { localStorage.setItem(SKIP_KEY, JSON.stringify({ date: today, ids: next })); } catch { /* storage blocked */ }
    return next;
  });
  return [ids, skip] as const;
}
