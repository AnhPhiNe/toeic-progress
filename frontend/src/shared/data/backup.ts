import { z } from 'zod';
import { confirmedResultTimingSchema } from '@/shared/domain/resultTiming';
import type { DataBundle } from '@/shared/data/dataBundle';
import { explanationSchema, optionNoteSchema, normalizeReviewTimestamp, normalizeMistakeRecord } from '@/shared/data/mistakeFields';
import { partOfQuestion, partScoresFromWrong } from '@/shared/domain/questionNumbers';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'phải là ngày YYYY-MM-DD')
  .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) > 0, 'ngày không tồn tại');
const timestamp = z.string().min(1, 'thiếu thời điểm')
  .refine(value => /T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), 'thời điểm không hợp lệ hoặc thiếu múi giờ');
const metadata = { updatedAt: timestamp, deletedAt: timestamp.nullable() };
const questionNumber = z.number().int().min(1).max(200);
const partNumber = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]);
const category = z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']);
const nonnegative = z.number().finite().nonnegative();

const profile = z.object({
  name: z.string().min(1), targetScore: z.number().int().min(10).max(990), examDate: z.union([date, z.literal('')]),
  currentStreak: z.number().int().nonnegative(), longestStreak: z.number().int().nonnegative(),
  streakFreezes: z.number().int().min(0).max(5), lastStudyDate: z.union([date, z.literal('')]),
  shieldAllowance: z.number().int().nonnegative().optional(), goalChosen: z.boolean().optional(),
  // Sóc của bạn: an unknown coat is kept (read as Nâu cam) so a newer backup still restores.
  socCoat: z.string().max(20).optional(), socName: z.string().max(60).optional(),
  dailyMinGoalMinutes: z.number().int().positive(), motto: z.string(), selectedSkill: z.enum(['LR', 'SW']),
  ...metadata
}).passthrough();

const partScores = z.object({
  part1: z.number().int().min(0).max(6), part2: z.number().int().min(0).max(25),
  part3: z.number().int().min(0).max(39), part4: z.number().int().min(0).max(30),
  part5: z.number().int().min(0).max(30), part6: z.number().int().min(0).max(16),
  part7: z.number().int().min(0).max(54)
});

const practicePart = z.object({ part: partNumber, correct: z.number().int().nonnegative(), total: z.number().int().positive() })
  .refine(value => value.correct <= value.total && value.total <= [6, 25, 39, 30, 30, 16, 54][value.part - 1], 'số câu đúng/tổng câu không hợp lệ');

const session = z.object({
  id: z.string().min(1), skillType: z.enum(['LR', 'SW']),
  sessionType: z.enum(['FULL_TEST', 'PART_PRACTICE']), testName: z.string().min(1),
  date, durationMinutes: nonnegative, rawListening: z.number().int().min(0).max(100).optional(),
  rawReading: z.number().int().min(0).max(100).optional(), scaledListening: z.number().int().min(0).max(495).optional(),
  scaledReading: z.number().int().min(0).max(495).optional(), totalScore: z.number().int().min(0).max(990).optional(),
  partScores: partScores.optional(), practiceParts: z.array(practicePart).max(7).refine(parts => new Set(parts.map(part => part.part)).size === parts.length, 'Part luyện tập bị trùng').optional(),
  scoreSource: z.enum(['ESTIMATED','MANUAL_SECTIONS','MANUAL_TOTAL']).optional(),
  scoreConversionVersion: z.string().max(100).optional(),
  wrongQuestions: z.array(questionNumber).max(200).refine(list => list.every((value, index) => index === 0 || value > list[index - 1]), 'danh sách câu sai phải tăng dần, không trùng').optional(),
  resultTiming: confirmedResultTimingSchema.optional(),
  notes: z.string().optional(), attemptNumber: z.number().int().positive().optional(), createdAt: timestamp,
  ...metadata
}).passthrough().superRefine((value, context) => {
  if (value.resultTiming && value.sessionType !== 'FULL_TEST') context.addIssue({ code: 'custom', path: ['resultTiming'], message: 'thời gian từ ảnh chỉ dùng cho Full Test' });
  if (value.wrongQuestions) {
    if (value.sessionType !== 'FULL_TEST') context.addIssue({ code: 'custom', path: ['wrongQuestions'], message: 'danh sách câu sai chỉ dùng cho Full Test' });
    else if (value.partScores && Object.entries(partScoresFromWrong(value.wrongQuestions)).some(([key, correct]) => value.partScores![key as keyof typeof value.partScores] !== correct))
      context.addIssue({ code: 'custom', path: ['wrongQuestions'], message: 'số câu đúng từng Part không khớp danh sách câu sai' });
  }
  if (!value.scoreSource) return;
  const issue = (message: string) => context.addIssue({ code: 'custom', path:['scoreSource'], message });
  if (value.sessionType !== 'FULL_TEST') issue('nguồn điểm chỉ áp dụng cho bài Full Test');
  if (value.totalScore === undefined || value.totalScore < 10 || value.totalScore % 5 !== 0) issue('tổng điểm phải từ 10 đến 990 theo bước 5');
  if (value.scoreSource === 'MANUAL_TOTAL') {
    if (value.scaledListening !== undefined || value.scaledReading !== undefined) issue('chỉ nhập tổng thì không có điểm từng kỹ năng');
  } else {
    if ([value.scaledListening,value.scaledReading].some(score => score === undefined || score < 5 || score % 5 !== 0)) issue('điểm kỹ năng phải từ 5 đến 495 theo bước 5');
    if (value.totalScore !== (value.scaledListening ?? 0) + (value.scaledReading ?? 0)) issue('tổng điểm không bằng Listening cộng Reading');
    if (value.scoreSource === 'ESTIMATED' && !value.partScores) issue('thiếu số câu đúng từng Part để ước tính');
  }
});

