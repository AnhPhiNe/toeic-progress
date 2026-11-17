import { describe, expect, it } from 'vitest';
import { lastDoneDate, stairsMood, todaySocMood } from './socMood';

const today = '2026-11-18';

describe('Sóc on Hôm nay', () => {
  it('keeps the default for a new learner and anyone who studied recently', () => {
    expect(todaySocMood({ today, lastDone: null, current: 0, longest: 0 })).toBeNull();
    expect(todaySocMood({ today, lastDone: today, current: 3, longest: 9 })).toBeNull();
    expect(todaySocMood({ today, lastDone: '2026-11-17', current: 4, longest: 9 })).toBeNull();
  });

  it('is Buồn nhẹ when the streak just broke', () => {
    expect(todaySocMood({ today, lastDone: '2026-11-16', current: 0, longest: 7 })).toBe('sad');
    // A shield kept the streak alive: not broken.
    expect(todaySocMood({ today, lastDone: '2026-11-16', current: 5, longest: 7 })).toBeNull();
  });

  it('dozes off (Ngủ gật) after 3 days without study', () => {
    expect(todaySocMood({ today, lastDone: '2026-11-15', current: 0, longest: 7 })).toBe('zzz');
    expect(todaySocMood({ today, lastDone: '2026-10-01', current: 0, longest: 1 })).toBe('zzz');
  });

  it('finds the last study day up to today', () => {
    expect(lastDoneDate(['2026-11-10', '2026-11-16', '2026-11-20', 'bad'], today)).toBe('2026-11-16');
    expect(lastDoneDate([], today)).toBeNull();
  });

  it('shows the rest face instead of the resting bounce, never over a new-step cheer', () => {
    expect(stairsMood('cheerC', 'zzz')).toBe('zzz');
    expect(stairsMood('cheerD', 'sad')).toBe('sad');
    expect(stairsMood('cheerCplus', 'sad')).toBe('cheerCplus');
    expect(stairsMood('cheerC', null)).toBe('cheerC');
    expect(stairsMood('cheerC', 'hi')).toBe('hi');
  });
});
