import { describe, it, expect } from 'vitest';
import type { PacingRun } from '@/shared/types';
import { bestSeconds, currentStepIndex, dayLabel, dishName, dishOf, formatSpan, isLastStretch, lastSeconds, paceQuestion, paceTag, recipeSteps, recordGain, sprinkles, strawberryCount, stepFreeMinutes, focusRunsOn, nextBreak, gainLabel } from './bakery';

const run = (id: string, patch: Partial<PacingRun> = {}): PacingRun => ({ id, presetId: 'PART_7', presetName: 'Part 7', partType: 'PART_7', date: '2026-11-13', createdAt: `2026-11-13T00:00:${id.padStart(2, '0')}Z`, plannedMinutes: 55, actualMinutes: 52, actualSeconds: 3130, finishedNaturally: false, phases: [], totalQuestions: 54, ...patch });

describe('recipe steps', () => {
  it('splits 54 questions as in the sketch: 1-10, 11-20, 21-30, 31-40, 41-54', () => {
    const steps = recipeSteps(54, 1);
    expect(steps.map(s => `${s.from}-${s.to}`)).toEqual(['1-10', '11-20', '21-30', '31-40', '41-54']);
    expect(steps.map(s => s.name)).toEqual(['Trộn bột', 'Cho vào lò', 'Bánh nở', 'Phủ kem', 'Trang trí']);
  });
  it('splits other Parts so every question belongs to exactly one step', () => {
    expect(recipeSteps(30, 1).map(s => `${s.from}-${s.to}`)).toEqual(['1-6', '7-12', '13-18', '19-24', '25-30']);
    expect(recipeSteps(16, 1).map(s => `${s.from}-${s.to}`)).toEqual(['1-3', '4-6', '7-9', '10-12', '13-16']);
    expect(recipeSteps(100, 1)[4]).toMatchObject({ from: 81, to: 100 });
    expect(recipeSteps(3, 1)).toHaveLength(3);
    expect(recipeSteps(1, 1)).toEqual([{ from: 1, to: 1, name: 'Trộn bột', state: 'now' }]);
  });
  it('ticks a step only after the pace passes its last question', () => {
    // 54 questions in 55 minutes: about 61 seconds each. Question 17 is at 16 * 61.1 s.
    const per = 55 * 60 / 54;
    const at17 = paceQuestion(16 * per + 1, 55 * 60, 54);
    expect(at17).toBe(17);
    expect(recipeSteps(54, at17).map(s => s.state)).toEqual(['done', 'now', 'todo', 'todo', 'todo']);
    const at10 = paceQuestion(9 * per + 1, 55 * 60, 54);
    expect(at10).toBe(10);
    expect(recipeSteps(54, at10).map(s => s.state)).toEqual(['now', 'todo', 'todo', 'todo', 'todo']);
    const at11 = paceQuestion(10 * per + 1, 55 * 60, 54);
    expect(recipeSteps(54, at11).map(s => s.state)).toEqual(['done', 'now', 'todo', 'todo', 'todo']);
    expect(currentStepIndex(recipeSteps(54, at17))).toBe(1);
  });
  it('keeps the last step current when the pace reaches the final question', () => {
    const steps = recipeSteps(54, paceQuestion(55 * 60, 55 * 60, 54));
    expect(steps.map(s => s.state)).toEqual(['done', 'done', 'done', 'done', 'now']);
    expect(currentStepIndex(steps)).toBe(4);
  });
  it('paces from question 1 at the start and never past the last question', () => {
    expect(paceQuestion(0, 3300, 54)).toBe(1);
    expect(paceQuestion(99999, 3300, 54)).toBe(54);
    expect(paceQuestion(10, 600, 0)).toBe(1);
  });
});

describe('last stretch', () => {
  it('lights up in the last five minutes, or the last half of a short drill', () => {
    expect(isLastStretch(301, 3300)).toBe(false);
    expect(isLastStretch(300, 3300)).toBe(true);
    expect(isLastStretch(1, 3300)).toBe(true);
    expect(isLastStretch(0, 3300)).toBe(false);
    expect(isLastStretch(200, 480)).toBe(true);
    expect(isLastStretch(250, 480)).toBe(false);
    expect(isLastStretch(31, 60)).toBe(false);
  });
});

describe('strawberries', () => {
  it('gives one per seven correct answers, rounded and capped', () => {
    expect(strawberryCount(0)).toBe(0);
    expect(strawberryCount(2)).toBe(0);
    expect(strawberryCount(7)).toBe(1);
    expect(strawberryCount(48)).toBe(7);
    expect(strawberryCount(100)).toBe(8);
    expect(strawberryCount(-5)).toBe(0);
  });
});

describe('sớm / trễ and spans', () => {
  it('formats spans', () => {
    expect(formatSpan(170)).toBe('2′50');
    expect(formatSpan(65)).toBe('1′05');
    expect(formatSpan(20)).toBe('20″');
    expect(formatSpan(120)).toBe('2′');
    expect(formatSpan(0)).toBe('0″');
  });
  it('compares with the planned time', () => {
    expect(paceTag(55, 3130)).toEqual({ kind: 'early', text: 'sớm 2′50' });
    expect(paceTag(12, 785)).toEqual({ kind: 'late', text: 'trễ 1′05' });
    expect(paceTag(8, 460)).toEqual({ kind: 'early', text: 'sớm 20″' });
    expect(paceTag(8, 480)).toEqual({ kind: 'even', text: 'đúng giờ' });
  });
});

