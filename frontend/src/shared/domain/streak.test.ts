import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, type DataBundle } from '@/shared/data/dataBundle';
import { actualStudyDates, deriveStreak, studyPacingSeconds } from '@/shared/domain/streak';
import { loadUserProfile } from '@/shared/data/storage';
import type { PacingRun } from '@/shared/types';

const now = '2026-09-24T00:00:00.000Z';
const empty = (): DataBundle => ({
  schemaVersion: 3,
  profile: { ...defaultProfile(), updatedAt: now, deletedAt: null },
  sessions: [], mistakes: [], pacingRuns: [], vocabLog: [], shieldDays: []
});
const pacing = (patch: Partial<PacingRun> = {}): PacingRun => ({ id: 'unpaired-legacy', presetId: 'PART_5', presetName: 'Part 5',
  partType: 'PART_5', date: '2026-09-24', plannedMinutes: 12, actualMinutes: 12, finishedNaturally: true,
  phases: [], createdAt: now, ...patch });

describe('streak derivation', () => {
  it('exposes real study dates without old profile markers, shields, deleted data or future activity', () => {
    const data = empty();
    data.profile.lastStudyDate = '2026-09-24';
    data.shieldDays.push({ id: 'shield', date: '2026-09-24', updatedAt: now, deletedAt: null });
    data.vocabLog.push({ id: 'v1', date: '2026-09-21', count: 3, updatedAt: now, deletedAt: null });
    data.vocabLog.push({ id: 'v2', date: '2026-09-22', count: 2, updatedAt: now, deletedAt: null });
    data.vocabLog.push({ id: 'deleted', date: '2026-09-23', count: 4, updatedAt: now, deletedAt: now });
    data.vocabLog.push({ id: 'future', date: '2026-09-25', count: 4, updatedAt: now, deletedAt: null });
    data.vocabLog.push({ id: 'zero', date: '2026-09-24', count: 0, updatedAt: now, deletedAt: null });
    expect([...actualStudyDates(data, '2026-09-24')]).toEqual(['2026-09-21', '2026-09-22']);
  });
  it('combines sessions, vocabulary and shield dates without treating a shield as study', () => {
    const data = empty();
    data.sessions.push({ id: 's', skillType: 'LR', sessionType: 'PART_PRACTICE', testName: 'Part 5', date: '2026-09-21', durationMinutes: 30, createdAt: now, updatedAt: now, deletedAt: null });
    data.vocabLog.push({ id: 'v', date: '2026-09-22', count: 10, updatedAt: now, deletedAt: null });
    data.shieldDays.push({ id: 'f', date: '2026-09-23', updatedAt: now, deletedAt: null });
    expect(deriveStreak(data, '2026-09-24')).toMatchObject({
      currentStreak: 3, lastStudyDate: '2026-09-22', streakFreezes: 1
    });
  });

  it('counts pacing runs towards streak and lastStudyDate', () => {
    const data = empty();
    data.pacingRuns.push({
      id: 'p1', presetId: 'PART_5', presetName: 'Part 5', date: '2026-09-24',
      plannedMinutes: 12, actualMinutes: 12, finishedNaturally: true,
      phases: [], createdAt: now, updatedAt: now, deletedAt: null
    });
    expect(deriveStreak(data, '2026-09-24')).toMatchObject({
      currentStreak: 1, lastStudyDate: '2026-09-24'
    });
  });

  it('does not count deleted activities or stale chains', () => {
    const data = empty();
    data.vocabLog.push({ id: 'v', date: '2026-09-20', count: 10, updatedAt: now, deletedAt: now });
    expect(deriveStreak(data, '2026-09-24').currentStreak).toBe(0);
  });

  it('does not count a rest-only day as study or a streak, including old breaks without partType', () => {
    const data = empty();
    data.pacingRuns = [pacing({ presetId: 'POMODORO_SHORT_BREAK', partType: 'POMODORO' }),
      pacing({ id: 'long', presetId: 'POMODORO_LONG_BREAK', partType: undefined })].map(run => ({ ...run, updatedAt: now, deletedAt: null }));
    expect([...actualStudyDates(data, '2026-09-24')]).toEqual([]);
    expect(deriveStreak(data, '2026-09-24')).toMatchObject({ currentStreak: 0, longestStreak: 0, lastStudyDate: '' });
  });

  it('keeps unpaired Reading and Pomodoro work, but excludes deleted, nonpositive and invalid durations', () => {
    const data = empty();
    data.pacingRuns = [pacing({ date: '2026-09-23' }), pacing({ id: 'work', presetId: 'POMODORO_WORK', partType: 'POMODORO' }),
      pacing({ id: 'deleted', date: '2026-09-22', deletedAt: now }), pacing({ id: 'zero', date: '2026-09-21', actualSeconds: 0 }),
      pacing({ id: 'negative', date: '2026-09-20', actualMinutes: -1 }), pacing({ id: 'nan', date: '2026-09-19', actualSeconds: NaN }),
      pacing({ id: 'infinite', date: '2026-09-18', actualMinutes: Infinity })].map(run => ({ ...run, updatedAt: now, deletedAt: run.deletedAt ?? null }));
    expect([...actualStudyDates(data, '2026-09-24')]).toEqual(['2026-09-23', '2026-09-24']);
    expect(deriveStreak(data, '2026-09-24')).toMatchObject({ currentStreak: 2, lastStudyDate: '2026-09-24' });
    expect(studyPacingSeconds(pacing({ actualSeconds: .5 }))).toBe(.5);
  });
});

describe('automatic shield activity sources', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const stored = (data: DataBundle) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-24T12:00:00'));
    const values = new Map([['toeic_progress_bundle_v3', JSON.stringify(data)]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    return values;
  };

  it('protects a missed day after an actual legacy unpaired pacing activity', () => {
    const data = empty();
    data.pacingRuns = [{ ...pacing({ date: '2026-09-22' }), updatedAt: now, deletedAt: null }];
    const values = stored(data);
    expect(loadUserProfile()).toMatchObject({ currentStreak: 2, lastStudyDate: '2026-09-22', streakFreezes: 1 });
    expect(JSON.parse(values.get('toeic_progress_bundle_v3')!).shieldDays).toHaveLength(1);
  });

  it('does not spend a shield after a break-only day', () => {
    const data = empty();
    data.pacingRuns = [{ ...pacing({ date: '2026-09-22', presetId: 'POMODORO_SHORT_BREAK', partType: 'POMODORO' }), updatedAt: now, deletedAt: null }];
    const values = stored(data);
    expect(loadUserProfile()).toMatchObject({ currentStreak: 0, lastStudyDate: '', streakFreezes: 2 });
    expect(JSON.parse(values.get('toeic_progress_bundle_v3')!).shieldDays).toHaveLength(0);
  });

  it('still protects a missed study day when only a rest period was recorded on that day', () => {
    const data = empty();
    data.pacingRuns = [pacing({ date: '2026-09-22', presetId: 'POMODORO_WORK', partType: 'POMODORO' }),
      pacing({ id: 'rest', date: '2026-09-23', presetId: 'POMODORO_LONG_BREAK', partType: 'POMODORO' })]
      .map(run => ({ ...run, updatedAt: now, deletedAt: null }));
    const values = stored(data);
    expect(loadUserProfile()).toMatchObject({ currentStreak: 2, lastStudyDate: '2026-09-22', streakFreezes: 1 });
    expect(JSON.parse(values.get('toeic_progress_bundle_v3')!).shieldDays[0].date).toBe('2026-09-23');
  });
});
