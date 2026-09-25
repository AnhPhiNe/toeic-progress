import confetti from 'canvas-confetti';
import { StudySession, MistakeEntry, UserProfile, RANK_TIERS, RankTier, SessionAttemptMeta, PacingRun, WeeklyPlanRecord } from '../types';
import { INITIAL_USER_PROFILE, DEMO_SESSIONS, DEMO_MISTAKES } from '../data/demoData';
import { DEFAULT_CHECKLIST, canWriteAccount, defaultProfile, getActiveAccountId, live, nextUpdatedAt, readDataBundle, replaceCollection, updateDataBundle, writeDataBundle, type VocabLog } from './dataBundle';
import { parseBackup, type BackupPreview } from './backup';
import { deriveStreak } from './streak';

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Hồ sơ mặc định cho người dùng mới hoặc sau khi xóa trắng dữ liệu
export function createBlankProfile(): UserProfile {
  return defaultProfile();
}

// Lấy ngày hôm trước của một ngày 'YYYY-MM-DD'
function getPreviousDateString(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Lấy Profile người dùng
export function loadUserProfile(): UserProfile {
  const today = getTodayDateString();
  const yesterday = getPreviousDateString(today);
  const dayBefore = getPreviousDateString(yesterday);
  const bundle = readDataBundle();
  const activityDates = new Set([
    ...live(bundle.sessions).map(item => item.date),
    ...live(bundle.vocabLog).filter(item => item.count > 0).map(item => item.date)
  ]);
  const alreadyShielded = live(bundle.shieldDays).some(item => item.date === yesterday);
  let current = bundle;
  if ((!getActiveAccountId() || canWriteAccount()) && activityDates.has(dayBefore) && !activityDates.has(yesterday) && !alreadyShielded && deriveStreak(bundle, today).streakFreezes > 0) {
    current = updateDataBundle(data => ({
      ...data,
      shieldDays: [...data.shieldDays.filter(item => item.id !== `shield:${yesterday}`), { id: `shield:${yesterday}`, date: yesterday, updatedAt: nextUpdatedAt(data.shieldDays.find(item => item.date === yesterday)?.updatedAt), deletedAt: null }]
    }));
  }
  return { ...current.profile, ...deriveStreak(current, today) };
}

// Lưu Profile người dùng
export function saveUserProfile(profile: UserProfile): void {
  updateDataBundle(current => {
    const remaining = deriveStreak(current, getTodayDateString()).streakFreezes;
    const used = live(current.shieldDays).length;
    const shieldAllowance = profile.streakFreezes !== remaining
      ? profile.streakFreezes + used
      : current.profile.shieldAllowance ?? current.profile.streakFreezes + used;
    return {
      ...current,
      profile: { ...profile, shieldAllowance, updatedAt: nextUpdatedAt(current.profile.updatedAt), deletedAt: null }
    };
  });
}

export function updateStreakStatus(_profile: UserProfile): UserProfile {
  return loadUserProfile();
}

/**
 * Ghi nhận một ngày học thành công để tăng Streak.
 * @param activityDate Ngày của buổi học ('YYYY-MM-DD'). Mặc định là hôm nay.
 *   Nếu ghi bù một buổi học trong quá khứ, streak giữ nguyên - nhập liệu bù
 *   không phải là học hôm nay.
 */
export function recordDailyActivity(_profile: UserProfile, _activityDate?: string): UserProfile {
  return loadUserProfile();
}

// Lấy danh sách toàn bộ các buổi học
export function loadStudySessions(): StudySession[] {
  return live(readDataBundle().sessions);
}

export function saveStudySessions(sessions: StudySession[]): void {
  updateDataBundle(current => ({ ...current, sessions: replaceCollection(current.sessions, sessions) }));
}

// Thêm một buổi học mới
export function addStudySession(session: StudySession): { sessions: StudySession[]; profile: UserProfile; isRecord: boolean } {
  const currentSessions = loadStudySessions();

  const previousMax = Math.max(...currentSessions.map(s => s.totalScore || 0), 0);
  const updatedSessions = [session, ...currentSessions];
  saveStudySessions(updatedSessions);

  // Cập nhật streak
  const updatedProfile = loadUserProfile();

  const isRecord = (session.totalScore || 0) > previousMax && (session.totalScore || 0) > 0;
  if (isRecord) {
    triggerCelebrationConfetti();
  }

  return {
    sessions: updatedSessions,
    profile: updatedProfile,
    isRecord
  };
}

// Lấy danh sách Sổ tay lỗi sai
export function loadMistakes(): MistakeEntry[] {
  return live(readDataBundle().mistakes);
}

export function saveMistakes(mistakes: MistakeEntry[]): void {
  updateDataBundle(current => ({ ...current, mistakes: replaceCollection(current.mistakes, mistakes) }));
}

// ---- Lượt chạy Bộ đếm nhịp (SPEC 4.3) ----

export function loadPacingRuns(): PacingRun[] {
  return live(readDataBundle().pacingRuns);
}

export function savePacingRuns(runs: PacingRun[]): void {
  updateDataBundle(current => ({ ...current, pacingRuns: replaceCollection(current.pacingRuns, runs) }));
}

/**
 * Ghi lại một lượt bấm nhịp. Giữ tối đa 100 lượt gần nhất - đủ dày để dựng
 * xu hướng mà không phình localStorage.
 */
export function addPacingRun(run: PacingRun): PacingRun[] {
  const updated = [run, ...loadPacingRuns()];
  savePacingRuns(updated);
  return updated;
}

export function loadChecklist(): Record<string, boolean> {
  const values = { ...DEFAULT_CHECKLIST };
  for (const item of live(readDataBundle().checklist)) values[item.id] = item.checked;
  return values;
}

export function saveChecklist(values: Record<string, boolean>): void {
  updateDataBundle(current => {
    const before = new Map(current.checklist.map(item => [item.id, item]));
    const checklist = Object.entries(values).map(([id, checked]) => {
      const old = before.get(id);
      return old && old.checked === checked && !old.deletedAt
        ? old
        : { id, checked, updatedAt: nextUpdatedAt(old?.updatedAt), deletedAt: null };
    });
    return { ...current, checklist };
  });
}

export function loadVocabLog(): VocabLog[] {
  return live(readDataBundle().vocabLog);
}

export function upsertVocabLog(date: string, count: number): VocabLog[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(count) || count <= 0) {
    throw new Error('Ngày và số từ vựng phải hợp lệ; số từ phải lớn hơn 0.');
  }
  const id = `vocab:${date}`;
  const next = updateDataBundle(current => ({
    ...current,
    vocabLog: [
      ...current.vocabLog.filter(item => item.id !== id),
      { id, date, count, updatedAt: nextUpdatedAt(current.vocabLog.find(item => item.id === id)?.updatedAt), deletedAt: null }
    ]
  }));
  return live(next.vocabLog);
}

