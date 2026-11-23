import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { DESK_ROAD, FINISH_AT, flagSpots, lateForExam, phoneFit, phoneRoad, roadRoute, roadSign, scoreLen, walkFrames } from './roadLayout';
import { buildRoadModel, stopAtOrBelow } from './roadModel';

const VALUES = [700, 720, 740, 760, 780, 790, 810, 830, 850];

describe('road layout', () => {
  it('lays the eight stops in rows of 3 / 3 / 2 that snake left-right-left, then the goal', () => {
    const rows = [DESK_ROAD.stops.slice(0, 3), DESK_ROAD.stops.slice(3, 6), DESK_ROAD.stops.slice(6)];
    const ys = rows.map(row => row.reduce((a, p) => a + p[1], 0) / row.length);
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
    expect(rows[0][0][0]).toBeLessThan(rows[0][2][0]);
    expect(rows[1][0][0]).toBeGreaterThan(rows[1][2][0]);
    expect(rows[2][0][0]).toBeLessThan(rows[2][1][0]);
    expect(DESK_ROAD.goal[1]).toBeLessThan(ys[2]);
  });

  it('puts the stops in order along the road, the goal last', () => {
    const route = roadRoute(DESK_ROAD);
    expect(route.stopLen).toHaveLength(9);
    for (let i = 1; i < 9; i++) expect(route.stopLen[i]).toBeGreaterThan(route.stopLen[i - 1]);
    expect(route.stopLen[8]).toBeCloseTo(route.L, 0);
    const [x, y] = route.atLen(route.stopLen[3]);
    expect(Math.hypot(x - DESK_ROAD.stops[3][0], y - DESK_ROAD.stops[3][1])).toBeLessThan(3);
  });

  it('places a score between the milestones around it and a reached goal before the arch', () => {
    const route = roadRoute(DESK_ROAD);
    const mid = scoreLen(route, VALUES, 750);
    expect(mid).toBeCloseTo((route.stopLen[2] + route.stopLen[3]) / 2, 0);
    expect(scoreLen(route, VALUES, 600)).toBe(route.stopLen[0]);
    const finish = route.stopLen[7] + FINISH_AT * (route.L - route.stopLen[7]);
    expect(scoreLen(route, VALUES, 900)).toBeCloseTo(finish, 5);
    expect(scoreLen(route, VALUES, 900)).toBeLessThan(route.L);
  });

  it('keeps flags off the stops and off each other, newest kept, at most six', () => {
    const route = roadRoute(DESK_ROAD);
    const tests = [745, 770, 790, 790].map((score, i) => ({ id: `t${i}`, score, date: `2026-11-2${i}`, name: `T${i}` }));
    const flags = flagSpots(route, VALUES, tests, DESK_ROAD.r);
    expect(flags.map(f => f.id)).toEqual(['t0', 't1', 't3']);
    expect(flags[2].latest).toBe(true);
    for (const f of flags) for (const [sx, sy] of DESK_ROAD.stops) expect(Math.hypot(f.x - sx, f.y - sy)).toBeGreaterThan(DESK_ROAD.r);
    // the flag foot is above the road
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, score: 700 + i * 12, date: '2026-11-01', name: '' }));
    expect(flagSpots(route, VALUES, many, DESK_ROAD.r).length).toBeLessThanOrEqual(6);
  });

  it('walks Sóc from one distance to another, ending at offset 0', () => {
    const route = roadRoute(DESK_ROAD);
    const frames = walkFrames(route, route.stopLen[3], route.stopLen[5], 8);
    expect(frames).toHaveLength(9);
    expect(frames[8][0]).toBeCloseTo(0, 5);
    expect(frames[8][1]).toBeCloseTo(0, 5);
    expect(Math.hypot(...frames[0])).toBeGreaterThan(100);
  });

  it('fits the phone road into the band between heading and panel', () => {
    const fit = phoneFit(390, 240, 540);
    const road = phoneRoad(fit);
    const ys = road.stops.map(p => p[1]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(540);
    expect(road.goal[1] - 168 * road.podiumS).toBeGreaterThanOrEqual(235);
    expect(road.stops.every(p => p[0] > 0 && p[0] < 390)).toBe(true);
  });
});

