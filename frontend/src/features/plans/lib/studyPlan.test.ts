import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekMonday, getOrCreateWeeklyPlan } from '@/shared/data/storage';
import { buildWeeklyStudyPlan } from '@/features/plans/lib/studyPlan';
import { UserProfile, StudySession, PacingRun } from '@/shared/types';

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

  it('does not count an unscored Full Test record (old Sprint Reading saves) toward the weekly Full Test task', () => {
    const sessions: StudySession[] = [{
      id: 'sprint', skillType: 'LR', sessionType: 'FULL_TEST', testName: '[Luyện tốc độ] Sprint Reading',
      date: '2026-09-22', durationMinutes: 75, createdAt: '2026-09-22T10:00:00Z'
    }];
    const summary = buildWeeklyStudyPlan('2026-09-21', mockProfile, sessions, []);
    expect(summary.fullTestsThisWeek).toBe(0);
    expect(summary.tasks.find(t => t.type === 'AUTO_FULL_TEST')?.isComplete).toBe(false);
    expect(summary.minutesThisWeek).toBe(75);
  });

  it('ignores legacy manual completion flags on automatically tracked tasks', () => {
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
    expect(minTask?.isComplete).toBe(false);
    expect(minTask?.done).toBe(0);
    expect(minTask?.percent).toBe(0);
  });
  it('uses the weekly time target, taking the largest target if more than one exists', () => {
    const weekKey = '2026-09-21';
    const tasks = [210, 480].map((target, index) => ({ id: `time-${index}`, title: 'Học', type: 'AUTO_STUDY_TIME' as const, target, unit: 'phút', createdAt: '2026-09-21T00:00:00Z' }));
    expect(buildWeeklyStudyPlan(weekKey, mockProfile, [], [], [], { weekKey, tasks }).minutesGoalThisWeek).toBe(480);
    expect(buildWeeklyStudyPlan(weekKey, mockProfile, [], [], [], { weekKey, tasks: [] }).minutesGoalThisWeek).toBe(210);
  });

  it('keeps week boundaries and does not let old manual flags inflate any auto goal', () => {
    const weekKey = '2026-09-21';
    const stamp = '2026-09-21T00:00:00Z';
    const base: StudySession = { id: 'base', skillType: 'LR', sessionType: 'FULL_TEST', totalScore: 800, testName: 'ETS', date: weekKey, durationMinutes: 30, createdAt: stamp };
    const sessions: StudySession[] = [
      base,
      { ...base, id: 'last', date: '2026-09-27', durationMinutes: 45 },
      { ...base, id: 'before', date: '2026-09-20', durationMinutes: 120 },
      { ...base, id: 'after', date: '2026-09-28', durationMinutes: 120 },
      { ...base, id: 'invalid-time', date: '2026-09-22', durationMinutes: -10, sessionType: 'PART_PRACTICE' }
    ];
    const tasks = (['AUTO_FULL_TEST', 'AUTO_STUDY_TIME', 'AUTO_PART_PRACTICE'] as const).map(type => ({ id: type, title: type, type, target: 200, partNumber: 7, unit: 'bài', isCompleted: true, manualDone: 999, createdAt: stamp }));
    const summary = buildWeeklyStudyPlan(weekKey, mockProfile, sessions, [], [], { weekKey, tasks });
    expect(summary.fullTestsThisWeek).toBe(2);
    expect(summary.minutesThisWeek).toBe(75);
    expect(summary.daysStudiedThisWeek).toBe(3);
    expect(summary.tasks.map(task => task.done)).toEqual([2, 75, 0]);
    expect(summary.completedTasks).toBe(0);
    const afterDeletion = buildWeeklyStudyPlan(weekKey, mockProfile, sessions.map(session => ({ ...session, deletedAt: stamp })), [], [], { weekKey, tasks });
    expect(afterDeletion.tasks.every(task => task.done === 0)).toBe(true);
    expect(afterDeletion.daysStudiedThisWeek).toBe(0);
  });

  it('counts a measured ungraded Part once and excludes deleted study from time and days', () => {
    const stamp = '2026-09-22T10:00:00Z';
    const session: StudySession = { id: 'pacing-v2-measured', testName: 'Part 7 drill', skillType: 'LR', sessionType: 'PART_PRACTICE', date: '2026-09-22', durationMinutes: 2.5, createdAt: stamp };
    const deleted: StudySession = { ...session, id: 'deleted', date: '2026-09-23', durationMinutes: 120, totalScore: 850, sessionType: 'FULL_TEST', deletedAt: stamp };
    const measured: PacingRun = { id: session.id, presetId: 'PART_7_SINGLE', presetName: 'Part 7', partType: 'PART_7_SINGLE', totalQuestions: 29, date: session.date, createdAt: stamp, plannedMinutes: 25, actualMinutes: 2.5, actualSeconds: 150, finishedNaturally: false, phases: [] };
    const plan = { weekKey: '2026-09-21', tasks: [{ id: 'part', title: 'Part 7', type: 'AUTO_PART_PRACTICE' as const, partNumber: 7, target: 2, unit: 'bài', createdAt: stamp }] };
    const summary = buildWeeklyStudyPlan(plan.weekKey, mockProfile, [session, deleted], [], [], plan, [measured]);
    expect(summary.tasks[0].done).toBe(1);
    expect(summary.minutesThisWeek).toBe(2.5);
    expect(summary.daysStudiedThisWeek).toBe(1);
    expect(summary.fullTestsThisWeek).toBe(0);
    const detailed = { ...session, practiceParts: [{ part: 7 as const, correct: 5, total: 10 }, { part: 7 as const, correct: 4, total: 10 }] };
    expect(buildWeeklyStudyPlan(plan.weekKey, mockProfile, [detailed], [], [], plan, [measured]).tasks[0].done).toBe(1);
  });
});
