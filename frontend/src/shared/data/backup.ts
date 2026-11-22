import { z } from 'zod';
import { confirmedResultTimingSchema } from '@/shared/domain/resultTiming';
import type { DataBundle } from '@/shared/data/dataBundle';
import { explanationSchema, optionNoteSchema, normalizeReviewTimestamp, normalizeMistakeRecord } from '@/shared/data/mistakeFields';
import { partOfQuestion, partScoresFromWrong } from '@/shared/domain/questionNumbers';

/** Same limits as the server (backend/app/schemas/models.py): a file that passes here also syncs. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_RECORDS = 10_000;
const MAX_RECORD_BYTES = 30_000;
const NUL = String.fromCharCode(0);
const inRange = (value: string) => value >= '1970-01-01' && value <= '2100-12-31';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'phải là ngày YYYY-MM-DD')
  .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) > 0, 'ngày không tồn tại')
  .refine(inRange, 'ngày phải trong khoảng 1970–2100');
const timestamp = z.string().min(1, 'thiếu thời điểm').max(40, 'thời điểm không hợp lệ')
  .refine(value => /T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), 'thời điểm không hợp lệ hoặc thiếu múi giờ')
  .refine(value => inRange(new Date(value).toISOString().slice(0, 10)), 'thời điểm phải trong khoảng 1970–2100');
/** Text without NUL characters (the database refuses them). */
const text = (max: number) => z.string().max(max, `tối đa ${max} ký tự`).refine(value => !value.includes(NUL), 'chứa ký tự không hợp lệ');
const recordId = text(200).min(1, 'thiếu ID');
const metadata = { updatedAt: timestamp, deletedAt: timestamp.nullable() };
const questionNumber = z.number().int().min(1).max(200);
const partNumber = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]);
const category = z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']);
const nonnegative = z.number().finite().nonnegative();
const WEEK_MINUTES = 10080;
const minutes = nonnegative.max(WEEK_MINUTES, 'quá một tuần');
const count = (max: number) => z.number().int().min(0).max(max);

// Every field the app writes is listed; anything else in a file is dropped, never restored.
const habit = z.object({ id: recordId, title: text(200), doneDates: z.array(date).max(400) });
const suggestedTask = z.object({
  id: text(300).min(1), kind: text(40), title: text(200), minutes: minutes, part: z.number().int().min(1).max(7).nullable(),
  testName: text(300), testDate: z.union([date, z.literal('')]), addedDate: date, doneDate: date.optional()
});
const profile = z.object({
  name: text(100).min(1), targetScore: z.number().int().min(10).max(990), examDate: z.union([date, z.literal('')]),
  currentStreak: count(100000), longestStreak: count(100000),
  streakFreezes: z.number().int().min(0).max(5), lastStudyDate: z.union([date, z.literal('')]),
  shieldAllowance: count(100000).optional(), goalChosen: z.boolean().optional(),
  // Sóc của bạn: an unknown coat is kept (read as Nâu cam) so a newer backup still restores.
  socCoat: text(20).optional(), socName: text(60).optional(),
  weeklyGoalDays: z.number().int().min(1).max(7).optional(), habits: z.array(habit).max(10).optional(),
  suggestOff: z.array(text(40)).max(10).optional(), socGear: z.array(text(60)).max(50).optional(),
  suggestedTasks: z.array(suggestedTask).max(40).optional(),
  dailyMinGoalMinutes: z.number().int().min(1).max(1440), motto: text(2000), selectedSkill: z.enum(['LR', 'SW']),
  ...metadata
});

const partScores = z.object({
  part1: z.number().int().min(0).max(6), part2: z.number().int().min(0).max(25),
  part3: z.number().int().min(0).max(39), part4: z.number().int().min(0).max(30),
  part5: z.number().int().min(0).max(30), part6: z.number().int().min(0).max(16),
  part7: z.number().int().min(0).max(54)
});

const practicePart = z.object({ part: partNumber, correct: z.number().int().nonnegative(), total: z.number().int().positive() })
  .refine(value => value.correct <= value.total && value.total <= [6, 25, 39, 30, 30, 16, 54][value.part - 1], 'số câu đúng/tổng câu không hợp lệ');

