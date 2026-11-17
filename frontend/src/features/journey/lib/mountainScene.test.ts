import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { journeySeries } from './scoreJourney';
import { CARD_RIGHT, FLOOR, MIN_SCENE_W, PEAK_DX, PEAK_GAP, SCENE_H, SCENE_W, SOC_DX, TRAIL_STEP, Y_HIGH, Y_LOW, buildMountain, dateGroups, deltaText, lastX, mountainScale, placeBubble, pointsToGo, poleLength, slotXs, snowCap, standOn, trailDots } from './mountainScene';

const X_LAST = lastX(SCENE_W);

let seq = 0;
const t = (date: string, totalScore: number, extra: Partial<StudySession> = {}) =>
  ({ id: `t${++seq}`, skillType: 'LR', sessionType: 'FULL_TEST', testName: `Test ${seq}`, date, durationMinutes: 120, totalScore, scaledListening: Math.round(totalScore / 2), scaledReading: totalScore - Math.round(totalScore / 2), createdAt: `${date}T0${seq % 9}`, ...extra }) as StudySession;
const pts = (scores: number[], opts: Parameters<typeof journeySeries>[1] = {}) =>
  journeySeries(scores.map((s, i) => t(`2026-10-${String(i + 1).padStart(2, '0')}`, s)), opts).points;

