import { describe, expect, it } from 'vitest';
import { estimateMilestones } from '@/shared/domain/milestones';
import { dmyLabel, monthsFromToday, goalLabel, hasChosenGoal, shownGoal, parseTargetInput, profileWithGoal, stairsSummary, todayMode } from './goalSetup';
import { defaultProfile } from '@/shared/data/dataBundle';

describe('exam date helpers', () => {
  it('adds calendar months and clamps the day', () => {
    expect(monthsFromToday('2026-11-23', 1)).toBe('2026-12-23');
    expect(monthsFromToday('2026-11-30', 3)).toBe('2027-02-28');
    expect(monthsFromToday('2026-12-31', 2)).toBe('2027-02-28');
  });
  it('formats dd/mm/yyyy', () => {
    expect(dmyLabel('2027-01-05')).toBe('05/01/2027');
    expect(dmyLabel('')).toBe('');
  });
});

describe('estimateMilestones', () => {
  it('climbs 450 -> 850 in eight blocks of 50', () => {
    expect(estimateMilestones(850)).toEqual({ step: 50, values: [450, 500, 550, 600, 650, 700, 750, 800, 850] });
  });
  it('splits other goals into eight stairs rounded to 10', () => {
    expect(estimateMilestones(600)).toEqual({ step: 19, values: [450, 470, 490, 510, 530, 540, 560, 580, 600] });
    expect(estimateMilestones(900)).toEqual({ step: 56, values: [450, 510, 560, 620, 680, 730, 790, 840, 900] });
    expect(estimateMilestones(990)).toEqual({ step: 68, values: [450, 520, 590, 650, 720, 790, 860, 920, 990] });
  });
  it('always has eight blocks below the trophy and ends on the target', () => {
    for (let target = 10; target <= 990; target += 5) {
      const { values } = estimateMilestones(target);
      expect(values[values.length - 1]).toBe(target);
      expect(values.length - 1).toBe(8);
    }
  });
  it('gives low goals a climb of their own instead of an empty staircase', () => {
    expect(estimateMilestones(300).values).toEqual([100, 130, 150, 180, 200, 230, 250, 280, 300]);
    expect(estimateMilestones(10).values).toEqual([0, 1, 3, 4, 5, 6, 8, 9, 10]);
  });
});

describe('stairsSummary', () => {
  it('counts blocks below the trophy', () => {
    expect(stairsSummary(850)).toEqual({ blocks: 8, step: 50 });
    expect(stairsSummary(990)).toEqual({ blocks: 8, step: 68 });
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
  it('counts a profile saved before the flag existed (goalChosen missing) as chosen', () => {
    const { goalChosen: _flag, ...legacy } = defaultProfile();
    expect(legacy.targetScore).toBe(990);
    expect(hasChosenGoal(legacy)).toBe(true);
    expect(shownGoal(legacy)).toBe(990);
    expect(goalLabel(legacy)).toBe('990');
    expect(goalLabel({ ...legacy, targetScore: 750 })).toBe('750');
  });
  it('keeps goalChosen false as not chosen and true as chosen', () => {
    expect(hasChosenGoal({ targetScore: 990, goalChosen: false })).toBe(false);
    expect(goalLabel({ targetScore: 990, goalChosen: false })).toBe('Chưa chọn');
    expect(hasChosenGoal({ targetScore: 990, goalChosen: true })).toBe(true);
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