const partDurations = z.object({ part5: minutes.optional(), part6: minutes.optional(), part7: minutes.optional() });
const session = z.object({
  id: recordId, skillType: z.enum(['LR', 'SW']),
  sessionType: z.enum(['FULL_TEST', 'PART_PRACTICE']), testName: text(300).min(1),
  date, durationMinutes: nonnegative.max(1440), partDurations: partDurations.optional(), rawListening: z.number().int().min(0).max(100).optional(),
  rawReading: z.number().int().min(0).max(100).optional(), scaledListening: z.number().int().min(0).max(495).optional(),
  scaledReading: z.number().int().min(0).max(495).optional(), totalScore: z.number().int().min(0).max(990).optional(),
  partScores: partScores.optional(), practiceParts: z.array(practicePart).max(7).refine(parts => new Set(parts.map(part => part.part)).size === parts.length, 'Part luyện tập bị trùng').optional(),
  scoreSource: z.enum(['ESTIMATED','MANUAL_SECTIONS','MANUAL_TOTAL']).optional(),
  scoreConversionVersion: text(100).optional(),
  wrongQuestions: z.array(questionNumber).max(200).refine(list => list.every((value, index) => index === 0 || value > list[index - 1]), 'danh sách câu sai phải tăng dần, không trùng').optional(),
  resultTiming: confirmedResultTimingSchema.optional(),
  notes: text(16000).optional(), attemptNumber: z.number().int().min(1).max(10000).optional(), createdAt: timestamp,
  ...metadata
}).superRefine((value, context) => {
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
  id: recordId, sessionId: text(200).optional(), part: partNumber, questionNumber: questionNumber.optional(),
  sourceTestName: text(300).nullable().optional(),
  questionContext: text(16000), userMistake: text(4000), correctAnswer: text(2000),
  question: text(16000).optional(), context: text(16000).optional(),
  sourceImageIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(3).optional(),
  answerSource: z.enum(['PROVIDED', 'AI_PROPOSED', 'MISSING']).optional(),
  userChoice: z.enum(['A', 'B', 'C', 'D']).optional(),
  userChoiceState: z.enum(['CHOSEN', 'UNKNOWN', 'BLANK']).optional(),
  userReason: text(2000).optional(),
  answerProvidedBy: z.enum(['SOURCE', 'LEARNER']).optional(),
  answerDoubt: z.enum(['A', 'B', 'C', 'D']).optional(),
  optionNotes: z.array(optionNoteSchema).max(4).optional(),
  explanation: explanationSchema.optional(),
  trapTip: text(4000).optional(),
  options: z.array(text(2000)).max(4).optional(),
  category, tags: z.array(text(80)).max(20), status: z.enum(['NEEDS_REVIEW', 'MASTERED']),
  createdAt: timestamp, nextReviewDate: date.optional(), reviewStage: count(1000).optional(),
  reviewCount: count(1_000_000).optional(), lastReviewedAt: timestamp.optional(), ...metadata
}).superRefine((value, context) => {
  if (value.questionNumber !== undefined && partOfQuestion(value.questionNumber) !== value.part) context.addIssue({ code: 'custom', path: ['questionNumber'], message: 'số câu không thuộc Part đã chọn' });
  if (value.userChoiceState === 'CHOSEN' && !value.userChoice) context.addIssue({ code: 'custom', path: ['userChoice'], message: 'thiếu phương án đã chọn' });
  if (value.userChoiceState && value.userChoiceState !== 'CHOSEN' && value.userChoice) context.addIssue({ code: 'custom', path: ['userChoice'], message: 'Không nhớ/Bỏ trống không có phương án đã chọn' });
});

const pacingRun = z.object({
  id: recordId, presetId: text(100), presetName: text(200), date,
  plannedMinutes: minutes, actualMinutes: minutes, finishedNaturally: z.boolean(),
  phases: z.array(z.object({ name: text(200), plannedMinutes: minutes, actualMinutes: minutes,
    overrunMinutes: z.number().finite().min(-WEEK_MINUTES).max(WEEK_MINUTES) })).max(100),
  partType: z.enum(['PART_5', 'PART_6', 'PART_7', 'PART_7_SINGLE', 'PART_7_MULTI', 'FULL_READING', 'POMODORO', 'CUSTOM']).optional(),
  testName: text(300).optional(), totalQuestions: z.number().int().min(1).max(100).optional(),
  correctAnswers: z.number().int().min(0).max(100).optional(), actualSeconds: nonnegative.max(WEEK_MINUTES * 60).optional(),
  speedSecPerQuestion: nonnegative.max(WEEK_MINUTES * 60).optional(), accuracyPercent: z.number().finite().min(0).max(100).optional(),
  createdAt: timestamp, ...metadata
}).refine(value => value.correctAnswers === undefined || (value.totalQuestions !== undefined && value.correctAnswers <= value.totalQuestions), 'số câu đúng phải có tổng câu và không vượt tổng câu');

const vocabLog = z.object({ id: recordId, date, count: z.number().int().min(1).max(10000),
  sourceName: text(300).optional(),
  parts: z.array(partNumber).max(7).refine(parts => new Set(parts).size === parts.length, 'Part bị trùng').optional(), ...metadata });
