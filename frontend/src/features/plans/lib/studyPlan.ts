import { StudySession, MistakeEntry, UserProfile, SmartWeeklyTask, WeeklyPlanRecord, PacingRun } from '@/shared/types';
import { getTodayDateString, getWeekMonday, addDays, getOrCreateWeeklyPlan, loadUserProfile, loadWeeklyPlans, saveWeeklyPlans } from '@/shared/data/storage';
import { getPracticeParts } from '@/shared/domain/etsScoring';
import { causePriority } from '@/shared/domain/learningAnalytics';
import type { VocabLog } from '@/shared/data/dataBundle';

export interface EvaluatedSmartTask extends SmartWeeklyTask {
  done: number;
  isComplete: boolean;
  percent: number;
}

export interface SmartRecommendation {
  id: string;
  title: string;
  reason: string;
  type: SmartWeeklyTask['type'];
  partNumber?: number;
  target: number;
  unit: string;
  notes?: string;
}

export interface WeeklyStudyPlanSummary {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;

  daysUntilExam: number | null;
  targetScore: number;
  currentLevel: number;
  pointsGap: number;

  totalTasks: number;
  completedTasks: number;
  completionPercent: number;

  minutesThisWeek: number;
  minutesGoalThisWeek: number;
  daysStudiedThisWeek: number;
  fullTestsThisWeek: number;

