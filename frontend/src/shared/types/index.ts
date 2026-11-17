// Phân loại kỹ năng chính (Hiện tại L&R 990, sẵn sàng mở rộng S&W 400)
export type SkillType = 'LR' | 'SW';

// Các tab điều hướng chính của hệ thống
export type NavTabId = 'dashboard' | 'exam-mode' | 'history' | 'analytics' | 'mistakes' | 'resources' | 'awards' | 'guide';

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

export type PartOfSpeech = 'n' | 'v' | 'adj' | 'adv' | 'prep' | 'conj' | 'pron' | 'det' | '';

export interface OptionNote {
  label: 'A' | 'B' | 'C' | 'D';
  /** Từ loại viết tắt tiếng Anh; '' với cụm từ hoặc câu */
  pos: PartOfSpeech;
  meaning: string;
}

/** Các mục giải thích; mục không áp dụng là '' */
export interface MistakeExplanation {
  quickTip: string;
  translation: string;
  questionType: string;
  evidence: string;
  paraphrase: string;
  analysis: string;
  keyVocabulary: string;
}

// Sổ tay bẫy & lỗi sai
export interface MistakeEntry {
  id: string;
  updatedAt?: string;
  deletedAt?: string | null;
  sessionId?: string;
  /** Name of the source test; empty explicitly clears a legacy session reference. */
  sourceTestName?: string | null;
  part: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Số câu 1-200 trong đề Full Test; thẻ tạo từ danh sách câu sai luôn có, thẻ nhập lẻ có thể thiếu */
  questionNumber?: number;
  questionContext: string; // Nội dung câu hỏi hoặc vị trí câu (vd: Câu 134 Part 5)
  /** Explicit source stem and reference text; older records only have questionContext. */
  question?: string;
  context?: string;
  /** Private Storage object hashes; URLs and image bytes are never synced. */
  sourceImageIds?: string[];
  userMistake: string;     // Lỗi sai mình mắc phải hoặc đáp án chọn nhầm
  correctAnswer: string;   // Đáp án đúng (vd: (B) be)
  answerSource?: 'PROVIDED' | 'AI_PROPOSED' | 'MISSING';
  /** Phương án người học đã chọn sai. Bản ghi cũ không có thì suy từ userMistake */
  userChoice?: 'A' | 'B' | 'C' | 'D';
  userChoiceState?: 'CHOSEN' | 'UNKNOWN' | 'BLANK';
  /** Nguyên văn lý do người học nhập; AI không thay thế trường này. */
  userReason?: string;
  answerProvidedBy?: 'SOURCE' | 'LEARNER';
  /** AI giải ra phương án khác đáp án của trang đề; còn đến khi người học đổi đáp án hoặc chọn giữ nguyên. */
  answerDoubt?: 'A' | 'B' | 'C' | 'D';
  /** Nghĩa và từ loại từng phương án do AI trả về; bản ghi cũ hoặc nhập tay không có */
  optionNotes?: OptionNote[];
  /** Giải thích theo từng mục do AI trả về; không có thì hiển thị trapTip dạng văn bản */
  explanation?: MistakeExplanation;
  trapTip?: string;        // Mẹo bẫy thi / Bí kíp 10s cần nhớ
  options?: string[];      // 4 phương án trắc nghiệm (vd: ['(A) are', '(B) be', '(C) were', '(D) will be'])
  category: ErrorCategory;
  tags: string[];          // ví dụ: ['inversion', 'synonym', 'double-passage']
  status: 'NEEDS_REVIEW' | 'MASTERED';
  createdAt: string;       // ISO Date

  // --- Lịch ôn giãn cách (SPEC mục 4.6) ---
  /** Ngày hẹn ôn kế tiếp 'YYYY-MM-DD'. Thiếu trường này nghĩa là chưa từng ôn, coi như đến hạn ngay */
  nextReviewDate?: string;
  /** Bậc giãn cách hiện tại: 0 -> 1 ngày, 1 -> 3, 2 -> 7, 3 -> 14, 4 -> 30 */
  reviewStage?: number;
  /** Số lần đã ôn, dùng để thấy thẻ nào dai dẳng nhất */
  reviewCount?: number;
  lastReviewedAt?: string;
}