const shieldDay = z.object({ id: recordId, date, ...metadata });
const list = <T extends z.ZodTypeAny>(item: T) => z.array(item).max(MAX_BACKUP_RECORDS, `tối đa ${MAX_BACKUP_RECORDS} bản ghi`);
const backupV2 = z.object({
  schemaVersion: z.literal(2), exportDate: timestamp, profile,
  sessions: list(session), mistakes: list(mistake), pacingRuns: list(pacingRun),
  vocabLog: list(vocabLog), shieldDays: list(shieldDay)
});

// v1 files only had these three; any other key is dropped (it is never restored either).
const backupV1 = z.object({
  profile, sessions: list(session), mistakes: list(mistake)
});
// v2/v3 files may still hold the retired checklist and weekly plans: z.object
// drops those keys, so they are neither validated nor restored.
const backupV3 = backupV2.extend({ schemaVersion: z.literal(3) });
const backupV4 = backupV2.extend({ schemaVersion: z.literal(4) });

/** Written by createBackupSnapshot: no checklist or weekly plans. */
export const BACKUP_VERSION = 4;
type BackupVersion = 1 | 2 | 3 | 4;
type LegacyContent = Pick<DataBundle, 'profile' | 'sessions' | 'mistakes'>;

export interface BackupPreview {
  version: BackupVersion;
  data: LegacyContent | (Omit<DataBundle, 'schemaVersion'> & { schemaVersion: 2 | 3 | 4 });
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
function normalize(raw: Record<string, unknown>, version: BackupVersion, corrections: string[]): void {
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
  for (const key of ['profile', 'sessions', 'mistakes', 'pacingRuns', 'vocabLog', 'shieldDays']) {
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

// Keys that could reach an object's prototype through later spreads or assigns.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const COLLECTION_KEYS = ['sessions', 'mistakes', 'pacingRuns', 'vocabLog', 'shieldDays'] as const;

function oversizedRecord(raw: Record<string, unknown>): string | null {
  for (const key of COLLECTION_KEYS) {
    const records = raw[key];
    if (!Array.isArray(records)) continue;
    const index = records.findIndex(record => JSON.stringify(record ?? null).length > MAX_RECORD_BYTES);
    if (index >= 0) return `${key}[${index}]: bản ghi quá lớn (tối đa khoảng 30 KB)`;
  }
  return null;
}

export function parseBackup(json: string): BackupParseResult {
  if (json.length > MAX_BACKUP_BYTES) return { ok: false, errors: ['Tệp: tệp sao lưu quá lớn (tối đa 10 MB)'] };
  let raw: unknown;
  try {
    raw = JSON.parse(json, (key, value) => (UNSAFE_KEYS.has(key) ? undefined : value));
  } catch {
    return { ok: false, errors: ['Tệp: JSON không hợp lệ'] };
  }
  if (!isRecord(raw)) return { ok: false, errors: ['Tệp: cấu trúc gốc phải là đối tượng'] };
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > BACKUP_VERSION) {
    return { ok: false, errors: ['Tệp được tạo từ phiên bản mới hơn. Hãy cập nhật ứng dụng trước khi khôi phục.'] };
  }
  if (raw.schemaVersion !== undefined && (typeof raw.schemaVersion !== 'number' || ![1, 2, 3, 4].includes(raw.schemaVersion))) {
    return { ok: false, errors: ['schemaVersion: phiên bản sao lưu không được hỗ trợ'] };
  }
  const version: BackupVersion = raw.schemaVersion === 4 ? 4 : raw.schemaVersion === 3 ? 3 : raw.schemaVersion === 2 ? 2 : 1;
  const total = COLLECTION_KEYS.reduce((sum, key) => sum + (Array.isArray(raw[key]) ? (raw[key] as unknown[]).length : 0), 0);
  if (total > MAX_BACKUP_RECORDS) {
    return { ok: false, errors: [`Tệp: có ${total} bản ghi, vượt giới hạn ${MAX_BACKUP_RECORDS} bản ghi của một tài khoản`] };
  }
  const oversized = oversizedRecord(raw);
  if (oversized) return { ok: false, errors: [oversized] };
  const corrections: string[] = [];
  normalize(raw, version, corrections);
  const parsed = (version === 4 ? backupV4 : version === 3 ? backupV3 : version === 2 ? backupV2 : backupV1).safeParse(raw);
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
    collections.push(['pacingRuns', complete.pacingRuns], ['vocabLog', complete.vocabLog], ['shieldDays', complete.shieldDays]);
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
    counts.vocabLog = complete.vocabLog.filter(item => !item.deletedAt).length;
    counts.shieldDays = complete.shieldDays.filter(item => !item.deletedAt).length;
  }
  return {
    ok: true,
    preview: {
      version, data: value, corrections, counts,
      preserved: version === 1 ? ['Lượt Phòng Thi', 'Từ vựng', 'Ngày dùng khiên'] : []
    }
  };
}