describe('day labels', () => {
  it('uses today, yesterday, weekdays and dates', () => {
    expect(dayLabel('2026-11-15', '2026-11-15')).toBe('Hôm nay');
    expect(dayLabel('2026-11-14', '2026-11-15')).toBe('Hôm qua');
    expect(dayLabel('2026-11-13', '2026-11-15')).toBe('Thứ 6');
    expect(dayLabel('2026-11-09', '2026-11-15')).toBe('Thứ 2');
    expect(dayLabel('2026-11-08', '2026-11-15')).toBe('08/11');
    expect(dayLabel('bad', '2026-11-15')).toBe('bad');
  });
});

describe('records', () => {
  it('uses the shortest time the learner stopped themselves, per Part', () => {
    const runs = [run('1'), run('2', { actualSeconds: 3200 }), run('3', { actualSeconds: 2000, partType: 'PART_5' }),
      run('4', { actualSeconds: 100 }), run('5', { actualSeconds: 3000, deletedAt: '2026-11-14' }), run('6', { actualSeconds: 3300, finishedNaturally: true })];
    expect(bestSeconds(runs, 'PART_7')).toBe(3130);
    expect(bestSeconds(runs, 'PART_5')).toBe(2000);
    expect(bestSeconds(runs, 'PART_6')).toBeNull();
    expect(bestSeconds([run('7', { finishedNaturally: true })], 'PART_7')).toBeNull();
  });
  it('takes the latest run for the speech bubble', () => {
    const runs = [run('1', { date: '2026-11-10', actualSeconds: 3000 }), run('2', { date: '2026-11-13', actualSeconds: 3130 })];
    expect(lastSeconds(runs, 'PART_7')).toBe(3130);
    expect(lastSeconds(runs, 'PART_5')).toBeNull();
  });
  it('reports a gain only for a faster, self-stopped run with a previous record', () => {
    expect(recordGain(3130, 3040, false)).toBe(90);
    expect(recordGain(3130, 3130, false)).toBeNull();
    expect(recordGain(3130, 3300, false)).toBeNull();
    expect(recordGain(null, 3000, false)).toBeNull();
    expect(recordGain(3130, 3000, true)).toBeNull();
  });
});

describe('dishes and sprinkles', () => {
  it('maps each choice to a dish', () => {
    expect(dishOf('PART_5')).toBe('cupcake');
    expect(dishOf('PART_6')).toBe('cookies');
    expect(dishOf('PART_7')).toBe('layer');
    expect(dishOf('FULL_READING')).toBe('tiers');
    expect(dishName('PART_7')).toBe('Bánh kem');
    expect(dishOf('PART_7_SINGLE')).toBe('layer');
  });
  it('lays sprinkles around the card, never on it, the same every time', () => {
    const list = sprinkles();
    expect(list.length).toBeGreaterThan(40);
    expect(list.every(s => !(s.x > 27 && s.x < 72 && s.y > 14 && s.y < 88))).toBe(true);
    expect(sprinkles()).toEqual(list);
  });
});

describe('Mẻ tự do', () => {
  it('steps minutes by five, single minutes under five, within 1–120', () => {
    expect(stepFreeMinutes(25, -1)).toBe(20);
    expect(stepFreeMinutes(25, 1)).toBe(30);
    expect(stepFreeMinutes(5, -1)).toBe(4);
    expect(stepFreeMinutes(4, 1)).toBe(5);
    expect(stepFreeMinutes(1, -1)).toBe(1);
    expect(stepFreeMinutes(120, 1)).toBe(120);
    expect(stepFreeMinutes(23, 1)).toBe(25);
    expect(stepFreeMinutes(23, -1)).toBe(20);
    expect(stepFreeMinutes(500, 0)).toBe(120);
  });
  it('counts only today\'s live focus runs, not breaks, other days or deleted ones', () => {
    const runs = [
      run('1', { partType: 'POMODORO', presetId: 'POMODORO_WORK' }),
      run('2', { partType: 'POMODORO', presetId: 'POMODORO_SHORT_BREAK' }),
      run('3', { partType: 'POMODORO', presetId: 'POMODORO_WORK', date: '2026-11-12' }),
      run('4', { partType: 'POMODORO', presetId: 'POMODORO_WORK', deletedAt: '2026-11-13T01:00:00Z' }),
      run('5')
    ];
    expect(focusRunsOn(runs, '2026-11-13')).toBe(1);
  });
  it('takes a long break after every fourth focus run, a short one otherwise', () => {
    const settings = { shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 };
    expect(nextBreak(1, settings)).toEqual({ phase: 'SHORT_BREAK', minutes: 5, long: false });
    expect(nextBreak(3, settings)).toEqual({ phase: 'SHORT_BREAK', minutes: 5, long: false });
    expect(nextBreak(4, settings)).toEqual({ phase: 'LONG_BREAK', minutes: 15, long: true });
    expect(nextBreak(8, settings).long).toBe(true);
    expect(nextBreak(0, settings).long).toBe(false);
  });
  it('writes the gained time in minutes, or seconds under a minute', () => {
    expect(gainLabel(1500)).toBe('+25 phút');
    expect(gainLabel(42)).toBe('+42 giây');
  });
  it('draws a croissant of its own', () => {
    expect(dishOf('POMODORO')).toBe('croissant');
  });
});