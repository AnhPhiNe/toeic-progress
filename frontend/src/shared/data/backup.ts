import { z } from 'zod';
import type { DataBundle } from '@/shared/data/dataBundle';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'phải là ngày YYYY-MM-DD')
  .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) > 0, 'ngày không tồn tại');
const timestamp = z.string().min(1, 'thiếu thời điểm')
  .refine(value => /T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), 'thời điểm không hợp lệ hoặc thiếu múi giờ');
const metadata = { updatedAt: timestamp, deletedAt: timestamp.nullable() };
const partNumber = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]);
const category = z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']);
const nonnegative = z.number().finite().nonnegative();

const profile = z.object({
  name: z.string().min(1), targetScore: z.number().int().min(10).max(990), examDate: z.union([date, z.literal('')]),
  currentStreak: z.number().int().nonnegative(), longestStreak: z.number().int().nonnegative(),
  streakFreezes: z.number().int().min(0).max(5), lastStudyDate: z.union([date, z.literal('')]),
  shieldAllowance: z.number().int().nonnegative().optional(),
  dailyMinGoalMinutes: z.number().int().positive(), motto: z.string(), selectedSkill: z.enum(['LR', 'SW']),
  ...metadata
}).passthrough();

const partScores = z.object({
  part1: z.number().int().min(0).max(6), part2: z.number().int().min(0).max(25),
  part3: z.number().int().min(0).max(39), part4: z.number().int().min(0).max(30),
  part5: z.number().int().min(0).max(30), part6: z.number().int().min(0).max(16),
  part7: z.number().int().min(0).max(54)
});

const session = z.object({
  id: z.string().min(1), skillType: z.enum(['LR', 'SW']),
  sessionType: z.enum(['FULL_TEST', 'PART_PRACTICE']), testName: z.string().min(1),
  date, durationMinutes: nonnegative, rawListening: z.number().min(0).max(100).optional(),
  rawReading: z.number().min(0).max(100).optional(), scaledListening: z.number().min(0).max(495).optional(),
  scaledReading: z.number().min(0).max(495).optional(), totalScore: z.number().min(0).max(990).optional(),
  partScores: partScores.optional(), practiceParts: z.array(z.object({ part: partNumber, correct: nonnegative, total: nonnegative })).optional(),
  scoreSource: z.enum(['ESTIMATED','MANUAL_SECTIONS','MANUAL_TOTAL']).optional(),
  scoreConversionVersion: z.string().max(100).optional(),
  notes: z.string().optional(), attemptNumber: z.number().int().positive().optional(), createdAt: timestamp,
  ...metadata
}).passthrough().superRefine((value, context) => {
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
  id: z.string().min(1), sessionId: z.string().optional(), part: partNumber,
  questionContext: z.string(), userMistake: z.string(), correctAnswer: z.string(),
  trapTip: z.string().optional(),
  options: z.array(z.string()).optional(),
  category, tags: z.array(z.string()), status: z.enum(['NEEDS_REVIEW', 'MASTERED']),
  createdAt: timestamp, nextReviewDate: date.optional(), reviewStage: nonnegative.optional(),
  reviewCount: nonnegative.optional(), lastReviewedAt: timestamp.optional(), ...metadata
}).passthrough();

const pacingRun = z.object({
  id: z.string().min(1), presetId: z.string(), presetName: z.string(), date,
  plannedMinutes: nonnegative, actualMinutes: nonnegative, finishedNaturally: z.boolean(),
  phases: z.array(z.object({ name: z.string(), plannedMinutes: nonnegative, actualMinutes: nonnegative, overrunMinutes: z.number().finite() })),
  createdAt: timestamp, ...metadata
}).passthrough();

const checklistItem = z.object({ id: z.string().min(1), checked: z.boolean(), ...metadata });
const vocabLog = z.object({ id: z.string().min(1), date, count: z.number().int().positive(), ...metadata });
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
