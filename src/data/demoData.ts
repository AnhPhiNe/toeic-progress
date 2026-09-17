import { StudySession, MistakeEntry, UserProfile } from '../types';

export const INITIAL_USER_PROFILE: UserProfile = {
  name: 'Minh Tuấn',
  targetScore: 990,
  examDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 45 ngày nữa
  currentStreak: 18,
  longestStreak: 24,
  streakFreezes: 2,
  lastStudyDate: new Date().toISOString().split('T')[0],
  dailyMinGoalMinutes: 30,
  motto: 'Kỷ luật là cầu nối giữa mục tiêu và sự hoàn hảo 990.',
  selectedSkill: 'LR'
};

export const DEMO_SESSIONS: StudySession[] = [
  {
    id: 'demo-session-1',
    skillType: 'LR',
    sessionType: 'FULL_TEST',
    testName: 'ETS 2024 Test 01',
    date: '2026-08-15',
    durationMinutes: 120,
    rawListening: 82,
    rawReading: 78,
    scaledListening: 430,
    scaledReading: 395,
    totalScore: 825,
    partScores: {
      part1: 5,
      part2: 21,
      part3: 31,
      part4: 25,
      part5: 24,
      part6: 12,
      part7: 42
    },
    notes: 'Khởi động lại sau kỳ nghỉ. Part 7 bị cuống ở 10 câu cuối do thiếu 8 phút. Part 3 hụt 2 câu hỏi ngụ ý.',
    createdAt: '2026-08-15T21:00:00.000Z'
  },
  {
    id: 'demo-session-2',
    skillType: 'LR',
    sessionType: 'FULL_TEST',
    testName: 'ETS 2024 Test 02',
    date: '2026-08-22',
    durationMinutes: 118,
    rawListening: 88,
    rawReading: 82,
    scaledListening: 455,
    scaledReading: 415,
    totalScore: 870,
    partScores: {
      part1: 6,
      part2: 23,
      part3: 34,
      part4: 25,
      part5: 26,
      part6: 13,
      part7: 43
    },
    notes: 'Phân bổ thời gian Part 5 tốt hơn (11 phút). Part 2 phản xạ nhanh hơn, dính 1 bẫy câu trả lời gián tiếp.',
    createdAt: '2026-08-22T21:30:00.000Z'
  },
  {
    id: 'demo-session-3',
    skillType: 'LR',
    sessionType: 'PART_PRACTICE',
    testName: 'Cày sâu Part 5 & 6 (Hacker TOEIC)',
    date: '2026-08-28',
    durationMinutes: 45,
    rawListening: 0,
    rawReading: 42,
    scaledListening: 0,
    scaledReading: 0,
    totalScore: 0,
    notes: 'Luyện tốc độ 46 câu ngữ pháp & từ vựng. Đạt 42/46 câu đúng. Làm chủ bẫy liên từ và giới từ chỉ mục đích.',
    createdAt: '2026-08-28T22:00:00.000Z'
  },
  {
    id: 'demo-session-4',
    skillType: 'LR',
    sessionType: 'FULL_TEST',
    testName: 'ETS 2024 Test 03',
    date: '2026-09-02',
    durationMinutes: 115,
    rawListening: 93,
    rawReading: 89,
    scaledListening: 480,
    scaledReading: 440,
    totalScore: 920,
    partScores: {
      part1: 6,
      part2: 24,
      part3: 36,
      part4: 27,
      part5: 28,
      part6: 15,
      part7: 46
    },
    notes: 'Cột mốc phá vỡ 900+! Nghe bắt đầu thư thả, đọc lướt lăng xê câu hỏi trước khi nghe rất hiệu quả.',
    createdAt: '2026-09-02T21:00:00.000Z'
  },
  {
    id: 'demo-session-5',
    skillType: 'LR',
    sessionType: 'FULL_TEST',
    testName: 'Hacker 3 Test 01 (Hard)',
    date: '2026-09-08',
    durationMinutes: 120,
    rawListening: 91,
    rawReading: 88,
    scaledListening: 475,
    scaledReading: 435,
    totalScore: 910,
    partScores: {
      part1: 6,
      part2: 23,
      part3: 35,
      part4: 27,
      part5: 27,
      part6: 14,
      part7: 47
    },
    notes: 'Đề Hacker giọng Úc nhanh và nhiều từ lạ ở Part 7 Triple passage. Vẫn duy trì tốt phong độ 900+.',
    createdAt: '2026-09-08T22:15:00.000Z'
  },
  {
    id: 'demo-session-6',
    skillType: 'LR',
    sessionType: 'FULL_TEST',
    testName: 'ETS 2024 Test 04',
    date: '2026-09-13',
    durationMinutes: 112,
    rawListening: 97,
    rawReading: 94,
    scaledListening: 495,
    scaledReading: 465,
    totalScore: 960,
    partScores: {
      part1: 6,
      part2: 25,
      part3: 38,
      part4: 28,
      part5: 29,
      part6: 15,
      part7: 50
    },
    notes: 'KỶ LỤC MỚI 960! Max Listening 495/495 (97/100 raw). Chỉ còn cách mục tiêu 990 đúng 30 điểm Reading!',
    createdAt: '2026-09-13T20:45:00.000Z'
  }
];

