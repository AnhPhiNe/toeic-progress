import { describe, expect, it } from 'vitest';
import { formatRelativeDay, nextTierProgress } from './ScoreReportCard';

describe('formatRelativeDay', () => {
  const now = new Date('2026-11-08T15:00:00');
  it('says "Hôm nay" only for a test done today', () => {
    expect(formatRelativeDay('2026-11-08', now)).toBe('Hôm nay');
  });
  it('uses dd/mm for every other day', () => {
    expect(formatRelativeDay('2026-11-07', now)).toBe('07/11');
    expect(formatRelativeDay('2026-10-20', now)).toBe('20/10');
  });
});

describe('nextTierProgress', () => {
  it('counts the shortfall in each skill against the next level', () => {
    // 200/200 is A2; B1 needs 275 in both skills.
    expect(nextTierProgress(200, 200)).toEqual({ cefr: 'B1', need: 150, goal: 550, percent: 73 });
  });
  it('only counts the skill that is still short', () => {
    // 405/460 is B2; C1 needs L 490 and R 455.
    expect(nextTierProgress(405, 460)).toMatchObject({ cefr: 'C1', need: 85 });
  });
  it('returns null without section scores', () => {
    expect(nextTierProgress(undefined, 300)).toBeNull();
  });
});
