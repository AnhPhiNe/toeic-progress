import { z } from 'zod';
import { explanationSchema, optionNoteSchema } from './mistakeFields';
import { confirmedResultTimingSchema, resultImageTimingSchema } from '@/shared/domain/resultTiming';

const text = z.string().max(16000);
const category = z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']);
const part = z.number().int().min(1).max(7);
const scoreSource = z.enum(['ESTIMATED', 'MANUAL_SECTIONS', 'MANUAL_TOTAL']);
const scores = z.object({ part1: z.number(), part2: z.number(), part3: z.number(), part4: z.number(), part5: z.number(), part6: z.number(), part7: z.number() });
const candidate = z.object({
  scores: z.object({ listening: z.number().nullable(), reading: z.number().nullable(), total: z.number().nullable() }),
  mode: z.enum(['MANUAL_SECTIONS', 'MANUAL_TOTAL']), fields: z.object({ listening: text, reading: text, total: text }), edited: z.boolean()
});
export const sessionFormDraftSchema = z.object({
  sessionType: z.enum(['FULL_TEST', 'PART_PRACTICE', 'VOCAB']), testName: text, date: z.string().max(30), durationMinutes: z.number(), vocabCount: z.number(), notes: z.string().max(512 * 1024),
  durationEdited: z.boolean().default(false),
  scoreSource, manualMode: z.enum(['MANUAL_SECTIONS', 'MANUAL_TOTAL']), manualListening: text, manualReading: text, manualTotal: text,
  includePartDetails: z.boolean(), entry: z.enum(['wrong', 'counts']), wrongQuestions: z.array(z.number().int().min(1).max(200)).max(200), partScores: scores,
  practiceRows: z.array(z.object({ part, correct: z.number(), total: z.number() })).min(1).max(7),
  sourceScorePending: z.boolean(), sourceScoreDraft: candidate.nullable(), originalUpdatedAt: z.string().optional(),
  wrongNumberDraft: z.object({ typing: z.boolean(), text: z.string().max(16000) }).default({ typing: false, text: '' }),
  partDurations: z.object({ part5: z.number().min(0).max(1440).optional(), part6: z.number().min(0).max(1440).optional(), part7: z.number().min(0).max(1440).optional() }).optional(),
  resultTiming: confirmedResultTimingSchema.nullish().default(null),
  timingCandidate: z.object({ timing: resultImageTimingSchema, fields: z.record(z.string(), z.string().max(20)), edited: z.boolean() }).nullish().default(null)
});
export type SessionFormDraft = z.infer<typeof sessionFormDraftSchema>;
export const parseSessionFormDraft = (input: unknown): SessionFormDraft | null => { const parsed = sessionFormDraftSchema.safeParse(input); return parsed.success ? parsed.data : null; };

const aiDraft = z.object({
  part: part.nullable(), category, questionContext: text, userMistake: text, question: text.nullish(), context: text.nullish(), correctAnswer: text, trapTip: text,
  options: z.array(text).max(4), tags: z.array(z.string().max(80)).max(20), missingInformation: z.array(z.string().max(1000)).max(20),
  answerSource: z.enum(['PROVIDED', 'AI_PROPOSED', 'MISSING']), userChoice: z.enum(['A', 'B', 'C', 'D', '']), userChoiceState: z.enum(['CHOSEN', 'UNKNOWN', 'BLANK']).optional(),
  userReason: text.optional(), optionNotes: z.array(optionNoteSchema).max(4), explanation: explanationSchema.nullable(), answerDoubt: z.enum(['A', 'B', 'C', 'D', '']).optional()
});
export const mistakeFormDraftSchema = z.object({
  raw: z.string().max(64 * 1024), part: part.nullable(), choice: z.enum(['A', 'B', 'C', 'D', 'UNKNOWN', 'BLANK', '']), reason: text, sourceTest: text,
  source: z.enum(['A', 'B', 'C', 'D', '']), contextMode: z.enum(['text', 'image']), contextText: text,
  imageIds: z.array(z.string().max(200)).max(3), readingText: text.nullable(), hadUnsavedImages: z.boolean(),
  corrected: z.object({ question: text, options: z.array(text).max(4) }).nullable(), draft: aiDraft.nullable(), manual: z.boolean(),
  answerProvidedBy: z.enum(['SOURCE', 'LEARNER']).optional(), category, selectedCategory: category.or(z.literal('')), tags: text,
  step: z.enum(['input', 'preview']), entryMode: z.enum(['single', 'batch']), batchNumbersText: text,
  batchItems: z.array(z.object({ id: z.string().max(200), number: z.number().int().min(101).max(200), part, draft: aiDraft, category })).max(100),
  batchSummary: z.object({ requested: z.array(z.number().int().min(101).max(200)).max(100).nullable() }).nullable(),
  entryId: z.string().max(200), draftInput: z.string().max(64 * 1024), draftImageKey: z.string().max(1000), changed: z.boolean(), originalUpdatedAt: z.string().optional()
});
export type MistakeFormDraft = z.infer<typeof mistakeFormDraftSchema>;
export const parseMistakeFormDraft = (input: unknown): MistakeFormDraft | null => { const parsed = mistakeFormDraftSchema.safeParse(input); return parsed.success ? parsed.data : null; };
