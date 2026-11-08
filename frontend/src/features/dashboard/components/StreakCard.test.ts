import { describe, expect, it } from 'vitest';
import { weekStates } from './StreakCard';

describe('weekStates', () => {
  it('marks done, shield, today and future days of the current week', () => {
    expect(weekStates('2026-11-05', new Set(['2026-11-03']), new Set(['2026-11-04'])))
      .toEqual(['missed', 'done', 'shield', 'today', 'future', 'future', 'future']);
  });

  it('counts today as done once it has been studied', () => {
    expect(weekStates('2026-11-05', new Set(['2026-11-05']), new Set())[3]).toBe('done');
  });
});