export function deleteVocabLog(id: string): VocabLog[] {
  const next = updateDataBundle(current => ({
    ...current,
    vocabLog: current.vocabLog.map(item => {
      if (item.id !== id) return item;
      const updatedAt = nextUpdatedAt(item.updatedAt);
      return { ...item, updatedAt, deletedAt: updatedAt };
    })
  }));
  return live(next.vocabLog);
}

// Tính Rank Tier hiện tại dựa trên điểm số cao nhất
export function getCurrentRankTier(highestScore: number, targetScore = 990): RankTier {
  const target = Math.max(10, Math.min(990, targetScore));
  return [...RANK_TIERS].reverse().find(tier => highestScore * 100 >= target * tier.minPercent) || RANK_TIERS[0];
}

// Hiệu ứng pháo hoa chúc mừng
export function triggerCelebrationConfetti(): void {
  confetti({
    particleCount: 120,
    spread: 80,
    origin: { y: 0.6 },
    colors: ['#F97316', '#8B5CF6', '#06B6D4', '#10B981', '#FBBF24']
  });
}

// Xuất file JSON toàn bộ dữ liệu
export function exportDataAsJSON(): void {
  const backup = { ...readDataBundle(), exportDate: new Date().toISOString() };
  const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', url);
  downloadAnchor.setAttribute('download', `toeic-progress-990-backup-${getTodayDateString()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function restoreBackup(preview: BackupPreview): void {
  const current = readDataBundle();
  const next = preview.version === 2
    ? preview.data as typeof current
    : { ...current, ...preview.data };
  writeDataBundle(next);
}

// Kept for callers that have not moved to the preview flow yet.
export function importDataFromJSON(jsonData: string): boolean {
  const result = parseBackup(jsonData);
  if (!result.ok) return false;
  restoreBackup(result.preview);
  return true;
}

// Nạp lại toàn bộ dữ liệu mẫu Demo
export function loadDemoData(): { profile: UserProfile; sessions: StudySession[]; mistakes: MistakeEntry[] } {
  saveUserProfile(INITIAL_USER_PROFILE);
  saveStudySessions(DEMO_SESSIONS);
  saveMistakes(DEMO_MISTAKES);
  return {
    profile: INITIAL_USER_PROFILE,
    sessions: DEMO_SESSIONS,
    mistakes: DEMO_MISTAKES
  };
}

// Xóa trắng toàn bộ dữ liệu để bắt đầu từ đầu
export function resetToCleanSlate(): { profile: UserProfile; sessions: StudySession[]; mistakes: MistakeEntry[] } {
  const cleanProfile = createBlankProfile();
  updateDataBundle(current => ({
    ...current,
    profile: { ...cleanProfile, updatedAt: nextUpdatedAt(current.profile.updatedAt), deletedAt: null },
    sessions: replaceCollection(current.sessions, []),
    mistakes: replaceCollection(current.mistakes, []),
    pacingRuns: replaceCollection(current.pacingRuns, []),
    vocabLog: current.vocabLog.map(item => { const updatedAt = nextUpdatedAt(item.updatedAt); return { ...item, updatedAt, deletedAt: updatedAt }; }),
    shieldDays: current.shieldDays.map(item => { const updatedAt = nextUpdatedAt(item.updatedAt); return { ...item, updatedAt, deletedAt: updatedAt }; }),
    checklist: replaceCollection(current.checklist, Object.entries(DEFAULT_CHECKLIST).map(([id, checked]) => ({ id, checked })))
  }));
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SMART_WEEKLY_PLANS_KEY);
  }

  return {
    profile: cleanProfile,
    sessions: [],
    mistakes: []
  };
}

/**
 * Tính toán metadata về số lần làm bài (Attempt Meta) cho từng session trong danh sách
 * Chuẩn hóa tên bài thi (lowercase, bỏ khoảng trắng thừa) để gom nhóm chính xác
 */
export function computeSessionAttemptMap(sessions: StudySession[]): Record<string, SessionAttemptMeta> {
  const result: Record<string, SessionAttemptMeta> = {};
  const grouped: Record<string, StudySession[]> = {};
  
  // Sắp xếp các session theo thứ tự thời gian tăng dần (cũ -> mới)
  const sorted = [...sessions].sort((a, b) => {
    const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (timeDiff !== 0) return timeDiff;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  for (const session of sorted) {
    const normalizedName = session.testName.trim().toLowerCase();
    if (!grouped[normalizedName]) {
      grouped[normalizedName] = [];
    }
    grouped[normalizedName].push(session);
  }

  // Phân tích từng nhóm
  for (const list of Object.values(grouped)) {
    const totalAttempts = list.length;
    const firstSession = list[0];

    for (let i = 0; i < list.length; i++) {
      const current = list[i];
      const attemptNumber = current.attemptNumber || (i + 1);
      const isRetest = i > 0;
      const previousSession = i > 0 ? list[i - 1] : undefined;

      const scoreDiffFromPrevious = previousSession && current.totalScore && previousSession.totalScore
        ? current.totalScore - previousSession.totalScore
        : null;

      const scoreDiffFromFirst = isRetest && current.totalScore && firstSession.totalScore
        ? current.totalScore - firstSession.totalScore
        : null;

      result[current.id] = {
        attemptNumber,
        totalAttempts,
        isRetest,
        previousSession,
        firstSession,
        scoreDiffFromPrevious,
        scoreDiffFromFirst
      };
    }
  }

  return result;
}

/**
 * Thống kê tổng hợp về hiệu quả làm lại đề (Retest Performance)
 */
export function getRetestStats(sessions: StudySession[]) {
  const fullTests = sessions.filter(s => s.sessionType === 'FULL_TEST' && (s.totalScore || 0) > 0);
  const attemptMap = computeSessionAttemptMap(fullTests);

  const firstAttempts = fullTests.filter(s => attemptMap[s.id]?.attemptNumber === 1);
  const retests = fullTests.filter(s => (attemptMap[s.id]?.attemptNumber || 1) > 1);

  const firstAttemptAvg = firstAttempts.length > 0
    ? Math.round(firstAttempts.reduce((acc, s) => acc + (s.totalScore || 0), 0) / firstAttempts.length)
    : 0;

  const overallAvg = fullTests.length > 0
    ? Math.round(fullTests.reduce((acc, s) => acc + (s.totalScore || 0), 0) / fullTests.length)
    : 0;

  // Tính mức tăng điểm trung bình khi làm lại (so với lần 1)
  let totalGain = 0;
  let gainCount = 0;
  for (const retest of retests) {
    const meta = attemptMap[retest.id];
    if (meta && meta.scoreDiffFromFirst !== null) {
      totalGain += meta.scoreDiffFromFirst;
      gainCount++;
    }
  }

  const avgRetestGain = gainCount > 0 ? Math.round(totalGain / gainCount) : 0;

  return {
    totalTests: fullTests.length,
    firstAttemptsCount: firstAttempts.length,
    retestCount: retests.length,
    firstAttemptAvg,
    overallAvg,
    avgRetestGain
  };
}

// ================= KẾ HOẠCH TUẦN SMART =================
export const SMART_WEEKLY_PLANS_KEY = 'toeic_smart_weekly_plans_v1';

export function getWeekMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offsetToMonday);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

export function loadWeeklyPlans(): Record<string, WeeklyPlanRecord> {
  if (typeof localStorage === 'undefined') return {};
  const raw = localStorage.getItem(SMART_WEEKLY_PLANS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveWeeklyPlans(plans: Record<string, WeeklyPlanRecord>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SMART_WEEKLY_PLANS_KEY, JSON.stringify(plans));
  } catch (err) {
    console.error('Lỗi khi lưu kế hoạch tuần:', err);
  }
}

export function getOrCreateWeeklyPlan(weekKey: string, profile?: UserProfile): WeeklyPlanRecord {
  const plans = loadWeeklyPlans();
  if (plans[weekKey]) {
    return plans[weekKey];
  }

  const defaultWeeklyMinutes = ((profile?.dailyMinGoalMinutes || 30) * 7);
  const defaultPlan: WeeklyPlanRecord = {
    weekKey,
    tasks: [
      {
        id: `task-ft-${Date.now()}-1`,
        title: 'Làm 1 đề Full Test (200 câu)',
        type: 'AUTO_FULL_TEST',
        target: 1,
        unit: 'đề',
        notes: 'Giữ phản xạ và cảm giác làm bài thi thực tế',
        color: 'blue',
        createdAt: new Date().toISOString()
      },
      {
        id: `task-min-${Date.now()}-2`,
        title: `Học ${defaultWeeklyMinutes} phút tuần này`,
        type: 'AUTO_STUDY_TIME',
        target: defaultWeeklyMinutes,
        unit: 'phút',
        notes: `Tương đương ~${profile?.dailyMinGoalMinutes || 30} phút mỗi ngày`,
        color: 'indigo',
        createdAt: new Date().toISOString()
      }
    ]
  };

  plans[weekKey] = defaultPlan;
  saveWeeklyPlans(plans);
  return defaultPlan;
}


