import confetti from 'canvas-confetti';
import { StudySession, MistakeEntry, UserProfile, RANK_TIERS, RankTier, SessionAttemptMeta, PacingRun } from '../types';
import { INITIAL_USER_PROFILE, DEMO_SESSIONS, DEMO_MISTAKES } from '../data/demoData';

const STORAGE_KEYS = {
  PROFILE: 'toeic_990_profile_v1',
  SESSIONS: 'toeic_990_sessions_v1',
  MISTAKES: 'toeic_990_mistakes_v1',
  INITIALIZED: 'toeic_990_initialized_v1',
  PACING: 'toeic_990_pacing_v1'
};

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Hồ sơ mặc định cho người dùng mới hoặc sau khi xóa trắng dữ liệu
export function createBlankProfile(): UserProfile {
  return {
    name: 'Học viên',
    targetScore: 990,
    examDate: '',
    currentStreak: 0,
    longestStreak: 0,
    streakFreezes: 2,
    lastStudyDate: '',
    dailyMinGoalMinutes: 30,
    motto: '',
    selectedSkill: 'LR'
  };
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
  const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
  if (!data) {
    return createBlankProfile();
  }
  try {
    const parsed = JSON.parse(data);
    // Hồ sơ cũ có thể thiếu tên - dùng nhãn trung tính, không gán tên của ai cả
    if (!parsed.name?.trim()) {
      parsed.name = 'Học viên';
      saveUserProfile(parsed);
    }
    return updateStreakStatus(parsed);
  } catch {
    return createBlankProfile();
  }
}

// Lưu Profile người dùng
export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
}

// Cập nhật trạng thái chuỗi Streak theo ngày thực tế
export function updateStreakStatus(profile: UserProfile): UserProfile {
  const today = getTodayDateString();
  if (!profile.lastStudyDate) {
    return profile;
  }

  const lastDate = new Date(profile.lastStudyDate);
  const currentDate = new Date(today);
  const diffTime = currentDate.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) {
    // Vẫn trong chuỗi hợp lệ (cùng ngày hoặc ngày hôm sau)
    return profile;
  } else if (diffDays === 2 && profile.streakFreezes > 0) {
    // Lỡ đúng 1 ngày và còn khiên: khiên lấp vào ĐÚNG ngày bị lỡ (hôm qua),
    // không phải hôm nay. Nhờ vậy chuỗi được giữ nhưng hôm nay vẫn tính là
    // CHƯA học - người dùng vẫn phải học thật để tăng streak.
    const updated = {
      ...profile,
      streakFreezes: profile.streakFreezes - 1,
      lastStudyDate: getPreviousDateString(today)
    };
    saveUserProfile(updated);
    return updated;
  } else if (diffDays > 1) {
    // Đã đứt chuỗi
    const updated = {
      ...profile,
      currentStreak: 0
    };
    saveUserProfile(updated);
    return updated;
  }

  return profile;
}

/**
 * Ghi nhận một ngày học thành công để tăng Streak.
 * @param activityDate Ngày của buổi học ('YYYY-MM-DD'). Mặc định là hôm nay.
 *   Nếu ghi bù một buổi học trong quá khứ, streak giữ nguyên - nhập liệu bù
 *   không phải là học hôm nay.
 */
export function recordDailyActivity(profile: UserProfile, activityDate?: string): UserProfile {
  const today = getTodayDateString();
  const effectiveDate = activityDate || today;

  // Buổi học được ghi cho một ngày trong quá khứ (hoặc tương lai): không đụng tới streak
  if (effectiveDate !== today) {
    return profile;
  }

  let newStreak = profile.currentStreak;

  if (profile.lastStudyDate !== today) {
    newStreak = profile.currentStreak + 1;
  }

  const longest = Math.max(newStreak, profile.longestStreak || 0);

  const updated: UserProfile = {
    ...profile,
    currentStreak: newStreak,
    longestStreak: longest,
    lastStudyDate: today
  };

  saveUserProfile(updated);
  return updated;
}

// Lấy danh sách toàn bộ các buổi học
export function loadStudySessions(): StudySession[] {
  const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
  if (!data) {
    // Người dùng mới bắt đầu với dữ liệu trắng. Dữ liệu demo chỉ được nạp
    // khi người dùng chủ động bấm "Nạp dữ liệu mẫu".
    return [];
  }
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveStudySessions(sessions: StudySession[]): void {
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
}

// Thêm một buổi học mới
export function addStudySession(session: StudySession): { sessions: StudySession[]; profile: UserProfile; isRecord: boolean } {
  const currentSessions = loadStudySessions();
  const currentProfile = loadUserProfile();

  const previousMax = Math.max(...currentSessions.map(s => s.totalScore || 0), 0);
  const updatedSessions = [session, ...currentSessions];
  saveStudySessions(updatedSessions);

  // Cập nhật streak
  const updatedProfile = recordDailyActivity(currentProfile, session.date);

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
  const data = localStorage.getItem(STORAGE_KEYS.MISTAKES);
  if (!data) {
    return [];
  }
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveMistakes(mistakes: MistakeEntry[]): void {
  localStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(mistakes));
}

// ---- Lượt chạy Bộ đếm nhịp (SPEC 4.3) ----

export function loadPacingRuns(): PacingRun[] {
  const data = localStorage.getItem(STORAGE_KEYS.PACING);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePacingRuns(runs: PacingRun[]): void {
  localStorage.setItem(STORAGE_KEYS.PACING, JSON.stringify(runs));
}

/**
 * Ghi lại một lượt bấm nhịp. Giữ tối đa 100 lượt gần nhất - đủ dày để dựng
 * xu hướng mà không phình localStorage.
 */
export function addPacingRun(run: PacingRun): PacingRun[] {
  const updated = [run, ...loadPacingRuns()].slice(0, 100);
  savePacingRuns(updated);
  return updated;
}

// Tính Rank Tier hiện tại dựa trên điểm số cao nhất
export function getCurrentRankTier(highestScore: number): RankTier {
  if (highestScore >= 990) return RANK_TIERS[6]; // Grandmaster
  if (highestScore >= 950) return RANK_TIERS[5]; // Diamond
  if (highestScore >= 900) return RANK_TIERS[4]; // Platinum
  if (highestScore >= 850) return RANK_TIERS[3]; // Gold
  if (highestScore >= 700) return RANK_TIERS[2]; // Silver
  if (highestScore >= 500) return RANK_TIERS[1]; // Bronze
  return RANK_TIERS[0];                          // Recruit
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
  const backup = {
    profile: loadUserProfile(),
    sessions: loadStudySessions(),
    mistakes: loadMistakes(),
    exportDate: new Date().toISOString(),
    appVersion: '1.0.0'
  };

  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backup, null, 2))}`;
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute('download', `toeic-progress-990-backup-${getTodayDateString()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Nhập dữ liệu từ file JSON
export function importDataFromJSON(jsonData: string): boolean {
  try {
    const parsed = JSON.parse(jsonData);
    if (parsed.profile) saveUserProfile(parsed.profile);
    if (parsed.sessions && Array.isArray(parsed.sessions)) saveStudySessions(parsed.sessions);
    if (parsed.mistakes && Array.isArray(parsed.mistakes)) saveMistakes(parsed.mistakes);
    return true;
  } catch (err) {
    console.error('Import failed:', err);
    return false;
  }
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

  saveUserProfile(cleanProfile);
  saveStudySessions([]);
  saveMistakes([]);

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

