import { useEffect, useState } from 'react';
import { getActiveAccountId } from '@/shared/data/dataBundle';

/** Same storage key prefix as the desktop page, scoped per account so shared browsers stay isolated. */
export const SKIP_KEY = 'rd_task_skip_v1';
const scopedSkipKey = () => `${SKIP_KEY}:${getActiveAccountId() ?? 'guest'}`;

/** Suggested tasks the learner set aside for today (per device & account; they come back tomorrow if still needed). */
export function useSkippedToday(today: string) {
  const owner = getActiveAccountId() ?? 'guest';
  const read = () => {
    try { const v = JSON.parse(localStorage.getItem(scopedSkipKey()) ?? 'null'); return v && v.date === today && Array.isArray(v.ids) ? v.ids as string[] : []; } catch { return []; }
  };
  const [ids, setIds] = useState<string[]>(read);
  useEffect(() => { setIds(read()); }, [today, owner]); // eslint-disable-line react-hooks/exhaustive-deps
  const skip = (id: string) => setIds(prev => {
    const next = prev.includes(id) ? prev : [...prev, id];
    try { localStorage.setItem(scopedSkipKey(), JSON.stringify({ date: today, ids: next })); } catch { /* storage blocked */ }
    return next;
  });
  return [ids, skip] as const;
}