/** Elapsed durations explicitly visible in the result, normalized to seconds. */
export interface ResultImageTiming {
  totalSeconds: number | null;
  listeningSeconds: number | null;
  readingSeconds: number | null;
  parts: { part1: number | null; part2: number | null; part3: number | null; part4: number | null;
    part5: number | null; part6: number | null; part7: number | null };
}
export interface ConfirmedResultTiming extends ResultImageTiming {
  source: 'IMAGE_CONFIRMED';
}

// Bản ghi một buổi học / làm test
export interface StudySession {
  id: string;
  updatedAt?: string;
  deletedAt?: string | null;
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
  scoreSource?: 'ESTIMATED' | 'MANUAL_SECTIONS' | 'MANUAL_TOTAL';
  scoreConversionVersion?: string; // Bảng xấp xỉ dùng khi tính; không phải bảng chấm chính thức ETS.
  partScores?: LRPartScore;
  /** Full Test ghi bằng danh sách câu sai (1-200, tăng dần); partScores được suy ra từ danh sách này */
  wrongQuestions?: number[];
  resultTiming?: ConfirmedResultTiming;

  /**
   * Dành cho buổi LUYỆN PART LẺ: kết quả từng Part đã luyện trong buổi.
   * Một buổi có thể luyện nhiều Part, mỗi Part có số câu riêng - khác với
   * partScores của Full Test vốn cố định 6/25/39/30/30/16/54 câu.
   * Trước đây dữ liệu này bị nhét vào chuỗi notes nên không màn hình nào
   * dùng được (SPEC mục 4.4).
   */
  practiceParts?: PracticePartResult[];

  notes?: string;
  attemptNumber?: number;  // Lần làm thứ mấy của đề thi này: 1, 2, 3...
  /** Phân bổ thời gian thực tế từng Part (đặc biệt Reading Part 5-7) cho Full Test */
  partDurations?: PartTimingDurations;
  createdAt: string;
}

export interface PartTimingDurations {
  part5?: number;
  part6?: number;
  part7?: number;
}

// Kết quả luyện tập của MỘT Part trong buổi luyện lẻ (SPEC 4.4)
export interface PracticePartResult {
  part: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  correct: number; // Số câu làm đúng
  total: number;   // Tổng số câu đã làm của Part này
}

// Kết quả một pha trong lượt bấm nhịp (SPEC 4.3)
export interface PacingPhaseResult {
  name: string;
  plannedMinutes: number;  // Thời lượng pha theo kế hoạch
  actualMinutes: number;   // Thời gian thực tế người học đã dùng cho pha này
  overrunMinutes: number;  // Dương là vượt giờ, âm là xong sớm
}

/**
 * Một lượt chạy Bộ đếm nhịp. Dữ liệu này thu thập TỰ ĐỘNG từ thao tác
 * đánh dấu xong pha - người học không phải gõ con số nào - và là nguồn
 * cho đường cong mệt mỏi cùng nhóm lỗi TIME_PRESSURE (SPEC 1.4 điểm 3).
 */
export type ReadingPartType = 'PART_5' | 'PART_6' | 'PART_7' | 'PART_7_SINGLE' | 'PART_7_MULTI' | 'FULL_READING' | 'POMODORO' | 'CUSTOM';

export interface PacingRun {
  id: string;
  updatedAt?: string;
  deletedAt?: string | null;
  presetId: string;
  presetName: string;
  date: string;             // 'YYYY-MM-DD'
  plannedMinutes: number;   // Tổng thời lượng chế độ
  actualMinutes: number;    // Thời gian thật đã dùng tới lúc kết thúc
  finishedNaturally: boolean; // true nếu chạy hết giờ, false nếu dừng sớm
  phases: PacingPhaseResult[]; // Rỗng nếu người học không đánh dấu pha nào
  createdAt: string;

