import { StudySession, MistakeEntry, UserProfile, SmartWeeklyTask, WeeklyPlanRecord } from '../types';
import { getTodayDateString, getWeekMonday, addDays, getOrCreateWeeklyPlan } from './storage';
import { getPracticeParts } from './etsScoring';
import { causePriority } from './learningAnalytics';
import type { VocabLog } from './dataBundle';

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
  storedPlan?: WeeklyPlanRecord
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
    .filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0)
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
  const thisWeekSessions = sessions.filter(s => s.date >= weekStart && s.date <= weekEnd);
  const fullTestsThisWeek = thisWeekSessions.filter(s => s.sessionType === 'FULL_TEST').length;
  const minutesThisWeek = thisWeekSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
  const minutesGoalThisWeek = (profile.dailyMinGoalMinutes || 30) * 7;

  const daysStudiedThisWeek = new Set([
    ...thisWeekSessions.map(s => s.date),
    ...vocabLog.filter(item => !item.deletedAt && item.count > 0 && item.date >= weekStart && item.date <= weekEnd).map(item => item.date)
  ]).size;

  // Lấy hoặc khởi tạo kế hoạch tuần
  const planRecord = storedPlan || getOrCreateWeeklyPlan(weekKey, profile);

  // Đánh giá tiến độ từng mục tiêu SMART
  const evaluatedTasks: EvaluatedSmartTask[] = planRecord.tasks.map(task => {
    let done = 0;
    let isComplete = false;

    if (task.type === 'AUTO_FULL_TEST') {
      const autoDone = fullTestsThisWeek;
      isComplete = Boolean(task.isCompleted || autoDone >= task.target);
      done = task.isCompleted ? Math.max(task.target, autoDone) : autoDone;
    } else if (task.type === 'AUTO_STUDY_TIME') {
      const autoDone = minutesThisWeek;
      isComplete = Boolean(task.isCompleted || autoDone >= task.target);
      done = task.isCompleted ? Math.max(task.target, autoDone) : autoDone;
    } else if (task.type === 'AUTO_PART_PRACTICE') {
      const targetPart = task.partNumber;
      const autoDone = thisWeekSessions
        .filter(s => s.sessionType === 'PART_PRACTICE')
        .flatMap(s => getPracticeParts(s))
        .filter(p => (targetPart ? p.part === targetPart : true)).length;
      isComplete = Boolean(task.isCompleted || autoDone >= task.target);
      done = task.isCompleted ? Math.max(task.target, autoDone) : autoDone;
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
