import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekMonday, getOrCreateWeeklyPlan } from './storage';
import { buildWeeklyStudyPlan } from './studyPlan';
import { UserProfile, StudySession } from '../types';

describe('studyPlan SMART engine', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k]);
    globalThis.localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      length: 0,
      key: () => null
    } as unknown as Storage;
  });

  const mockProfile: UserProfile = {
    name: 'Test User',
    targetScore: 990,
    examDate: '2026-11-10',
    currentStreak: 5,
    longestStreak: 10,
    streakFreezes: 2,
    lastStudyDate: '2026-09-24',
    dailyMinGoalMinutes: 30,
    motto: '',
    selectedSkill: 'LR'
  };

  it('calculates getWeekMonday correctly', () => {
    // 2026-09-24 is Thursday -> Monday is 2026-09-21
    expect(getWeekMonday('2026-09-24')).toBe('2026-09-21');
    // 2026-09-21 is Monday -> Monday is 2026-09-21
    expect(getWeekMonday('2026-09-21')).toBe('2026-09-21');
    // 2026-09-27 is Sunday -> Monday is 2026-09-21
    expect(getWeekMonday('2026-09-27')).toBe('2026-09-21');
  });

  it('creates and caches default weekly plan with proper targets', () => {
    const monday = '2026-09-21';
    const plan = getOrCreateWeeklyPlan(monday, mockProfile);
    expect(plan.weekKey).toBe(monday);
    expect(plan.tasks.length).toBe(2);
    expect(plan.tasks[0].type).toBe('AUTO_FULL_TEST');
    expect(plan.tasks[1].type).toBe('AUTO_STUDY_TIME');
    expect(plan.tasks[1].target).toBe(210); // 30 * 7
  });

  it('evaluates task completion and percentages accurately', () => {
    const monday = '2026-09-21';
    const sessions: StudySession[] = [
      {
        id: 's1',
        skillType: 'LR',
        sessionType: 'FULL_TEST',
        testName: 'ETS 2024 Test 1',
        date: '2026-09-22',
        durationMinutes: 120,
        totalScore: 850,
        createdAt: '2026-09-22T10:00:00Z'
      }
    ];

    const summary = buildWeeklyStudyPlan(monday, mockProfile, sessions, []);
    expect(summary.totalTasks).toBe(2);
    expect(summary.fullTestsThisWeek).toBe(1);
    expect(summary.minutesThisWeek).toBe(120);

    // Full test task (target 1) should be complete (1/1)
    const ftTask = summary.tasks.find(t => t.type === 'AUTO_FULL_TEST');
    expect(ftTask?.isComplete).toBe(true);
    expect(ftTask?.done).toBe(1);
    expect(ftTask?.percent).toBe(100);

    // Minutes task (target 210) should have 120/210 (~57%)
    const minTask = summary.tasks.find(t => t.type === 'AUTO_STUDY_TIME');
    expect(minTask?.isComplete).toBe(false);
    expect(minTask?.done).toBe(120);
    expect(minTask?.percent).toBe(57);

    // Overall: 1 of 2 tasks complete = 50%
    expect(summary.completedTasks).toBe(1);
    expect(summary.completionPercent).toBe(50);
  });

  it('supports manual completion toggle for auto tasks (offline/flexible learning)', () => {
    const monday = '2026-09-21';
    const plan = getOrCreateWeeklyPlan(monday, mockProfile);
    
    // Simulate user checking off the AUTO_STUDY_TIME task manually (studied with paper book offline)
    const modifiedTasks = plan.tasks.map(t => {
      if (t.type === 'AUTO_STUDY_TIME') {
        return { ...t, isCompleted: true };
      }
      return t;
    });

    const summary = buildWeeklyStudyPlan(monday, mockProfile, [], [], [], {
      weekKey: monday,
      tasks: modifiedTasks
    });

    const minTask = summary.tasks.find(t => t.type === 'AUTO_STUDY_TIME');
    expect(minTask?.isComplete).toBe(true);
    expect(minTask?.done).toBe(210); // Automatically equals full target
    expect(minTask?.percent).toBe(100);
  });
});