describe('mountain scene geometry', () => {
  it('spreads stakes from just right of the card to the latest one without letting boards touch', () => {
    expect(slotXs(0)).toEqual([]);
    expect(slotXs(1)).toEqual([X_LAST]);
    const eight = slotXs(8);
    expect(eight[7]).toBe(X_LAST);
    for (let i = 1; i < 8; i++) expect(eight[i] - eight[i - 1]).toBeGreaterThanOrEqual(56);
    expect(eight[1] - eight[0]).toBeLessThanOrEqual(84);
    expect(slotXs(2)[1] - slotXs(2)[0]).toBe(84);
    // The first of many stands right of the card, and a longer scene lets the stakes spread further, up to the cap.
    expect(eight[0]).toBeGreaterThan(CARD_RIGHT);
    const wide = slotXs(8, 1400), narrow = slotXs(8, MIN_SCENE_W);
    expect(wide[7]).toBe(lastX(1400));
    expect(wide[0]).toBeGreaterThanOrEqual(narrow[0] - 1e-9);
    for (const xs of [wide, narrow]) for (let i = 1; i < 8; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(56);
    // The window's right side moves the latest stake, the peak and everything with it.
    expect(buildMountain(pts([650, 700]), 800, 'total', 1300).apex[0]).toBe(lastX(1300) + PEAK_DX);
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
    expect(m.soc?.[0]).toBe(X_LAST + SOC_DX);
    expect(m.latestIdx).toBe(0);
    expect(m.trail).toHaveLength(3);
    expect(m.ys[0]).toBeGreaterThan(Y_HIGH);
    expect(m.ys[0]).toBeLessThanOrEqual(Y_LOW);
  });

  it('handles two tests and a drop without the ridge leaving the scene', () => {
    const m = buildMountain(pts([700, 640]), 800);
    expect(m.ys[1]).toBeGreaterThan(m.ys[0]);
    for (const [x, y] of m.ridge) { expect(y).toBeLessThanOrEqual(SCENE_H); expect(y).toBeGreaterThanOrEqual(Y_HIGH - 20); expect(x).toBeLessThanOrEqual(X_LAST + 130); }
    for (let i = 1; i < m.ridge.length; i++) expect(m.ridge[i][0]).toBeGreaterThanOrEqual(m.ridge[i - 1][0]);
    expect(m.ridgeAt(m.xs[0])).toBeCloseTo(m.ys[0], 5);
    expect(m.ridgeAt(-500)).toBe(m.ridge[0][1]);
  });

  it('starts the ridge at the left edge of the scene, whether there is one stake or several', () => {
    for (const scores of [[650], [700, 640], [620, 665, 690, 725, 710, 740, 765]]) {
      for (const width of [MIN_SCENE_W, SCENE_W, 1300]) {
        const m = buildMountain(pts(scores), 800, 'total', width);
        expect(m.ridge[0][0]).toBe(0);
        expect(m.ridge[0][1]).toBeLessThanOrEqual(FLOOR);
        expect(m.ridge[0][1]).toBeGreaterThan(SCENE_H - 140);
        // A real slope, not a flat wedge: the ridge climbs between the edge and the first stake.
        expect(m.ridgeAt(m.xs[0])).toBeLessThan(m.ridge[0][1] - 20);
      }
    }
    expect(buildMountain([], 800).ridge[0][0]).toBe(0);
  });

  it('stands Sóc on the ridge just right of the latest stake, rising or falling', () => {
    for (const scores of [[620, 665, 690, 725, 710, 740, 765], [740, 700, 650], [650], [700, 760, 640]]) {
      const m = buildMountain(pts(scores), 800);
      const [sx, sy] = m.soc!;
      expect(sx).toBeCloseTo(m.xs[m.latestIdx] + SOC_DX, 5);
      // The lower foot touches the ridge and the other one is not floating above it.
      const feet = [m.ridgeAt(sx - 11), m.ridgeAt(sx + 11), m.ridgeAt(sx)];
      expect(sy).toBeCloseTo(Math.max(...feet), 5);
      for (const f of feet) expect(sy - f).toBeLessThan(14);
    }
    const slope = (x: number) => 100 + x * 0.5, falling = (x: number) => 400 - x * 0.5;
    expect(standOn(slope, 200)[1]).toBe(slope(211));
    expect(standOn(falling, 200)[1]).toBe(falling(189));
  });

  it('draws the latest stake as a longer gold one', () => {
    const m = buildMountain(pts([620, 665, 690]), 800);
    expect(m.latestIdx).toBe(2);
    expect(m.poles[2]).toBeGreaterThanOrEqual(34);
    expect(m.poles[2]).toBeGreaterThan(m.poles[1]);
    expect(buildMountain(pts([700, 760, 810]), 800).latestIdx).toBe(2);
    expect(buildMountain([], 800).latestIdx).toBe(-1);
  });

  it('lays small dots every 13px from the latest stake down to the saddle and up to the flag, grey on the snow', () => {
    const m = buildMountain(pts([620, 665, 690, 725, 710, 740, 765]), 800);
    expect(m.trail).toHaveLength(3);
    const dots = trailDots(m.trail, m.apex);
    expect(dots.length).toBeGreaterThan(10);
    // The two legs are straight lines: no zigzag, dots keep going right of the stake and end by the flag.
    for (let i = 1; i < dots.length; i++) expect(Math.hypot(dots[i].x - dots[i - 1].x, dots[i].y - dots[i - 1].y)).toBeLessThanOrEqual(TRAIL_STEP + 0.01);
    expect(dots[0].x).toBeGreaterThan(m.xs[6]);
    expect(Math.abs(dots[dots.length - 1].x - m.apex[0])).toBeLessThan(24);
    const snow = dots.filter(d => d.snow);
    expect(snow.length).toBeGreaterThan(0);
    expect(snow.length).toBeLessThan(dots.length / 2);
    const cap = snowCap(m.apex);
    for (const d of snow) { expect(d.y).toBeGreaterThanOrEqual(m.apex[1]); expect(d.y).toBeLessThanOrEqual(Math.max(...cap.map(p => p[1]))); }
    expect(trailDots(null, m.apex)).toEqual([]);
    expect(trailDots(buildMountain(pts([700, 760, 810]), 800).trail, m.apex)).toEqual([]);
  });

  it('words a test against the one before it', () => {
    expect(deltaText(null)).toBe('đề đầu tiên');
    expect(deltaText(45)).toBe('▲ 45 so với đề trước');
    expect(deltaText(-15)).toBe('▼ 15 so với đề trước');
    expect(deltaText(0)).toBe('bằng đề trước');
  });

  it('moves a speech bubble up until it clears stakes, the card and the ridge', () => {
    const ridge = (x: number) => 500 - x * 0.2;
    // Nothing in the way: stays where it was asked.
    expect(placeBubble(ridge, 600, 250, 40, 100, [])).toBe(100);
    // A stake board in the way pushes it above the board.
    const board = { x: 500, y: 90, w: 56, h: 100 };
    const top = placeBubble(ridge, 600, 250, 40, 100, [board]);
    expect(top + 40).toBeLessThanOrEqual(board.y);
    // A ridge rising into it pushes it up too, and it never goes above the minimum.
    expect(placeBubble(() => 120, 600, 250, 40, 100, [])).toBeLessThan(100);
    expect(placeBubble(() => 60, 600, 250, 40, 100, [])).toBe(14);
    expect(placeBubble(ridge, 600, 250, 40, 20, [{ x: 0, y: 0, w: 2000, h: 2000 }], 14)).toBe(14);
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
