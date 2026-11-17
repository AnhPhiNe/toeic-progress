import { describe, expect, it } from 'vitest';
import type { Badge } from '../../lib/badges';
import { badgeAction, badgePercent } from './awardsPhoneLogic';

const mk = (over: Partial<Badge>): Badge => ({ id: 'score-800', family: 'score', tier: 'g', icon: 'star', label: '800', title: 't', how: 'h', hint: 'h', earned: false, progress: 0.91, ...over });

describe('badgeAction', () => {
  it('routes locked badges by what they need', () => {
    expect(badgeAction(mk({}))?.tab).toBe('history');
    expect(badgeAction(mk({ id: 'streak-7', family: 'streak' }))?.tab).toBe('dashboard');
    expect(badgeAction(mk({ id: 'part-5', family: 'part' }))?.tab).toBe('mistakes');
    expect(badgeAction(mk({ id: 'speed-ontime', family: 'speed' }))?.tab).toBe('exam-mode');
  });
  it('has none for earned or secret badges', () => {
    expect(badgeAction(mk({ earned: true }))).toBeNull();
    expect(badgeAction(mk({ id: 'secret-owl', family: 'secret' }))).toBeNull();
  });
  it('rounds progress to a percent', () => { expect(badgePercent(mk({}))).toBe(91); });
});