const mistake = z.object({
  id: z.string().min(1), sessionId: z.string().optional(), part: partNumber, questionNumber: questionNumber.optional(),
  sourceTestName: z.string().max(300).nullable().optional(),
  questionContext: z.string(), userMistake: z.string(), correctAnswer: z.string(),
  question: z.string().max(16000).optional(), context: z.string().max(16000).optional(),
  sourceImageIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(3).optional(),
  answerSource: z.enum(['PROVIDED', 'AI_PROPOSED', 'MISSING']).optional(),
  userChoice: z.enum(['A', 'B', 'C', 'D']).optional(),
  userChoiceState: z.enum(['CHOSEN', 'UNKNOWN', 'BLANK']).optional(),
  userReason: z.string().max(2000).optional(),
  answerProvidedBy: z.enum(['SOURCE', 'LEARNER']).optional(),
  answerDoubt: z.enum(['A', 'B', 'C', 'D']).optional(),
  optionNotes: z.array(optionNoteSchema).max(4).optional(),
  explanation: explanationSchema.optional(),
  trapTip: z.string().optional(),
  options: z.array(z.string()).optional(),
  category, tags: z.array(z.string()), status: z.enum(['NEEDS_REVIEW', 'MASTERED']),
  createdAt: timestamp, nextReviewDate: date.optional(), reviewStage: nonnegative.optional(),
  reviewCount: nonnegative.optional(), lastReviewedAt: timestamp.optional(), ...metadata
}).passthrough().superRefine((value, context) => {
  if (value.questionNumber !== undefined && partOfQuestion(value.questionNumber) !== value.part) context.addIssue({ code: 'custom', path: ['questionNumber'], message: 'số câu không thuộc Part đã chọn' });
  if (value.userChoiceState === 'CHOSEN' && !value.userChoice) context.addIssue({ code: 'custom', path: ['userChoice'], message: 'thiếu phương án đã chọn' });
  if (value.userChoiceState && value.userChoiceState !== 'CHOSEN' && value.userChoice) context.addIssue({ code: 'custom', path: ['userChoice'], message: 'Không nhớ/Bỏ trống không có phương án đã chọn' });
});

const pacingRun = z.object({
  id: z.string().min(1), presetId: z.string(), presetName: z.string(), date,
  plannedMinutes: nonnegative, actualMinutes: nonnegative, finishedNaturally: z.boolean(),
  phases: z.array(z.object({ name: z.string(), plannedMinutes: nonnegative, actualMinutes: nonnegative, overrunMinutes: z.number().finite() })),
  partType: z.enum(['PART_5', 'PART_6', 'PART_7', 'PART_7_SINGLE', 'PART_7_MULTI', 'FULL_READING', 'POMODORO', 'CUSTOM']).optional(),
  testName: z.string().max(300).optional(), totalQuestions: z.number().int().min(1).max(100).optional(),
  correctAnswers: z.number().int().min(0).max(100).optional(), actualSeconds: nonnegative.optional(),
  speedSecPerQuestion: nonnegative.optional(), accuracyPercent: z.number().finite().min(0).max(100).optional(),
  createdAt: timestamp, ...metadata
}).passthrough().refine(value => value.correctAnswers === undefined || (value.totalQuestions !== undefined && value.correctAnswers <= value.totalQuestions), 'số câu đúng phải có tổng câu và không vượt tổng câu');

