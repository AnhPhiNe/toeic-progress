import { describe, expect, it } from 'vitest';
import { estimateMilestones } from '@/shared/domain/milestones';
import { hasChosenGoal, parseTargetInput, profileWithGoal, stairsSummary, todayMode } from './goalSetup';
import { defaultProfile } from '@/shared/data/dataBundle';

describe('estimateMilestones', () => {
  it('climbs 450 -> 850 in eight blocks of 50', () => {
    expect(estimateMilestones(850)).toEqual({ step: 50, values: [450, 500, 550, 600, 650, 700, 750, 800, 850] });
  });
  it('uses the real stairs rule for 600 (25 points a block)', () => {
    const e = estimateMilestones(600);
    expect(e.step).toBe(25);
    expect(e.values).toEqual([450, 475, 500, 525, 550, 575, 600]);
  });
  it('switches to 100 per block when 50 would need more than eight blocks', () => {
    expect(estimateMilestones(900)).toEqual({ step: 100, values: [400, 500, 600, 700, 800, 900] });
    expect(estimateMilestones(990)).toEqual({ step: 100, values: [400, 500, 600, 700, 800, 900, 990] });
  });
  it('never exceeds eight blocks below the trophy for typical goals and ends on the target', () => {
    for (const target of [600, 650, 700, 750, 800, 850, 900, 950, 990]) {
      const { values } = estimateMilestones(target);
      expect(values[values.length - 1]).toBe(target);
      expect(values.length - 1).toBeLessThanOrEqual(8);
      expect(values.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('gives low goals a climb of their own instead of an empty staircase', () => {
    const { values } = estimateMilestones(300);
    expect(values[0]).toBeLessThan(300);
    expect(values[values.length - 1]).toBe(300);
    expect(estimateMilestones(10).values).toEqual([0, 10]);
  });
});

describe('stairsSummary', () => {
  it('counts blocks below the trophy', () => {
    expect(stairsSummary(850)).toEqual({ blocks: 8, step: 50 });
    expect(stairsSummary(990)).toEqual({ blocks: 6, step: 100 });
  });
});

describe('parseTargetInput', () => {
  it('accepts whole goals from 10 to 990 in steps of 5', () => {
    expect(parseTargetInput('850')).toBe(850);
    expect(parseTargetInput(' 725 ')).toBe(725);
    expect(parseTargetInput('10')).toBe(10);
    expect(parseTargetInput('990')).toBe(990);
  });
  it('rejects half-typed, out-of-range and off-step values', () => {
    for (const bad of ['', '  ', '8', '85x', '5', '0', '995', '1000', '-50', '12.5', '851', 'abc', '07a']) expect(parseTargetInput(bad)).toBeNull();
  });
});

describe('goal state', () => {
  it('treats the untouched default 990 as not chosen until goalChosen is set', () => {
    const profile = defaultProfile();
    expect(hasChosenGoal(profile)).toBe(false);
    expect(hasChosenGoal({ ...profile, goalChosen: true })).toBe(true);
    expect(hasChosenGoal({ ...profile, targetScore: 850 })).toBe(true);
  });
  it('profileWithGoal saves the goal and marks it chosen', () => {
    const next = profileWithGoal(defaultProfile(), 990);
    expect(next.targetScore).toBe(990);
    expect(hasChosenGoal(next)).toBe(true);
  });
  it('picks the Hôm nay mode', () => {
    expect(todayMode({ hasTests: false, chosen: false, editing: false })).toBe('choose');
    expect(todayMode({ hasTests: false, chosen: true, editing: false })).toBe('ready');
    expect(todayMode({ hasTests: false, chosen: true, editing: true })).toBe('choose');
    expect(todayMode({ hasTests: true, chosen: false, editing: true })).toBe('climb');
  });
});
