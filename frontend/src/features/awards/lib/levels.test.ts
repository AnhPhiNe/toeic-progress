import { describe, expect, it } from 'vitest';
import { LEVELS, levelForStars, levelProgress, levelsGained } from './levels';

describe('levels', () => {
  it('maps stars to the seven levels', () => {
    expect(LEVELS.map(l => l.stars)).toEqual([0, 5, 12, 20, 36, 55, 80]);
    expect(levelForStars(0).name).toBe('Người mới');
    expect(levelForStars(4).n).toBe(1);
    expect(levelForStars(5).name).toBe('Tập sự');
    expect(levelForStars(23).name).toBe('Thợ săn điểm');
    expect(levelForStars(80).name).toBe('Huyền thoại TOEIC');
    expect(levelForStars(500).n).toBe(7);
  });

  it('reports what is left for the next level', () => {
    expect(levelProgress(23)).toMatchObject({ toNext: 13, next: { n: 5 } });
    expect(levelProgress(23).ratio).toBeCloseTo(23 / 36);
    expect(levelProgress(90)).toMatchObject({ toNext: 0, next: null, ratio: 1 });
  });

  it('lists the levels gained since last seen', () => {
    expect(levelsGained(3, 5)).toEqual([4, 5]);
    expect(levelsGained(5, 5)).toEqual([]);
    expect(levelsGained(0, 2)).toEqual([2]);
  });
});
