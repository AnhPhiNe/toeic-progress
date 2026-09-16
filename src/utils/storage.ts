import confetti from 'canvas-confetti';
import { StudySession, MistakeEntry, UserProfile, RANK_TIERS, RankTier } from '../types';
import { INITIAL_USER_PROFILE, DEMO_SESSIONS, DEMO_MISTAKES } from '../data/demoData';

const STORAGE_KEYS = {
  PROFILE: 'toeic_990_profile_v1',
  SESSIONS: 'toeic_990_sessions_v1',
  MISTAKES: 'toeic_990_mistakes_v1',
  INITIALIZED: 'toeic_990_initialized_v1'
};

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Lấy Profile người dùng
export function loadUserProfile(): UserProfile {
  const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
  if (!data) {
    return INITIAL_USER_PROFILE;
  }
  try {
    const parsed = JSON.parse(data);
    return updateStreakStatus(parsed);
  } catch {
    return INITIAL_USER_PROFILE;
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
    // Lỡ 1 ngày nhưng có khiên bảo vệ
    const updated = {
      ...profile,
      streakFreezes: profile.streakFreezes - 1,
      lastStudyDate: today // Kích hoạt khiên cứu chuỗi
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

// Ghi nhận một ngày học thành công để tăng Streak
export function recordDailyActivity(profile: UserProfile): UserProfile {
  const today = getTodayDateString();
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
    // Mặc định nạp dữ liệu demo cho lần đầu
    saveStudySessions(DEMO_SESSIONS);
    return DEMO_SESSIONS;
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
  const updatedProfile = recordDailyActivity(currentProfile);

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
    saveMistakes(DEMO_MISTAKES);
    return DEMO_MISTAKES;
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
  const cleanProfile: UserProfile = {
    name: 'Chiến Binh 990',
    targetScore: 990,
    examDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    currentStreak: 0,
    longestStreak: 0,
    streakFreezes: 2,
    lastStudyDate: '',
    dailyMinGoalMinutes: 30,
    motto: 'Bắt đầu từ hôm nay. Mục tiêu 990 đang chờ đón!',
    selectedSkill: 'LR'
  };

  saveUserProfile(cleanProfile);
  saveStudySessions([]);
  saveMistakes([]);

  return {
    profile: cleanProfile,
    sessions: [],
    mistakes: []
  };
}
