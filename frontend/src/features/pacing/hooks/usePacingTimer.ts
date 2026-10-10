import { useCallback, useEffect, useRef, useState } from 'react';
import { configureTimer, elapsedMs, finishTimer, freshTimer, pauseTimer, startTimer, type PacingMode, type PomodoroPhase, type PomodoroSettings, type TimerSnapshot } from '@/features/pacing/lib/pacingModel';
import { assertPacingOwner, clearTimer, persistTimer, PacingOwnerChangedError, readTimer, timerKey } from '@/features/pacing/services/pacingStorage';
import { pacingError } from '@/features/pacing/lib/pacingErrors';

export function usePacingTimer(owner: string | null, initialMode: PacingMode, settings: PomodoroSettings) {
  const [snapshot, setSnapshot] = useState(() => readTimer(owner) ?? freshTimer(owner, initialMode, settings));
  const ref = useRef(snapshot);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const commit = useCallback((next: TimerSnapshot, mustPersist = true) => {
    try {
      assertPacingOwner(owner);
      const stored = readTimer(owner);
      if (stored && stored.id !== ref.current.id && (stored.status !== 'ready' || ref.current.status !== 'ready')) {
        setError('Phiên đã thay đổi ở tab khác. Đang hiển thị phiên mới nhất.');
        ref.current = stored; setSnapshot(stored); setNow(Date.now()); return false;
      }
      persistTimer(next); setError('');
    } catch (reason) {
      setError(pacingError(reason, 'Chưa giữ được phiên trên máy.'));
      if (mustPersist || reason instanceof PacingOwnerChangedError) return false;
    }
    ref.current = next; setSnapshot(next); setNow(Date.now()); return true;
  }, [owner]);
  useEffect(() => {
    if (snapshot.status !== 'running') return;
    const tick = () => {
      const time = Date.now(); setNow(time);
      const current = ref.current;
      if (current.status === 'running' && elapsedMs(current, time) >= current.plannedSeconds * 1000) commit(finishTimer(current, time), false);
    };
    tick(); const interval = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [snapshot.status, commit]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== timerKey(owner)) return;
      const next = readTimer(owner) ?? freshTimer(owner, initialMode, settings);
      ref.current = next; setSnapshot(next); setNow(Date.now());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [owner, initialMode, settings]);
  const start = useCallback(() => commit(startTimer(ref.current)), [commit]);
  const pause = useCallback(() => commit(pauseTimer(ref.current), false), [commit]);
  const finish = useCallback(() => {
    const current = ref.current;
    if (elapsedMs(current) <= 0) { setError('Hãy bắt đầu luyện trước khi ghi kết quả.'); return false; }
    return commit(finishTimer(current), false);
  }, [commit]);
  const reset = (mode = ref.current.mode, phase: PomodoroPhase = 'WORK') => commit(freshTimer(owner, mode, settings, phase));
  const configure = (plannedMinutes: number, questions: number) => {
    const next = configureTimer(ref.current, plannedMinutes, questions);
    return next ? commit(next) : false;
  };
  const patchResult = (patch: Partial<Pick<TimerSnapshot, 'name' | 'correct'>>) => commit({ ...ref.current, ...patch }, false);
  const returnToClock = useCallback(() => commit({ ...ref.current, status: 'paused', endedAt: elapsedMs(ref.current) >= ref.current.plannedSeconds * 1000 ? ref.current.endedAt : null }, false), [commit]);
  const saved = useCallback(() => {
    const current = ref.current;
    clearTimer(owner, current.id);
    const next = freshTimer(owner, current.mode, settings, current.phase);
    ref.current = next; setSnapshot(next); setNow(Date.now());
  }, [owner, settings]);
  return { snapshot, now, error, start, pause, finish, reset, configure, patchResult, returnToClock, saved };
}