export const DEMO_MISTAKES: MistakeEntry[] = [
  {
    id: 'mistake-1',
    sessionId: 'demo-session-6',
    part: 7,
    questionContext: 'Câu 182 (Đoạn kép Email & Schedule): Thời điểm bảo trì máy chủ diễn ra khi nào?',
    userMistake: 'Chọn 14:00 vì đọc lướt thấy mốc giờ này trong bảng lịch trình phụ.',
    correctAnswer: 'Đáp án là 18:00 (Sau giờ làm việc). Bẫy thông tin liên kết giữa 2 bài: email thông báo dời lịch do lỗi kỹ thuật.',
    category: 'VOCABULARY_TRAP',
    tags: ['Part7', 'DoublePassage', 'ParaphraseTrap'],
    status: 'NEEDS_REVIEW',
    createdAt: '2026-09-13T21:10:00.000Z'
  },
  {
    id: 'mistake-2',
    sessionId: 'demo-session-6',
    part: 5,
    questionContext: 'Câu 128: Hardly ______ the contract when the client requested amendments.',
    userMistake: 'Chọn "he had signed" theo thói quen chủ ngữ đứng trước động từ.',
    correctAnswer: 'Đáp án đúng: "had he signed". Cấu trúc đảo ngữ với phó từ phủ định đứng đầu câu: Hardly/Scarcely + Had + S + V3.',
    category: 'ADVANCED_GRAMMAR',
    tags: ['Part5', 'Inversion', 'GrammarTrap'],
    status: 'MASTERED',
    createdAt: '2026-09-13T21:15:00.000Z'
  },
  {
    id: 'mistake-3',
    sessionId: 'demo-session-5',
    part: 3,
    questionContext: 'Câu 54 (Hội thoại văn phòng): Người phụ nữ có ý gì khi nói "Does the elevator work today?"',
    userMistake: 'Nghĩ rằng cô ấy hỏi đường đi thang máy.',
    correctAnswer: 'Ngụ ý cô ấy ngạc nhiên/phàn nàn vì thang máy hỏng, buộc phải đi cầu thang bộ lên tầng 8.',
    category: 'LISTENING_SPEED',
    tags: ['Part3', 'Implication', 'AustralianAccent'],
    status: 'NEEDS_REVIEW',
    createdAt: '2026-09-08T22:30:00.000Z'
  },
  {
    id: 'mistake-4',
    sessionId: 'demo-session-4',
    part: 6,
    questionContext: 'Câu 138 (Điền liên từ câu): ______ of the harsh weather, the outdoor seminar was rescheduled.',
    userMistake: 'Chọn "In spite" (thiếu of) hoặc nhầm với "Because".',
    correctAnswer: 'Đáp án đúng: "In light of" (bằng với Because of/Considering). Cần học thuộc cụm từ cố định.',
    category: 'VOCABULARY_TRAP',
    tags: ['Part6', 'Collocation', 'PrepositionalPhrase'],
    status: 'MASTERED',
    createdAt: '2026-09-02T21:40:00.000Z'
  },
  {
    id: 'mistake-5',
    sessionId: 'demo-session-2',
    part: 2,
    questionContext: 'Câu 19: "Who is in charge of reviewing the vendor proposals?"',
    userMistake: 'Chờ đợi nghe tên người (vd: Mr. Smith) nên bỏ lỡ câu trả lời.',
    correctAnswer: 'Đáp án đúng: "Hasn\'t the director assigned anyone yet?". Dạng câu hỏi Who nhưng đáp lại bằng câu hỏi ngược gián tiếp.',
    category: 'CARELESS_DISTRACTION',
    tags: ['Part2', 'IndirectResponse', 'WhoQuestion'],
    status: 'MASTERED',
    createdAt: '2026-08-22T21:50:00.000Z'
  },
  {
    id: 'mistake-6',
    sessionId: 'demo-session-1',
    part: 7,
    questionContext: 'Câu 196-200: Bộ 3 bài đọc tuyển dụng & hợp đồng.',
    userMistake: 'Còn 3 phút phải khoanh bừa 4 câu cuối.',
    correctAnswer: 'Chiến thuật: Dành tối đa 50 phút cho 100 câu đầu, dành đủ 55 phút cho Part 7. Cần luyện skim-scan tốc độ cao.',
    category: 'TIME_PRESSURE',
    tags: ['Part7', 'TriplePassage', 'PacingStrategy'],
    status: 'NEEDS_REVIEW',
    createdAt: '2026-08-15T21:30:00.000Z'
  }
];

export const MOTIVATIONAL_QUOTES = [
  { quote: 'Sự kiên trì không phải là một cuộc chạy đua dài, mà là nhiều cuộc chạy đua ngắn liên tiếp mỗi ngày.', author: 'Walter Elliot' },
  { quote: 'Mốc 990 không chỉ đo lường vốn tiếng Anh, nó đo lường sự kỷ luật thép và độ chính xác của tâm trí bạn.', author: 'TOEIC Master' },
  { quote: 'Những người chiến thắng không làm những điều khác biệt, họ làm mọi việc bình thường một cách phi thường.', author: 'Shiv Khera' },
  { quote: 'Mỗi lỗi sai hôm nay được giải mã là một điểm số 990 được bảo toàn ngày mai.', author: 'ETS Strategist' },
  { quote: 'Đừng đợi cảm hứng mới học. Kỷ luật xuất hiện trước, kết quả và cảm hứng sẽ tự động theo sau.', author: 'Atomic Habits' }
];
