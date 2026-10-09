import { describe, it, expect } from 'vitest';
import { elapsedMs, finishTimer, freshTimer, parseTimer, pauseTimer, startTimer } from './pacingModel';

describe('timestamp pacing timer', () => {
  it('includes real running time, excludes pauses and resumes without drift', () => {
    let timer = freshTimer(null, 'PART_5');
    timer = startTimer(timer, 1000);
    expect(elapsedMs(timer, 11500)).toBe(10500);
    timer = pauseTimer(timer, 11500);
    expect(elapsedMs(timer, 99000)).toBe(10500);
    timer = startTimer(timer, 100000);
    expect(elapsedMs(timer, 105000)).toBe(15500);
    const finished = finishTimer(timer, 105000);
    expect(finished.elapsedMs).toBe(15500);
    expect(finished.endedAt).toBe(105000);
    expect(finished.status).toBe('finished');
  });
  it('finishes at the actual deadline after a sleeping tab wakes, rather than recording the whole absence', () => {
    const timer = startTimer(freshTimer(null, 'PART_5'), 1000);
    const ended = finishTimer(timer, 86400000);
    expect(ended.elapsedMs).toBe(720000);
    expect(ended.endedAt).toBe(721000);
    expect(finishTimer(ended, 172800000)).toEqual(ended);
  });
  it('preserves exact Pomodoro time when ended early and has no question accuracy', () => {
    const timer = finishTimer(startTimer(freshTimer(null, 'POMODORO'), 1000), 10100);
    expect(timer.elapsedMs).toBe(9100);
    expect(timer.questions).toBe(0);
    expect(timer.elapsedMs).toBeLessThan(timer.plannedSeconds * 1000);
  });
  it('restores only valid snapshots for their own account and refuses corrupt input', () => {
    const timer = startTimer(freshTimer('owner-a', 'PART_6'), 1000);
    expect(parseTimer(timer, 'owner-a')).toEqual(timer);
    expect(parseTimer(timer, 'owner-b')).toBeNull();
    for (const patch of [{ elapsedMs: Infinity }, { plannedSeconds: 0 }, { questions: 1.5 }, { mode: 'unknown' }, { runningSince: null }, { name: 'x'.repeat(301) }]) {
      expect(parseTimer({ ...timer, ...patch }, 'owner-a')).toBeNull();
    }
  });
});
