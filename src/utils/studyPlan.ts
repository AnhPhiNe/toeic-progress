import { StudySession, MistakeEntry, UserProfile, ErrorCategory, ERROR_CATEGORY_LABELS } from '../types';
import { getTodayDateString } from './storage';
import { getPracticeParts } from './etsScoring';

/** Một việc cần làm trong tuần, sinh ra từ dữ liệu thật của người học */
export interface WeeklyTask {
  id: string;
  label: string;
  detail: string;
  target: number;
  done: number;
  /** Lý do việc này được đề xuất - luôn bắt nguồn từ dữ liệu, không phải mẹo chung chung */
  reason?: string;
}

export interface StudyPlan {
  hasExamDate: boolean;
  hasScoreData: boolean;

  daysUntilExam: number | null;
  weeksRemaining: number | null;

  targetScore: number;
  currentLevel: number;
  pointsGap: number;

  /** Số điểm cần tăng mỗi tuần để kịp ngày thi */
  requiredPacePerWeek: number | null;
  /** Nhịp tăng điểm thực tế gần đây */
  actualPacePerWeek: number | null;
  /** 'ahead' đi trước kế hoạch, 'behind' chậm hơn, 'on-track' vừa đúng, null chưa đủ dữ liệu */
  paceStatus: 'ahead' | 'on-track' | 'behind' | null;

  weekStart: string;
  weekEnd: string;
  tasks: WeeklyTask[];

  minutesThisWeek: number;
  minutesGoalThisWeek: number;
  daysStudiedThisWeek: number;

  bottleneckCause: { category: ErrorCategory; label: string; count: number; percent: number } | null;
  pendingMistakes: number;
}