  // Trường chuyên sâu cho Luyện Tốc Độ Reading
  partType?: ReadingPartType;
  testName?: string;
  totalQuestions?: number;
  correctAnswers?: number;
  actualSeconds?: number;
  speedSecPerQuestion?: number;
  accuracyPercent?: number;
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
  minPercent: number;
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
    minPercent: 0,
    badgeColor: 'from-slate-700 to-slate-800',
    textColor: 'text-slate-300',
    glowColor: 'rgba(148, 163, 184, 0.3)',
    icon: 'Shield',
    description: 'Đang làm quen với cấu trúc đề thi TOEIC và xây dựng nền tảng từ vựng.'
  },
  {
    name: 'BRONZE',
    title: 'Đồng Chinh Phục',
    minPercent: 50,
    badgeColor: 'from-amber-700 to-amber-900',
    textColor: 'text-amber-400',
    glowColor: 'rgba(217, 119, 6, 0.4)',
    icon: 'Award',
    description: 'Nắm vững ngữ pháp cơ bản và phản xạ tốt các câu hỏi giao tiếp Part 1-2.'
  },
  {
    name: 'SILVER',
    title: 'Bạc Chiến Lược',
    minPercent: 70,
    badgeColor: 'from-slate-400 to-slate-600',
    textColor: 'text-cyan-300',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    icon: 'Zap',
    description: 'Khả năng đọc hiểu nhanh, nghe tốt đoạn hội thoại Part 3-4 và cấu trúc Part 5.'
  },
  {
    name: 'GOLD',
    title: 'Vàng Tinh Anh',
    minPercent: 85,
    badgeColor: 'from-yellow-500 to-amber-600',
    textColor: 'text-yellow-400',
    glowColor: 'rgba(234, 179, 8, 0.5)',
    icon: 'Star',
    description: 'Đạt ngưỡng làm chủ bài thi. Đang giải quyết các bẫy khó và bài đọc đôi, ba Part 7.'
  },
  {
    name: 'PLATINUM',
    title: 'Bạch Kim Cao Thủ',
    minPercent: 92,
    badgeColor: 'from-indigo-500 to-purple-600',
    textColor: 'text-indigo-300',
    glowColor: 'rgba(99, 102, 241, 0.5)',
    icon: 'Crown',
    description: 'Phong độ đỉnh cao, chỉ còn 5-8 lỗi nhỏ trên toàn bài thi 200 câu.'
  },
  {
    name: 'DIAMOND',
    title: 'Kim Cương Huyền Thoại',
    minPercent: 97,
    badgeColor: 'from-cyan-400 to-blue-600',
    textColor: 'text-cyan-200',
    glowColor: 'rgba(56, 189, 248, 0.6)',
    icon: 'Sparkles',
    description: 'Tiệm cận độ hoàn hảo. Phản xạ tự nhiên như người bản xứ.'
  },
  {
    name: 'GRANDMASTER',
    title: 'Đại Sư — Chạm Mục Tiêu',
    minPercent: 100,
    badgeColor: 'from-fuchsia-500 via-purple-600 to-pink-600',
    textColor: 'text-fuchsia-300',
    glowColor: 'rgba(217, 70, 239, 0.8)',
    icon: 'Trophy',
    description: 'Đã chạm mục tiêu TOEIC Listening & Reading do bạn đặt ra.'
  }
];