describe('road sign wording', () => {
  const base = { target: 850, reached: false, testsAhead: 3, examDate: '2027-02-01', today: '2026-12-05' };
  it('says how much room is left before the exam', () => {
    expect(roadSign({ ...base, tests: 3, goalDate: '2026-12-25' })).toBe('Theo đà này: chạm 850 ~25/12 · dư 5 tuần');
    expect(roadSign({ ...base, tests: 3, goalDate: '2027-01-29' })).toBe('Theo đà này: chạm 850 ~29/01 · sát ngày thi');
  });
  it('warns when the projection is after the exam', () => {
    expect(roadSign({ ...base, tests: 3, goalDate: '2027-02-20' })).toBe('Theo đà này: chạm 850 ~20/02 · trễ ngày thi 3 tuần');
    expect(lateForExam('2027-02-20', '2027-02-01', '2026-12-05')).toBe(true);
    expect(lateForExam('2027-01-20', '2027-02-01', '2026-12-05')).toBe(false);
  });
  it('drops the exam part without an exam date, and has a line for every other state', () => {
    expect(roadSign({ ...base, examDate: null, tests: 3, goalDate: '2026-12-25' })).toBe('Theo đà này: chạm 850 ~25/12');
    expect(roadSign({ ...base, tests: 0, goalDate: null })).toBe('Ghi đề đầu tiên để Sóc tìm chỗ của bạn trên đường');
    expect(roadSign({ ...base, tests: 1, goalDate: null })).toBe('Ghi thêm một đề để Sóc đoán ngày chạm 850');
    expect(roadSign({ ...base, tests: 3, goalDate: null, testsAhead: null })).toBe('Điểm đang chững · luyện Part yếu để lên tiếp');
    expect(roadSign({ ...base, tests: 3, goalDate: null, testsAhead: 2 })).toBe('Theo đà này: khoảng 2 đề nữa chạm 850');
    expect(roadSign({ ...base, tests: 4, reached: true, goalDate: null })).toBe('Bạn đã chạm 850! Bấm cúp để đặt mục tiêu mới');
  });
});

describe('road model', () => {
  const mk = (i: number, date: string, total: number) => ({
    id: `s${i}`, date, createdAt: `${date}T09:00:00Z`, testName: `Test ${i}`, sessionType: 'FULL_TEST', skillType: 'LR',
    totalScore: total, scaledListening: Math.round(total / 2), scaledReading: total - Math.round(total / 2), attemptNumber: 1
  }) as unknown as StudySession;
  const three = [mk(1, '2026-11-20', 745), mk(2, '2026-11-27', 770), mk(3, '2026-12-04', 790)];

  it('builds the mockup state: Sóc on stop 6 (790), projected dates ahead, Sóc walking from 760', () => {
    const m = buildRoadModel(three, 850, '2027-02-01', '2026-12-05');
    expect(m.steps.map(s => s.value)).toEqual(VALUES);
    expect(m.cur).toBe(5);
    expect(m.best).toBe(790);
    expect(m.proj.slice(6)).toEqual(['2026-12-11', '2026-12-18', '2026-12-25']);
    expect(m.proj.slice(0, 6).every(d => d === null)).toBe(true);
    expect(m.walkFrom).toBe(3);
    expect(m.sign).toBe('Theo đà này: chạm 850 ~25/12 · dư 5 tuần');
    expect(m.tests.map(t => t.score)).toEqual([745, 770, 790]);
  });

  it('one test: no projection yet; no test: estimated stones and Sóc before the start', () => {
    const one = buildRoadModel(three.slice(0, 1), 850, '2027-02-01', '2026-12-05');
    expect(one.cur).toBe(2);
    expect(one.proj.every(d => d === null)).toBe(true);
    expect(one.sign).toBe('Ghi thêm một đề để Sóc đoán ngày chạm 850');
    const none = buildRoadModel([], 850, null, '2026-12-05');
    expect(none.estimate).toBe(true);
    expect(none.cur).toBe(-1);
    expect(none.steps).toHaveLength(9);
  });

  it('goal reached: done, every step reached', () => {
    const m = buildRoadModel([...three, mk(4, '2026-12-05', 860)], 850, '2027-02-01', '2026-12-05');
    expect(m.done).toBe(true);
    expect(m.steps.every(s => s.reached)).toBe(true);
    expect(m.sign).toContain('Bạn đã chạm 850');
  });

  it('stopAtOrBelow picks the highest stop at or under a score', () => {
    expect(stopAtOrBelow(VALUES, 770)).toBe(3);
    expect(stopAtOrBelow(VALUES, 650)).toBe(0);
    expect(stopAtOrBelow(VALUES, 999)).toBe(7);
  });
});
