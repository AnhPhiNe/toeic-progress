import { describe, expect, it } from 'vitest';
import { applyGear, gearAtLevel, sanitizeGear, toggleGear, unlockedGear, wornGear } from './socGear';
import { socMoodSvg } from './socSvg';

describe('Sóc gear', () => {
  it('unlocks one item per level from 2 to 7', () => {
    expect([2, 3, 4, 5, 6, 7].map(n => gearAtLevel(n)?.id)).toEqual(['scarf', 'pack', 'glasses', 'helmet', 'cape', 'crown']);
    expect(gearAtLevel(1)).toBeUndefined();
    expect(unlockedGear(1)).toEqual([]);
    expect(unlockedGear(4).map(g => g.id)).toEqual(['scarf', 'pack', 'glasses']);
  });

  it('wears only the newest item until the learner chooses', () => {
    expect(wornGear(undefined, 1)).toEqual([]);
    expect(wornGear(undefined, 4)).toEqual(['glasses']);
    expect(wornGear([], 4)).toEqual([]);
  });

  it('drops locked and unknown items and keeps one head item', () => {
    expect(sanitizeGear(['crown', 'scarf', 'nope'], 3)).toEqual(['scarf']);
    expect(sanitizeGear(['glasses', 'helmet', 'pack'], 5)).toEqual(['helmet', 'pack']);
  });

  it('toggles items on and off; head items replace each other', () => {
    let worn = toggleGear([], 'scarf', 5);
    worn = toggleGear(worn, 'glasses', 5);
    expect(worn).toEqual(['scarf', 'glasses']);
    worn = toggleGear(worn, 'helmet', 5);
    expect(worn).toEqual(['scarf', 'helmet']);
    expect(toggleGear(worn, 'scarf', 5)).toEqual(['helmet']);
    expect(toggleGear([], 'crown', 5)).toEqual([]);
  });

  it('draws the accessories into every mood and leaves no marker behind', () => {
    for (const mood of ['idle', 'hi', 'yay', 'zzz', 'cheerC', 'cheerD'] as const) {
      const svg = socMoodSvg(mood, ['pack', 'glasses']);
      expect(svg).toContain('fill="#46b35a"');
      expect(svg).toContain('stroke="#2f3a33" stroke-width="5"');
      expect(svg).not.toContain('<!--g:');
    }
    expect(socMoodSvg('idle')).not.toContain('<!--g:');
    expect(applyGear('<g>x</g>', ['scarf'])).toBe('<g>x</g>');
  });
});