// Cấu hình người dùng & Trạng thái thói quen
export interface UserProfile {
  name: string;
  updatedAt?: string;
  deletedAt?: string | null;
  targetScore: number;       // Thường là 990
  examDate: string;          // 'YYYY-MM-DD'
  currentStreak: number;     // Số ngày liên tục
  longestStreak: number;     // Chuỗi kỷ lục
  streakFreezes: number;     // Khiên bảo vệ chuỗi còn lại (tối đa 2)
  shieldAllowance?: number;  // Tổng số khiên đã cấp; số còn lại được suy từ ngày dùng khiên
  lastStudyDate: string;     // Ngày gần nhất ghi nhận học 'YYYY-MM-DD'
  dailyMinGoalMinutes: number; // vd: 30 phút
  motto: string;             // Câu châm ngôn hoặc cam kết cá nhân
  selectedSkill: SkillType;  // 'LR' | 'SW'
  /** Hôm nay: số buổi muốn học mỗi tuần (mặc định 5). */
  weeklyGoalDays?: number;
  /** Hôm nay: học viên đã tự chọn mục tiêu (phân biệt với mặc định 990 chưa chọn). */
  goalChosen?: boolean;
  /** Hôm nay: tối đa 3 "Việc của mình" tự đánh dấu mỗi ngày; ngày đánh dấu tính vào chuỗi. */
  habits?: Habit[];
  /** Hôm nay: loại việc Sóc không được gợi ý nữa ('REVIEW_MISTAKES' | 'PART_TIMER' | 'FULL_TEST'). */
  suggestOff?: string[];
  /** Thành tích: phụ kiện Sóc đang đeo (id trong socGear.ts); thiếu nghĩa là chưa chọn, Sóc đeo món mới nhất. */
  socGear?: string[];
  /** Hôm nay: việc một lần Sóc gợi ý từ nhận xét một đề (thêm bằng tay, mất sau khi xong hoặc sau 7 ngày). */
  suggestedTasks?: SuggestedTask[];
}

/** A one-off task added from Sóc's advice on one test; done once, gone after that day or after 7 days. */
export interface SuggestedTask {
  /** `${attemptId}:${part ?? 0}:${kind}`: the same advice is added only once. */
  id: string;
  kind: 'timer' | 'notebook';
  /** "Bấm giờ Part 7" / "Ôn 9 câu trong Sổ tay" */
  title: string;
  minutes: number;
  part: number | null;
  testName: string;
  /** Date of the test, for "Sóc gợi ý từ đề dd/mm". */
  testDate: string;
  addedDate: string;
  doneDate?: string;
}

/** A learner's own recurring task, ticked by hand. doneDates keeps only recent days. */
export interface Habit {
  id: string;
  title: string;
  doneDates: string[];
}

// ================= KẾ HOẠCH TUẦN SMART =================
export type SmartTaskType =
  | 'AUTO_FULL_TEST'      // Tự động đếm đề Full Test trong tuần
  | 'AUTO_PART_PRACTICE'  // Tự động đếm bài luyện Part cụ thể trong tuần
  | 'AUTO_STUDY_TIME'     // Tự động đếm tổng phút học trong tuần
  | 'CUSTOM';             // Người dùng tự tick hoàn thành hoặc tự tăng giảm

export type TaskColorKey = 'indigo' | 'blue' | 'amber' | 'sky' | 'rose' | 'purple';

export interface SmartWeeklyTask {
  id: string;
  title: string;
  type: SmartTaskType;
  target: number;           // Số lượng mục tiêu (ví dụ 1 đề, 180 phút, 1 lần)
  unit: string;             // 'đề', 'phút', 'lần', 'buổi'
  partNumber?: number;      // Nếu là AUTO_PART_PRACTICE (Part 1-7)
  manualDone?: number;      // Tiến độ người dùng tự tick/nhập (với CUSTOM)
  isCompleted?: boolean;    // Đánh dấu hoàn thành
  notes?: string;           // Ghi chú hoặc lý do
  color?: TaskColorKey;     // Gam màu tùy biến (6 màu chuẩn Neo Pastel)
  createdAt: string;
}

export interface WeeklyPlanRecord {
  weekKey: string;          // Định dạng 'YYYY-MM-DD' (Thứ Hai đầu tuần)
  tasks: SmartWeeklyTask[];
}

