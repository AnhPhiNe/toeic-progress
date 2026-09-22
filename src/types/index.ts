// Phân loại kỹ năng chính (Hiện tại L&R 990, sẵn sàng mở rộng S&W 400)
export type SkillType = 'LR' | 'SW';

// Các tab điều hướng chính của hệ thống
export type NavTabId = 'dashboard' | 'analytics' | 'exam-mode' | 'mistakes' | 'resources' | 'sw-roadmap';

// Chi tiết số câu đúng của từng Part trong bài thi TOEIC Listening & Reading
export interface LRPartScore {
  part1: number; // Max 6 (Photographs)
  part2: number; // Max 25 (Question-Response)
  part3: number; // Max 39 (Conversations)
  part4: number; // Max 30 (Short Talks)
  part5: number; // Max 30 (Incomplete Sentences)
  part6: number; // Max 16 (Text Completion)
  part7: number; // Max 54 (Reading Comprehension)
}

// Phân loại nguyên nhân sai
export type ErrorCategory =
  | 'VOCABULARY_TRAP'     // Bẫy từ vựng / Từ đồng nghĩa / Paraphrase
  | 'ADVANCED_GRAMMAR'    // Ngữ pháp nâng cao (Đảo ngữ, Mệnh đề quan hệ rút gọn...)
  | 'LISTENING_SPEED'     // Tốc độ nghe nhanh / Nối âm / Nuốt âm / Giọng lạ (Úc, Anh)
  | 'TIME_PRESSURE'       // Cháy giờ / Không kịp đọc bài dài Part 7
  | 'CARELESS_DISTRACTION'// Đọc ẩu / Mất tập trung / Tô nhầm đáp án
  | 'OTHER';              // Khác