  tasks: EvaluatedSmartTask[];
  recommendation: SmartRecommendation | null;
}

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(`${fromStr}T00:00:00`).getTime();
  const to = new Date(`${toStr}T00:00:00`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/**
 * Xây dựng báo cáo Kế hoạch tuần SMART từ dữ liệu thực tế
 */
export function buildWeeklyStudyPlan(
  weekKey: string,
  profile: UserProfile,
  sessions: StudySession[],
  mistakes: MistakeEntry[],
  vocabLog: VocabLog[] = [],
  storedPlan?: WeeklyPlanRecord,
  pacingRuns: PacingRun[] = []
): WeeklyStudyPlanSummary {
  const today = getTodayDateString();
  const currentWeekMonday = getWeekMonday(today);
  const isCurrentWeek = weekKey === currentWeekMonday;

  const weekStart = weekKey;
  const weekEnd = addDays(weekKey, 6);

  // Đếm ngược ngày thi và mục tiêu điểm
  const targetScore = Math.max(10, Math.min(990, profile.targetScore || 990));
  const hasExamDate = Boolean(profile.examDate);
  const daysUntilExam = hasExamDate ? daysBetween(today, profile.examDate) : null;

  const fullTests = sessions
    .filter(s => !s.deletedAt && s.skillType === 'LR' && s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let currentLevel = 0;
  if (fullTests.length >= 3) {
    const last3 = fullTests.slice(-3);
    currentLevel = Math.round(
      ((last3[2].totalScore || 0) * 0.5 + (last3[1].totalScore || 0) * 0.3 + (last3[0].totalScore || 0) * 0.2) / 5
    ) * 5;
  } else if (fullTests.length > 0) {
    currentLevel = fullTests[fullTests.length - 1].totalScore || 0;
  }

  const pointsGap = Math.max(0, targetScore - currentLevel);

  // Dữ liệu học tập trong tuần này
  const thisWeekSessions = sessions.filter(s => !s.deletedAt && s.date >= weekStart && s.date <= weekEnd);
  // Chỉ đếm Full Test có điểm; bản ghi Sprint Reading cũ từng bị lưu là FULL_TEST không điểm
  const fullTestsThisWeek = thisWeekSessions.filter(s => s.skillType === 'LR' && s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0).length;
  const minutesThisWeek = thisWeekSessions.reduce((acc, s) => acc + (Number.isFinite(s.durationMinutes) && s.durationMinutes > 0 ? s.durationMinutes : 0), 0);

  const daysStudiedThisWeek = new Set([
    ...thisWeekSessions.map(s => s.date),
    ...vocabLog.filter(item => !item.deletedAt && item.count > 0 && item.date >= weekStart && item.date <= weekEnd).map(item => item.date)
  ]).size;

  // Lấy hoặc khởi tạo kế hoạch tuần
  const planRecord = storedPlan || getOrCreateWeeklyPlan(weekKey, profile);
  const timeTargets = planRecord.tasks
    .filter(task => task.type === 'AUTO_STUDY_TIME' && Number.isFinite(task.target) && task.target > 0)
    .map(task => task.target);
  const minutesGoalThisWeek = timeTargets.length > 0
    ? Math.max(...timeTargets)
    : (profile.dailyMinGoalMinutes || 30) * 7;
  const measured = new Map(pacingRuns.filter(run => {
    const seconds = run.actualSeconds ?? run.actualMinutes * 60;
    return !run.deletedAt
      && run.id.startsWith('pacing-v2-')
      && Number.isFinite(seconds) && seconds > 0
      && Number.isInteger(run.totalQuestions) && run.totalQuestions! > 0;
  }).map(run => [run.id, run]));
  const practiced = thisWeekSessions.filter(session => session.skillType === 'LR' && session.sessionType === 'PART_PRACTICE').map(session => {
    const parts = new Set<number>(getPracticeParts(session).map(part => part.part));
    const run = measured.get(session.id);
    if (run?.partType === 'PART_5') parts.add(5);
    else if (run?.partType === 'PART_6') parts.add(6);
    else if (run?.partType?.startsWith('PART_7')) parts.add(7);
    return { parts, reading: parts.size > 0 || run?.partType === 'FULL_READING' };
  });

  // Đánh giá tiến độ từng mục tiêu SMART
  const evaluatedTasks: EvaluatedSmartTask[] = planRecord.tasks.map(task => {
    let done: number;
    let isComplete: boolean;

    if (task.type === 'AUTO_FULL_TEST') {
      const autoDone = fullTestsThisWeek;
      isComplete = autoDone >= task.target;
      done = autoDone;
    } else if (task.type === 'AUTO_STUDY_TIME') {
      const autoDone = minutesThisWeek;
      isComplete = autoDone >= task.target;
      done = autoDone;
    } else if (task.type === 'AUTO_PART_PRACTICE') {
      const targetPart = task.partNumber;
      const autoDone = practiced.filter(session => targetPart ? session.parts.has(targetPart) : session.reading).length;
      isComplete = autoDone >= task.target;
      done = autoDone;
    } else {
      // CUSTOM
      if (task.target > 1) {
        done = task.manualDone || (task.isCompleted ? task.target : 0);
        isComplete = Boolean(task.isCompleted || done >= task.target);
      } else {
        done = task.isCompleted ? 1 : 0;
        isComplete = Boolean(task.isCompleted);
      }
    }

    const percent = task.target > 0
      ? Math.min(100, Math.round((done / task.target) * 100))
      : (isComplete ? 100 : 0);

    return {
      ...task,
      done,
      isComplete,
      percent
    };
  });

  const totalTasks = evaluatedTasks.length;
  const completedTasks = evaluatedTasks.filter(t => t.isComplete).length;
  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Xây dựng gợi ý thông minh 1-click
  let recommendation: SmartRecommendation | null = null;
  const priority = causePriority(sessions, mistakes);
  if (priority.rows.length > 0) {
    const topCause = priority.rows[0];
    const topMistakes = mistakes.filter(m => m.category === topCause.category);
    const topPart = topMistakes.length > 0 ? topMistakes[0].part : 5;

    const hasPartTask = planRecord.tasks.some(
      t => t.type === 'AUTO_PART_PRACTICE' && t.partNumber === topPart
    );

    if (!hasPartTask) {
      recommendation = {
        id: `rec-part-${topPart}`,
        title: `Luyện 2 bài Part ${topPart}`,
        reason: `Bạn có ${Math.round((topCause.count / Math.max(1, priority.mistakeCount)) * 100)}% lỗi thuộc nhóm ${topCause.category === 'VOCABULARY_TRAP' ? 'Bẫy từ vựng' : 'Ngữ pháp/Kỹ năng'} trong sổ tay`,
        type: 'AUTO_PART_PRACTICE',
        partNumber: topPart,
        target: 2,
        unit: 'bài',
        notes: `Tập trung khắc phục các bẫy hay gặp ở Part ${topPart}`
      };
    }
  }

  if (!recommendation) {
    const hasFullTestTask = planRecord.tasks.some(t => t.type === 'AUTO_FULL_TEST');
    if (!hasFullTestTask) {
      recommendation = {
        id: 'rec-fulltest',
        title: 'Làm 1 đề Full Test (200 câu)',
        reason: 'Duy trì phản xạ và quản lý thời gian thi thực tế',
        type: 'AUTO_FULL_TEST',
        target: 1,
        unit: 'đề',
        notes: 'Giữ phong độ 200 câu trước ngày thi'
      };
    }
  }

  return {
    weekKey,
    weekStart,
    weekEnd,
    isCurrentWeek,
    daysUntilExam,
    targetScore,
    currentLevel,
    pointsGap,
    totalTasks,
    completedTasks,
    completionPercent,
    minutesThisWeek,
    minutesGoalThisWeek,
    daysStudiedThisWeek,
    fullTestsThisWeek,
    tasks: evaluatedTasks,
    recommendation
  };
}

export function syncPrioritiesToWeeklyPlan(
  priorities: Array<{ part: number | null; title: string; practice?: string; minutes?: number }>
): boolean {
  try {
    const validPriorities = priorities.filter(
      (p): p is { part: number; title: string; practice?: string; minutes?: number } =>
        typeof p.part === 'number' && Number.isInteger(p.part) && p.part >= 1 && p.part <= 7
    );
    if (validPriorities.length === 0) return false;

    const weekKey = getWeekMonday(getTodayDateString());
    const profile = loadUserProfile();
    const currentPlan = getOrCreateWeeklyPlan(weekKey, profile, false);
    const existingTasks = [...currentPlan.tasks];
    let added = false;

    for (const priority of validPriorities) {
      if (existingTasks.length >= 15) break;
      const alreadyHasPart = existingTasks.some(
        task => task.type === 'AUTO_PART_PRACTICE' && task.partNumber === priority.part
      );
      if (!alreadyHasPart) {
        const cleanTitle = priority.title.trim();
        const title = cleanTitle.toLowerCase().includes(`part ${priority.part}`)
          ? cleanTitle
          : `Luyện Part ${priority.part}: ${cleanTitle}`;
        existingTasks.push({
          id: `task-ai-part-${priority.part}-${weekKey}`,
          title: title.slice(0, 120),
          type: 'AUTO_PART_PRACTICE',
          partNumber: priority.part,
          target: 2,
          unit: 'bài',
          notes: (priority.practice || `Ưu tiên từ chẩn đoán AI cho Part ${priority.part}`).slice(0, 300),
          color: priority.part === 7 ? 'amber' : priority.part <= 4 ? 'rose' : 'sky',
          createdAt: new Date().toISOString()
        });
        added = true;
      }
    }

    const plans = loadWeeklyPlans();
    if (added || !plans[weekKey]) {
      plans[weekKey] = { ...currentPlan, weekKey, tasks: existingTasks };
      saveWeeklyPlans(plans);
    }
    return true;
  } catch {
    return false;
  }
}

