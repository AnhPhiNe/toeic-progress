import { describe, expect, it } from 'vitest';
import { FIRST_STAKE, PEAK, stakeAt, stakeCount, trailGeometry, verdict } from './summitTrail';
import type { Forecast } from './scoreJourney';

describe('stakes on the trail', () => {
  it('shows max(4, tests + 3) stakes', () => {
    expect([0, 1, 2, 3, 5, 8].map(stakeCount)).toEqual([4, 4, 5, 6, 8, 11]);
  });
  it('spreads stakes from the foot to just below the summit', () => {
    expect(stakeAt(0, 6)).toBe(FIRST_STAKE);
    for (let k = 1; k < 6; k++) expect(stakeAt(k, 6)).toBeGreaterThan(stakeAt(k - 1, 6));
    expect(stakeAt(5, 6)).toBeLessThan(1);
  });
  it('places stakes on the trail in climbing order (higher up = smaller y) and the latest test fraction', () => {
    const g = trailGeometry({ tx: 0, ty: 0, s: 1 }, 3);
    expect(g.stakes).toHaveLength(6);
    for (let k = 1; k < 6; k++) expect(g.stakes[k][1]).toBeLessThan(g.stakes[k - 1][1]);
    expect(g.latest).toBeCloseTo(stakeAt(2, 6), 9);
    const end = g.at(1);
    expect(Math.hypot(end[0] - PEAK[0], end[1] - PEAK[1])).toBeLessThan(6);
    expect(trailGeometry({ tx: 0, ty: 0, s: 1 }, 0).latest).toBe(-1);
  });
});

describe('Mình có kịp không?', () => {
  const rising = (over: Partial<Extract<Forecast, { kind: 'rising' }>>): Forecast => ({
    kind: 'rising', slopePerTest: 22, testsAhead: 3, slot: 5, score: 850, inView: true, estDate: '2026-12-25', beforeExam: true, daysLeft: 58, atExam: 900, ...over
  });
  it('Kịp! with the projected date before the exam', () => {
    const v = verdict(3, rising({}), 850, '2027-02-01');
    expect(v).toMatchObject({ kind: 'kip', title: 'Kịp!', text: 'Theo đà này chạm 850 khoảng 25/12 — trước ngày thi 01/02.', bold: ['850', '25/12'] });
  });
  it('Hơi gấp when the projection is after the exam', () => {
    expect(verdict(3, rising({ estDate: '2027-02-20', beforeExam: false }), 850, '2027-02-01').kind).toBe('late');
  });
  it('without an exam date, without a pace, early, flat, reached and empty', () => {
    expect(verdict(3, rising({ daysLeft: null }), 850, null)).toMatchObject({ kind: 'rising', text: 'Theo đà này chạm 850 khoảng 25/12.' });
    expect(verdict(3, rising({ estDate: null, daysLeft: null }), 850, null).text).toBe('Theo đà này chạm 850 sau khoảng 3 đề nữa.');
    expect(verdict(1, null, 850, '2027-02-01')).toMatchObject({ kind: 'early', title: null, text: 'Ghi thêm một đề để Sóc vẽ đường dự báo' });
    expect(verdict(3, null, 850, '2027-02-01').kind).toBe('flat');
    expect(verdict(3, { kind: 'reached', daysLeft: 10 }, 850, '2027-02-01').title).toBe('Chạm đỉnh!');
    expect(verdict(0, null, 850, null).kind).toBe('empty');
  });
});