const checklistItem = z.object({ id: z.string().min(1), checked: z.boolean(), ...metadata });
const vocabLog = z.object({ id: z.string().min(1), date, count: z.number().int().min(1).max(10000),
  sourceName: z.string().max(300).optional(),
  parts: z.array(partNumber).max(7).refine(parts => new Set(parts).size === parts.length, 'Part bị trùng').optional(), ...metadata }).passthrough();
const shieldDay = z.object({ id: z.string().min(1), date, ...metadata });
const weeklyPlan = z.object({
  id: date, weekKey: date, ...metadata,
  tasks: z.array(z.object({
    id: z.string().min(1), title: z.string().min(1),
    type: z.enum(['AUTO_FULL_TEST', 'AUTO_PART_PRACTICE', 'AUTO_STUDY_TIME', 'CUSTOM']),
    target: z.number().finite().positive(), unit: z.string().min(1), createdAt: timestamp,
    partNumber: partNumber.optional(), manualDone: nonnegative.optional(), isCompleted: z.boolean().optional(),
    notes: z.string().optional(), color: z.enum(['indigo', 'blue', 'amber', 'sky', 'rose', 'purple']).optional()
  })).max(100)
}).refine(plan => plan.id === plan.weekKey, 'ID kế hoạch phải trùng tuần')
  .refine(plan => new Set(plan.tasks.map(task => task.id)).size === plan.tasks.length, 'ID mục tiêu bị trùng');

const backupV2 = z.object({
  schemaVersion: z.literal(2), exportDate: timestamp, profile,
  sessions: z.array(session), mistakes: z.array(mistake), pacingRuns: z.array(pacingRun),
  checklist: z.array(checklistItem), vocabLog: z.array(vocabLog), shieldDays: z.array(shieldDay)
});

const backupV1 = z.object({
  profile, sessions: z.array(session), mistakes: z.array(mistake)
}).passthrough();
const backupV3 = backupV2.extend({ schemaVersion: z.literal(3), weeklyPlans: z.array(weeklyPlan) });

type LegacyContent = Pick<DataBundle, 'profile' | 'sessions' | 'mistakes'>;

export interface BackupPreview {
  version: 1 | 2 | 3;
  data: DataBundle | LegacyContent | (Omit<DataBundle, 'schemaVersion' | 'weeklyPlans'> & { schemaVersion: 2 });
  corrections: string[];
  preserved: string[];
  counts: Record<string, number>;
}

export type BackupParseResult = { ok: true; preview: BackupPreview } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fill(record: Record<string, unknown>, key: string, value: unknown, path: string, corrections: string[]) {
  if (record[key] === undefined) {
    record[key] = value;
    corrections.push(`${path}.${key}: điền giá trị mặc định`);
  }
}

