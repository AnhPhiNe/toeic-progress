import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLeague, joinLeague, leaveLeague, updateLeague, type LeagueState } from '../services/leagueApi';

export interface LeagueHandle {
  state: LeagueState | null;
  loading: boolean;
  error: string;
  /** True while join/leave/rename is being sent. */
  busy: boolean;
  refresh: () => void;
  join: (nickname: string) => Promise<boolean>;
  leave: () => Promise<boolean>;
  rename: (nickname: string) => Promise<boolean>;
}

/** Reload after a sync at most this often: stars only change once study rows reach the server. */
const SYNC_REFRESH_MS = 20_000;

/**
 * League state for a signed-in learner. Loads on sign-in, after each finished sync (new rows
 * may earn stars) and when the page opens. Guests get null and never call the API.
 */
export function useLeague({ enabled, owner, synced, pageOpen, coat }: { enabled: boolean; owner: string | null; synced: boolean; pageOpen: boolean; coat: string }): LeagueHandle {
  const [state, setState] = useState<LeagueState | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useRef(0);
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    if (!enabled) return;
    const id = ++run.current;
    lastLoad.current = Date.now();
    setLoading(true);
    fetchLeague()
      .then(value => { if (id === run.current) { setState(value); setError(''); } })
      .catch((reason: unknown) => { if (id === run.current) setError(reason instanceof Error ? reason.message : 'Chưa tải được giải đấu.'); })
      .finally(() => { if (id === run.current) setLoading(false); });
  }, [enabled]);

  useEffect(() => {
    run.current++;
    setState(null); setError(''); setLoading(false);
    if (enabled) load();
  }, [enabled, owner, load]);

  useEffect(() => {
    if (enabled && synced && Date.now() - lastLoad.current > SYNC_REFRESH_MS) load();
  }, [enabled, synced, load]);

  useEffect(() => { if (enabled && pageOpen) load(); }, [enabled, pageOpen, load]);

  const send = useCallback(async (request: () => Promise<LeagueState>) => {
    setBusy(true);
    const id = ++run.current;
    try {
      const value = await request();
      if (id === run.current) { setState(value); setError(''); }
      return true;
    } catch (reason) {
      if (id === run.current) setError(reason instanceof Error ? reason.message : 'Chưa lưu được. Thử lại nhé.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  // The learner's Sóc coat (chosen in the welcome or Tủ đồ) follows them onto the league table.
  const memberCoat = state?.member?.coat;
  useEffect(() => {
    if (enabled && memberCoat && memberCoat !== coat) void send(() => updateLeague({ coat }));
  }, [enabled, memberCoat, coat, send]);

  return {
    state, loading, error, busy, refresh: load,
    join: nickname => send(() => joinLeague(nickname, coat)),
    leave: () => send(leaveLeague),
    rename: nickname => send(() => updateLeague({ nickname }))
  };
}
