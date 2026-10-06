import { describe, expect, it } from 'vitest';
import { defaultProfile, type DataBundle } from '@/shared/data/dataBundle';
import { deriveStreak } from '@/shared/domain/streak';

const now = '2026-09-24T00:00:00.000Z';
const empty = (): DataBundle => ({
  schemaVersion: 3,
  profile: { ...defaultProfile(), updatedAt: now, deletedAt: null },
  sessions: [], mistakes: [], pacingRuns: [], checklist: [], vocabLog: [], shieldDays: [], weeklyPlans: []
});

describe('streak derivation', () => {
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
});
