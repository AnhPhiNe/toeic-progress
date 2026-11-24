import { z } from 'zod';

const NUL = String.fromCharCode(0);
const safeStr = (max: number) => z.string().max(max).refine(value => !value.includes(NUL), 'chứa ký tự không hợp lệ');

/** Shapes of the structured AI fields, shared by draft parsing and backup validation. */
export const optionNoteSchema = z.object({
  label: z.enum(['A', 'B', 'C', 'D']),
  pos: z.enum(['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', '']),
  meaning: safeStr(120),
  /** One line on why this option is right or wrong here; older cards have none. */
  reason: safeStr(160).optional()
});

export const evidenceSchema = z.object({
  passageLabel: safeStr(80).optional(),
  text: safeStr(400),
  translation: safeStr(400).optional()
});

export const keyWordSchema = z.object({ word: safeStr(80), meaning: safeStr(120) });

export const explanationSchema = z.object({
  quickTip: safeStr(400),
  translation: safeStr(600),
  questionType: safeStr(300),
  evidence: safeStr(800),
  paraphrase: safeStr(400),
  analysis: safeStr(1200),
  keyVocabulary: safeStr(400),
  evidences: z.array(evidenceSchema).max(3).optional(),
  words: z.array(keyWordSchema).max(4).optional()
});

/** Interpret the old date-only format without inventing a historical review time. */
export function normalizeReviewTimestamp(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = `${value}T00:00:00.000Z`;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? timestamp : value;
}

export function normalizeMistakeRecord<T extends object>(record: T): T {
  const value = record as T & { deletedAt?: string | null; userChoice?: string; userChoiceState?: string; userMistake?: string; lastReviewedAt?: string };
  if (value.deletedAt) return record;
  const choice = value.userChoice || value.userMistake?.match(/^\s*\(([A-D])\)/i)?.[1]?.toUpperCase();
  return {
    ...record,
    ...(value.userChoiceState === undefined ? { userChoiceState: choice ? 'CHOSEN' : 'UNKNOWN', ...(choice ? { userChoice: choice } : {}) } : {}),
    ...(value.lastReviewedAt ? { lastReviewedAt: normalizeReviewTimestamp(value.lastReviewedAt) } : {})
  };
}
