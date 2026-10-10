import { describe, expect, it } from 'vitest';
import { defaultProfile } from '@/shared/data/dataBundle';
import { mergeProfileEdit } from './profileEdit';

describe('settings profile edits', () => {
  it('preserves unrelated edits, activity and sync metadata from the current profile', () => {
    const snapshot = defaultProfile();
    const latest = { ...snapshot, motto: 'Changed elsewhere', currentStreak: 7, longestStreak: 12, lastStudyDate: '2026-10-10', updatedAt: '2026-10-10T12:00:00Z', shieldAllowance: 5, selectedSkill: 'SW' as const };
    const edited = { ...snapshot, name: 'New name' };
    expect(mergeProfileEdit(latest, snapshot, edited)).toEqual({ ...latest, name: 'New name' });
    expect(latest.name).toBe(snapshot.name);
  });
  it('rejects conflicting edited fields, but permits an identical concurrent edit', () => {
    const snapshot = defaultProfile(), edited = { ...snapshot, targetScore: 800 };
    expect(() => mergeProfileEdit({ ...snapshot, targetScore: 850 }, snapshot, edited)).toThrow(/thay đổi ở nơi khác/);
    expect(mergeProfileEdit({ ...snapshot, targetScore: 800 }, snapshot, edited).targetScore).toBe(800);
  });
  it('keeps a newly consumed shield when settings did not edit the shield count', () => {
    const snapshot = { ...defaultProfile(), streakFreezes: 2 };
    expect(mergeProfileEdit({ ...snapshot, streakFreezes: 1 }, snapshot, { ...snapshot, motto: 'Keep learning' }).streakFreezes).toBe(1);
  });
  it('rejects deleted profiles and invalid settings rather than writing malformed data', () => {
    const snapshot = defaultProfile();
    expect(() => mergeProfileEdit({ ...snapshot, deletedAt: '2026-10-10T12:00:00Z' }, snapshot, snapshot)).toThrow(/Hồ sơ đã thay đổi/);
    for (const edited of [{ ...snapshot, name: ' ' }, { ...snapshot, targetScore: 802 }, { ...snapshot, dailyMinGoalMinutes: 0 }, { ...snapshot, streakFreezes: 6 }]) {
      expect(() => mergeProfileEdit(snapshot, snapshot, edited)).toThrow();
    }
  });
});
