import { z } from 'zod';
import { explanationSchema, optionNoteSchema } from '@/shared/data/mistakeFields';

/** One contract for provider responses and restored local drafts. */
export const aiDraftSchema = z.object({
  part: z.number().int().min(1).max(7).nullable(),
  category: z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER']),
  questionContext: z.string().min(1).max(4000), userMistake: z.string().max(4000),
  question: z.string().max(4000).nullish(), context: z.string().max(4000).nullish(),
  correctAnswer: z.string().max(1000), trapTip: z.string().max(4000),
  options: z.array(z.string().max(1000)).max(4), tags: z.array(z.string().max(50)).max(5),
  missingInformation: z.array(z.string().max(300)).max(8), answerSource: z.enum(['PROVIDED', 'AI_PROPOSED', 'MISSING']),
  userChoice: z.enum(['A', 'B', 'C', 'D', '']).default(''),
  userChoiceState: z.enum(['CHOSEN', 'UNKNOWN', 'BLANK']).optional(), userReason: z.string().max(2000).optional(),
  optionNotes: z.array(optionNoteSchema).max(4).default([]), explanation: explanationSchema.nullable().default(null),
  answerDoubt: z.enum(['A', 'B', 'C', 'D', '']).optional()
});