/** Thứ Hai của tuần chứa ngày đã cho, trả về 'YYYY-MM-DD' */
function getWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Chủ nhật
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offsetToMonday);
  return toDateString(d);
}

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(`${fromStr}T00:00:00`).getTime();
  const to = new Date(`${toStr}T00:00:00`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/**
 * Dựng kế hoạch tuần từ dữ liệu thật: ngày thi, mục tiêu, lịch sử điểm và
 * nhóm lỗi hay mắc. Không có mẹo chung chung - mọi việc đề xuất đều kèm lý do
 * truy được về dữ liệu của chính người học (SPEC mục 4.2).
 */
export function buildStudyPlan(
  profile: UserProfile,
  sessions: StudySession[],
  mistakes: MistakeEntry[]
): StudyPlan {
  const today = getTodayDateString();
  const targetScore = Math.max(10, Math.min(990, profile.targetScore || 990));

  const fullTests = sessions
    .filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const hasScoreData = fullTests.length > 0;

  // Mức hiện tại: trung bình trọng số 3 đề gần nhất, giống cách Phân Tích dự báo
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

  const hasExamDate = Boolean(profile.examDate);
  const daysUntilExam = hasExamDate ? daysBetween(today, profile.examDate) : null;
  const weeksRemaining =
    daysUntilExam !== null && daysUntilExam > 0 ? Math.max(1, Math.ceil(daysUntilExam / 7)) : null;

  const requiredPacePerWeek =
    weeksRemaining !== null && hasScoreData ? Math.round((pointsGap / weeksRemaining) * 10) / 10 : null;

  // Nhịp thực tế: chênh lệch điểm chia cho số tuần giữa đề đầu và đề cuối
  let actualPacePerWeek: number | null = null;
  if (fullTests.length >= 2) {
    const first = fullTests[0];
    const last = fullTests[fullTests.length - 1];
    const spanDays = Math.max(7, daysBetween(first.date, last.date));
    const spanWeeks = spanDays / 7;
    const gained = (last.totalScore || 0) - (first.totalScore || 0);
    actualPacePerWeek = Math.round((gained / spanWeeks) * 10) / 10;
  }

  let paceStatus: StudyPlan['paceStatus'] = null;
  if (requiredPacePerWeek !== null && actualPacePerWeek !== null) {
    if (pointsGap === 0) paceStatus = 'ahead';
    else if (actualPacePerWeek >= requiredPacePerWeek * 1.1) paceStatus = 'ahead';
    else if (actualPacePerWeek >= requiredPacePerWeek * 0.9) paceStatus = 'on-track';
    else paceStatus = 'behind';
  }

  // ---- Tuần hiện tại ----
  const weekStart = getWeekStart(today);
  const weekEnd = addDays(weekStart, 6);
  const thisWeek = sessions.filter(s => s.date >= weekStart && s.date <= weekEnd);

  const fullTestsThisWeek = thisWeek.filter(s => s.sessionType === 'FULL_TEST').length;
  const minutesThisWeek = thisWeek.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
  const minutesGoalThisWeek = (profile.dailyMinGoalMinutes || 30) * 7;
  const daysStudiedThisWeek = new Set(thisWeek.map(s => s.date)).size;

  // ---- Nhóm lỗi đang lấy nhiều điểm nhất ----
  let bottleneckCause: StudyPlan['bottleneckCause'] = null;
  if (mistakes.length > 0) {
    const counts = new Map<ErrorCategory, number>();
    for (const m of mistakes) {
      const c = m.category || 'OTHER';
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    const [category, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    bottleneckCause = {
      category,
      label: (ERROR_CATEGORY_LABELS[category] || ERROR_CATEGORY_LABELS.OTHER).label,
      count,
      percent: Math.round((count / mistakes.length) * 100)
    };
  }

  const pendingMistakes = mistakes.filter(m => m.status === 'NEEDS_REVIEW').length;

  // ---- Việc cần làm tuần này ----
  const tasks: WeeklyTask[] = [];

  // Số đề cần làm phụ thuộc thời gian còn lại: càng gần ngày thi càng dày
  let fullTestTarget = 1;
  if (daysUntilExam !== null) {
    if (daysUntilExam <= 14) fullTestTarget = 3;
    else if (daysUntilExam <= 30) fullTestTarget = 2;
  }
  tasks.push({
    id: 'full-test',
    label: `${fullTestTarget} đề Full Test`,
    detail: 'Giữ cảm giác làm bài liên tục 200 câu',
    target: fullTestTarget,
    done: fullTestsThisWeek,
    reason:
      daysUntilExam !== null && daysUntilExam <= 30
        ? `Còn ${daysUntilExam} ngày - giai đoạn nước rút cần tần suất dày hơn`
        : undefined
  });

  // Luyện đúng chỗ đang yếu nhất, không luyện tràn lan
  if (bottleneckCause) {
    const partsOfCause = new Set(
      mistakes.filter(m => m.category === bottleneckCause!.category).map(m => m.part)
    );
    const partList = Array.from(partsOfCause).sort((a, b) => a - b);
    const practiceThisWeek = thisWeek
      .filter(s => s.sessionType === 'PART_PRACTICE')
      .flatMap(s => getPracticeParts(s))
      .filter(p => partsOfCause.has(p.part)).length;

    tasks.push({
      id: 'focus-practice',
      label: `2 buổi luyện ${partList.map(p => `Part ${p}`).join(', ')}`,
      detail: `Nhắm vào nhóm lỗi ${bottleneckCause.label}`,
      target: 2,
      done: practiceThisWeek,
      reason: `${bottleneckCause.percent}% lỗi của bạn thuộc nhóm này`
    });
  }

  if (pendingMistakes > 0) {
    tasks.push({
      id: 'review-mistakes',
      label: `Ôn ${Math.min(pendingMistakes, 15)} lỗi chưa thông suốt`,
      detail: 'Đọc lại và tự giải thích vì sao đáp án kia sai',
      target: Math.min(pendingMistakes, 15),
      done: 0,
      reason: `Sổ tay đang có ${pendingMistakes} lỗi chờ ôn`
    });
  }

  tasks.push({
    id: 'minutes',
    label: `Học đủ ${minutesGoalThisWeek} phút`,
    detail: `Mục tiêu ${profile.dailyMinGoalMinutes || 30} phút mỗi ngày`,
    target: minutesGoalThisWeek,
    done: minutesThisWeek
  });

  return {
    hasExamDate,
    hasScoreData,
    daysUntilExam,
    weeksRemaining,
    targetScore,
    currentLevel,
    pointsGap,
    requiredPacePerWeek,
    actualPacePerWeek,
    paceStatus,
    weekStart,
    weekEnd,
    tasks,
    minutesThisWeek,
    minutesGoalThisWeek,
    daysStudiedThisWeek,
    bottleneckCause,
    pendingMistakes
  };
}
