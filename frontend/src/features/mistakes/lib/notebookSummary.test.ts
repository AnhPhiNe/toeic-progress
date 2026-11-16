import { describe, expect, it } from 'vitest';
import { dueSummary } from './notebookSummary';

describe('dueSummary', () => {
  it('names the Part with most due cards and about 0.8 minute each', () => {
    expect(dueSummary([{ part: 5 }, { part: 5 }, { part: 6 }, { part: 7 }, { part: 5 }, { part: 7 }, { part: 5 }, { part: 6 }]))
      .toEqual({ count: 8, topPart: 5, minutes: 6 });
  });
  it('breaks ties toward the lower Part and handles nothing due', () => {
    expect(dueSummary([{ part: 7 }, { part: 6 }]).topPart).toBe(6);
    expect(dueSummary([])).toEqual({ count: 0, topPart: null, minutes: 0 });
    expect(dueSummary([{ part: 5 }]).minutes).toBe(1);
  });
});