export const ERROR_CATEGORY_LABELS: Record<ErrorCategory, { label: string; color: string; bg: string }> = {
  VOCABULARY_TRAP: { label: 'Bẫy Từ Vựng & Paraphrase', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
  ADVANCED_GRAMMAR: { label: 'Ngữ Pháp Nâng Cao', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
  LISTENING_SPEED: { label: 'Tốc Độ Nghe & Nối Âm', color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.15)' },
  TIME_PRESSURE: { label: 'Áp Lực Thời Gian / Cháy Giờ', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
  CARELESS_DISTRACTION: { label: 'Mất Tập Trung / Đọc Ẩu', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)' },
  OTHER: { label: 'Lý Do Khác', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)' }
};

// Sổ tay bẫy & lỗi sai
export interface MistakeEntry {
  id: string;
  sessionId?: string;
  part: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  questionContext: string; // Nội dung câu hỏi hoặc vị trí câu (vd: Câu 134 Part 5)
  userMistake: string;     // Lỗi sai mình mắc phải hoặc đáp án chọn nhầm
  correctAnswer: string;   // Đáp án đúng & cốt lõi cần nhớ
  category: ErrorCategory;
  tags: string[];          // ví dụ: ['inversion', 'synonym', 'double-passage']
  status: 'NEEDS_REVIEW' | 'MASTERED';
  createdAt: string;       // ISO Date
}

// Bản ghi một buổi học / làm test
export interface StudySession {
  id: string;
  skillType: SkillType;
  sessionType: 'FULL_TEST' | 'PART_PRACTICE';
  testName: string;        // vd: "ETS 2024 Test 03" hoặc "Luyện chuyên sâu Part 5 & 7"
  date: string;            // 'YYYY-MM-DD'
  durationMinutes: number; // Thời gian làm bài (phút)
  
  // Dành cho L&R
  rawListening?: number;   // 0 - 100
  rawReading?: number;     // 0 - 100
  scaledListening?: number;// 5 - 495
  scaledReading?: number;  // 5 - 495
  totalScore?: number;     // 10 - 990
  partScores?: LRPartScore;
  
  notes?: string;
  attemptNumber?: number;  // Lần làm thứ mấy của đề thi này: 1, 2, 3...
  createdAt: string;
}

// Thông tin định danh và phân tích lần làm bài
export interface SessionAttemptMeta {
  attemptNumber: number;
  totalAttempts: number;
  isRetest: boolean;
  previousSession?: StudySession;
  firstSession?: StudySession;
  scoreDiffFromPrevious: number | null;
  scoreDiffFromFirst: number | null;
}

// Chế độ lọc biểu đồ theo lần làm
export type ChartAttemptFilter = 'ALL' | 'FIRST_ONLY' | 'BEST_ONLY';

// Bậc Rank theo điểm số
export interface RankTier {
  name: string;
  title: string;
  minScore: number;
  maxScore: number;
  badgeColor: string;
  textColor: string;
  glowColor: string;
  icon: string;
  description: string;
}

export const RANK_TIERS: RankTier[] = [
  {
    name: 'RECRUIT',
    title: 'Tân Binh Khởi Đầu',
    minScore: 0,
    maxScore: 495,
    badgeColor: 'from-slate-700 to-slate-800',
    textColor: 'text-slate-300',
    glowColor: 'rgba(148, 163, 184, 0.3)',
    icon: 'Shield',
    description: 'Đang làm quen với cấu trúc đề thi TOEIC và xây dựng nền tảng từ vựng.'
  },
  {
    name: 'BRONZE',
    title: 'Đồng Chinh Phục',
    minScore: 500,
    maxScore: 695,
    badgeColor: 'from-amber-700 to-amber-900',
    textColor: 'text-amber-400',
    glowColor: 'rgba(217, 119, 6, 0.4)',
    icon: 'Award',
    description: 'Nắm vững ngữ pháp cơ bản và phản xạ tốt các câu hỏi giao tiếp Part 1-2.'
  },
  {
    name: 'SILVER',
    title: 'Bạc Chiến Lược',
    minScore: 700,
    maxScore: 845,
    badgeColor: 'from-slate-400 to-slate-600',
    textColor: 'text-cyan-300',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    icon: 'Zap',
    description: 'Khả năng đọc hiểu nhanh, nghe tốt đoạn hội thoại Part 3-4 và cấu trúc Part 5.'
  },
  {
    name: 'GOLD',
    title: 'Vàng Tinh Anh',
    minScore: 850,
    maxScore: 895,
    badgeColor: 'from-yellow-500 to-amber-600',
    textColor: 'text-yellow-400',
    glowColor: 'rgba(234, 179, 8, 0.5)',
    icon: 'Star',
    description: 'Đạt ngưỡng làm chủ bài thi. Đang giải quyết các bẫy khó và bài đọc đôi, ba Part 7.'
  },
  {
    name: 'PLATINUM',
    title: 'Bạch Kim Cao Thủ',
    minScore: 900,
    maxScore: 945,
    badgeColor: 'from-indigo-500 to-purple-600',
    textColor: 'text-indigo-300',
    glowColor: 'rgba(99, 102, 241, 0.5)',
    icon: 'Crown',
    description: 'Phong độ đỉnh cao, chỉ còn 5-8 lỗi nhỏ trên toàn bài thi 200 câu.'
  },
  {
    name: 'DIAMOND',
    title: 'Kim Cương Huyền Thoại',
    minScore: 950,
    maxScore: 985,
    badgeColor: 'from-cyan-400 to-blue-600',
    textColor: 'text-cyan-200',
    glowColor: 'rgba(56, 189, 248, 0.6)',
    icon: 'Sparkles',
    description: 'Tiệm cận độ hoàn hảo. Phản xạ tự nhiên như người bản xứ.'
  },
  {
    name: 'GRANDMASTER',
    title: 'Đại Sư 990 Tuyệt Đối',
    minScore: 990,
    maxScore: 990,
    badgeColor: 'from-fuchsia-500 via-purple-600 to-pink-600',
    textColor: 'text-fuchsia-300',
    glowColor: 'rgba(217, 70, 239, 0.8)',
    icon: 'Trophy',
    description: 'Mục tiêu tối thượng đã thành hiện thực! Đạt 990/990 TOEIC Listening & Reading!'
  }
];

// Cấu hình người dùng & Trạng thái thói quen
export interface UserProfile {
  name: string;
  targetScore: number;       // Thường là 990
  examDate: string;          // 'YYYY-MM-DD'
  currentStreak: number;     // Số ngày liên tục
  longestStreak: number;     // Chuỗi kỷ lục
  streakFreezes: number;     // Khiên bảo vệ chuỗi còn lại (tối đa 2)
  lastStudyDate: string;     // Ngày gần nhất ghi nhận học 'YYYY-MM-DD'
  dailyMinGoalMinutes: number; // vd: 30 phút
  motto: string;             // Câu châm ngôn hoặc cam kết cá nhân
  selectedSkill: SkillType;  // 'LR' | 'SW'
}
