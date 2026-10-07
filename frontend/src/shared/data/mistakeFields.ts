import { z } from 'zod';

/** Shapes of the structured AI fields, shared by draft parsing and backup validation. */
export const optionNoteSchema = z.object({
  label: z.enum(['A', 'B', 'C', 'D']),
  pos: z.enum(['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'det', '']),
  meaning: z.string().max(120)
});

export const explanationSchema = z.object({
  quickTip: z.string().max(400),
  translation: z.string().max(600),
  questionType: z.string().max(300),
  evidence: z.string().max(800),
  paraphrase: z.string().max(400),
  analysis: z.string().max(1200),
  keyVocabulary: z.string().max(400)
});
