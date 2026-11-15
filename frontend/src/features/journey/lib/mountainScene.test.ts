import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { journeySeries } from './scoreJourney';
import { FLOOR, PEAK_GAP, SCENE_H, X_LAST, Y_HIGH, Y_LOW, buildMountain, dateGroups, mountainScale, pointsToGo, poleLength, slotXs } from './mountainScene';

let seq = 0;
const t = (date: string, totalScore: number, extra: Partial<StudySession> = {}) =>
  ({ id: `t${++seq}`, skillType: 'LR', sessionType: 'FULL_TEST', testName: `Test ${seq}`, date, durationMinutes: 120, totalScore, scaledListening: Math.round(totalScore / 2), scaledReading: totalScore - Math.round(totalScore / 2), createdAt: `${date}T0${seq % 9}`, ...extra }) as StudySession;
const pts = (scores: number[], opts: Parameters<typeof journeySeries>[1] = {}) =>
  journeySeries(scores.map((s, i) => t(`2026-10-${String(i + 1).padStart(2, '0')}`, s)), opts).points;

describe('mountain scene geometry', () => {
  it('packs stakes to the left of the latest one without letting boards touch', () => {
    expect(slotXs(0)).toEqual([]);
    expect(slotXs(1)).toEqual([X_LAST]);
    const eight = slotXs(8);
    expect(eight[7]).toBe(X_LAST);
    for (let i = 1; i < 8; i++) expect(eight[i] - eight[i - 1]).toBeGreaterThanOrEqual(56);
    expect(eight[1] - eight[0]).toBeLessThanOrEqual(70);
    expect(slotXs(2)[1] - slotXs(2)[0]).toBe(70);
  });

  it('puts the peak at the target height and above the best stake', () => {
    const p = pts([620, 665, 690, 725, 710, 740, 765]);
    const m = mountainScale(p, 800);
    expect(m.pinned).toBe(false);
    expect(m.y(620)).toBeLessThanOrEqual(Y_LOW);
    expect(m.y(765)).toBeGreaterThan(m.apexY);
    expect(m.y(765) - m.apexY).toBeGreaterThanOrEqual(PEAK_GAP - 1);
    expect(m.apexY).toBeGreaterThanOrEqual(Y_HIGH);
    // A target higher on the scale stands higher on screen.
    expect(mountainScale(p, 800).y(800)).toBeLessThan(mountainScale(p, 800).y(765));
  });

  it('keeps a far-away target on screen (pinned) and a near target above the ridge', () => {
    const far = mountainScale(pts([300, 320, 340]), 900);
    expect(far.pinned).toBe(true);
    expect(far.apexY).toBe(Y_HIGH);
    const near = buildMountain(pts([700, 750, 795]), 800);
    expect(near.apex[1]).toBeLessThanOrEqual(near.ys[2] - PEAK_GAP + 0.5);
    expect(near.apex[1]).toBeGreaterThanOrEqual(Y_HIGH);
  });

  it('handles a single test: one stake, Sóc on it, a trail to the flag', () => {
    const m = buildMountain(pts([650]), 800);
    expect(m.xs).toEqual([X_LAST]);
    expect(m.onRidge).toEqual([0]);
    expect(m.sitIdx).toBe(0);
    expect(m.reached).toBe(false);
    expect(m.soc).toEqual([X_LAST, m.ys[0]]);
    expect(m.trail?.length).toBeGreaterThan(3);
    expect(m.ys[0]).toBeGreaterThan(Y_HIGH);
    expect(m.ys[0]).toBeLessThanOrEqual(Y_LOW);
  });

  it('handles two tests and a drop without the ridge leaving the scene', () => {
    const m = buildMountain(pts([700, 640]), 800);
    expect(m.ys[1]).toBeGreaterThan(m.ys[0]);
    for (const [x, y] of m.ridge) { expect(y).toBeLessThanOrEqual(SCENE_H); expect(y).toBeGreaterThanOrEqual(Y_HIGH - 20); expect(x).toBeLessThanOrEqual(X_LAST + 130); }
    for (let i = 1; i < m.ridge.length; i++) expect(m.ridge[i][0]).toBeGreaterThanOrEqual(m.ridge[i - 1][0]);
    expect(m.ridgeAt(m.xs[0])).toBeCloseTo(m.ys[0], 5);
    expect(m.ridgeAt(-500)).toBe(FLOOR);
  });

  it('copes with very high and very low scores', () => {
    const high = buildMountain(pts([940, 960, 975]), 990);
    expect(high.apex[1]).toBeGreaterThanOrEqual(Y_HIGH);
    expect(high.ys.every(y => y >= Y_HIGH - 20 && y <= FLOOR)).toBe(true);
    const low = buildMountain(pts([10, 30, 20]), 100);
    expect(low.ys.every(y => Number.isFinite(y) && y <= FLOOR - 40)).toBe(true);
    expect(low.apex[1]).toBeGreaterThanOrEqual(Y_HIGH);
    const flat = buildMountain(pts([500, 500, 500]), 500);
    expect(flat.ys.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(flat.apex[1])).toBe(true);
  });

  it('puts Sóc at the flag once the target is reached', () => {
    const m = buildMountain(pts([700, 760, 810]), 800);
    expect(m.reached).toBe(true);
    expect(m.sitIdx).toBe(-1);
    expect(m.trail).toBeNull();
    expect(m.soc?.[0]).toBeCloseTo(m.apex[0] - 36);
    expect(m.apex[1]).toBeLessThan(m.ys[2]);
  });

  it('works per section with a 495 cap and an empty history', () => {
    const p = pts([650, 700, 740], { metric: 'listening' });
    const m = buildMountain(p, 400, 'listening');
    expect(m.apex[1]).toBeGreaterThanOrEqual(Y_HIGH);
    const empty = buildMountain([], 800);
    expect(empty.onRidge).toEqual([]);
    expect(empty.soc).not.toBeNull();
    expect(empty.ridge.length).toBeGreaterThan(3);
  });

  it('keeps an outlier off the ridge but on the scene, and lengthens poles on steep slopes', () => {
    const p = pts([650, 665, 680, 695, 300, 710]);
    expect(p[4].excluded).toBe(true);
    const m = buildMountain(p, 800);
    expect(m.onRidge).not.toContain(4);
    expect(m.sitIdx).toBe(5);
    expect(m.ys[4]).toBeLessThanOrEqual(FLOOR - 40);
    const xs = [300, 360, 420], ys = [500, 480, 300];
    expect(poleLength(1, xs, ys, [0, 1, 2])).toBeGreaterThan(26);
    expect(poleLength(0, xs, ys, [0, 1, 2])).toBe(26);
  });

  it('groups same-day tests and counts the points to go', () => {
    const list = journeySeries([t('2026-11-09', 710), t('2026-11-09', 740), t('2026-11-11', 765)]).points;
    expect(dateGroups(list)).toEqual([{ from: 0, to: 1 }, { from: 2, to: 2 }]);
    expect(pointsToGo(list, 800)).toBe(35);
    expect(pointsToGo(list, 700)).toBe(0);
    expect(pointsToGo([], 800)).toBe(0);
  });
});