/** Normalize only unknown error categories and absent optional fields. */
function normalize(raw: Record<string, unknown>, version: 1 | 2 | 3, corrections: string[]): void {
  const now = new Date().toISOString();
  const profileValue = raw.profile;
  if (isRecord(profileValue)) {
    fill(profileValue, 'name', 'Học viên', 'profile', corrections);
    fill(profileValue, 'examDate', '', 'profile', corrections);
    fill(profileValue, 'currentStreak', 0, 'profile', corrections);
    fill(profileValue, 'longestStreak', 0, 'profile', corrections);
    fill(profileValue, 'streakFreezes', 2, 'profile', corrections);
    fill(profileValue, 'shieldAllowance', profileValue.streakFreezes, 'profile', corrections);
    fill(profileValue, 'lastStudyDate', '', 'profile', corrections);
    fill(profileValue, 'dailyMinGoalMinutes', 30, 'profile', corrections);
    fill(profileValue, 'motto', '', 'profile', corrections);
    fill(profileValue, 'selectedSkill', 'LR', 'profile', corrections);
  }
  for (const key of ['profile', 'sessions', 'mistakes', 'pacingRuns', 'checklist', 'vocabLog', 'shieldDays']) {
    const records = key === 'profile' ? [profileValue] : raw[key];
    if (!Array.isArray(records)) continue;
    records.forEach((value, index) => {
      if (!isRecord(value)) return;
      const path = key === 'profile' ? key : `${key}[${index}]`;
      if (version === 1) {
        fill(value, 'updatedAt', typeof value.createdAt === 'string' ? value.createdAt : now, path, corrections);
        fill(value, 'deletedAt', null, path, corrections);
      }
      if (key === 'mistakes') {
        const normalizedTime = normalizeReviewTimestamp(value.lastReviewedAt);
        if (normalizedTime !== value.lastReviewedAt) {
          value.lastReviewedAt = normalizedTime;
          corrections.push(`${path}.lastReviewedAt: chuyển ngày cũ sang thời điểm UTC`);
        }
        Object.assign(value, normalizeMistakeRecord(value));
        fill(value, 'tags', [], path, corrections);
        if (typeof value.category === 'string' && !category.safeParse(value.category).success) {
          value.category = 'OTHER';
          corrections.push(`${path}.category: nhóm lỗi không rõ → Khác`);
        }
      }
    });
  }
}

export function parseBackup(json: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['Tệp: JSON không hợp lệ'] };
  }
  if (!isRecord(raw)) return { ok: false, errors: ['Tệp: cấu trúc gốc phải là đối tượng'] };
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > 3) {
    return { ok: false, errors: ['Tệp được tạo từ phiên bản mới hơn. Hãy cập nhật ứng dụng trước khi khôi phục.'] };
  }
  if (raw.schemaVersion !== undefined && (typeof raw.schemaVersion !== 'number' || ![1, 2, 3].includes(raw.schemaVersion))) {
    return { ok: false, errors: ['schemaVersion: phiên bản sao lưu không được hỗ trợ'] };
  }
  const version: 1 | 2 | 3 = raw.schemaVersion === 3 ? 3 : raw.schemaVersion === 2 ? 2 : 1;
  const corrections: string[] = [];
  normalize(raw, version, corrections);
  const parsed = (version === 3 ? backupV3 : version === 2 ? backupV2 : backupV1).safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 10).map(issue => `${issue.path.join('.') || 'Tệp'}: ${issue.message}`)
    };
  }
  const value = parsed.data as unknown as DataBundle | LegacyContent;
  const collections: Array<[string, Array<{ id: string }>]> = [
    ['sessions', value.sessions], ['mistakes', value.mistakes]
  ];
  if (version >= 2) {
    const complete = value as DataBundle;
    collections.push(['pacingRuns', complete.pacingRuns], ['checklist', complete.checklist], ['vocabLog', complete.vocabLog], ['shieldDays', complete.shieldDays]);
    if (version === 3) collections.push(['weeklyPlans', complete.weeklyPlans]);
  }
  const duplicateErrors: string[] = [];
  for (const [name, records] of collections) {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      if (seen.has(record.id)) duplicateErrors.push(`${name}[${index}].id: ID bị trùng trong tệp`);
      seen.add(record.id);
    });
  }
  if (duplicateErrors.length) return { ok: false, errors: duplicateErrors.slice(0, 10) };
  const counts: Record<string, number> = {
    sessions: value.sessions.filter(item => !item.deletedAt).length,
    mistakes: value.mistakes.filter(item => !item.deletedAt).length
  };
  if (version >= 2) {
    const complete = value as DataBundle;
    counts.pacingRuns = complete.pacingRuns.filter(item => !item.deletedAt).length;
    counts.checklist = complete.checklist.filter(item => !item.deletedAt).length;
    counts.vocabLog = complete.vocabLog.filter(item => !item.deletedAt).length;
    counts.shieldDays = complete.shieldDays.filter(item => !item.deletedAt).length;
    if (version === 3) counts.weeklyPlans = complete.weeklyPlans.filter(item => !item.deletedAt).length;
  }
  return {
    ok: true,
    preview: {
      version, data: value, corrections, counts,
      preserved: version === 1 ? ['Lượt Phòng Thi', 'Checklist', 'Từ vựng', 'Ngày dùng khiên', 'Kế hoạch tuần'] : version === 2 ? ['Kế hoạch tuần'] : []
    }
  };
}
