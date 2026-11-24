import { z } from 'zod';

const letter = z.enum(['A', 'B', 'C', 'D', '']);

/** What "Tự gõ một câu" keeps on this device while the learner types. */
export const manualDraftSchema = z.object({
  raw: z.string().max(64 * 1024),
  context: z.string().max(16 * 1024).optional().default(''),
  part: z.number().int().min(5).max(7),
  partTouched: z.boolean(),
  testName: z.string().max(300),
  choice: letter,
  answer: letter,
  reason: z.string().max(2000),
  category: z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER', '']),
  more: z.boolean()
});
export type ManualDraft = z.infer<typeof manualDraftSchema>;
export const parseManualDraft = (input: unknown): ManualDraft | null => {
  const parsed = manualDraftSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
};
