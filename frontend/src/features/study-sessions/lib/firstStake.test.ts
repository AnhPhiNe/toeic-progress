import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { firstStakeLine, isFirstFullTest } from './firstStake';

const s = (o: Partial<StudySession>) => ({ id: Math.random().toString(), sessionType: 'FULL_TEST', ...o }) as StudySession;

describe('isFirstFullTest', () => {
  it('is true for exactly one live full test', () => {
    expect(isFirstFullTest([s({})])).toBe(true);
    expect(isFirstFullTest([s({}), s({ sessionType: 'PART_PRACTICE' })])).toBe(true);
    expect(isFirstFullTest([s({}), s({ deletedAt: '2026-01-01' })])).toBe(true);
  });
  it('is false for none or several', () => {
    expect(isFirstFullTest([])).toBe(false);
    expect(isFirstFullTest([s({}), s({})])).toBe(false);
    expect(isFirstFullTest([s({ deletedAt: 'x' })])).toBe(false);
  });
});

describe('firstStakeLine', () => {
  it('names the stair, points left and the badge', () => {
    expect(firstStakeLine({ index: 3, total: 8 }, 180, 800)).toBe('Bậc 3/8 · còn 180 điểm tới cúp 800. Huy hiệu “Đề đầu tiên” đã mở.');
  });
  it('copes with a reached goal and missing data', () => {
    expect(firstStakeLine({ index: 8, total: 8 }, 0, 600)).toBe('Bậc 8/8 · đã chạm cúp 600! Huy hiệu “Đề đầu tiên” đã mở.');
    expect(firstStakeLine(null, null)).toBe('Huy hiệu “Đề đầu tiên” đã mở.');
    expect(firstStakeLine({ index: 2, total: 8 }, null)).toBe('Bậc 2/8. Huy hiệu “Đề đầu tiên” đã mở.');
  });
});
