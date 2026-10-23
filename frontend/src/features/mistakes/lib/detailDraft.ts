import { z } from 'zod';
import type { MistakeEntry } from '@/shared/types';
import type { CardForm } from './detailForm';
import { aiDraftSchema } from './aiDraftSchema';

const category = z.enum(['VOCABULARY_TRAP', 'ADVANCED_GRAMMAR', 'LISTENING_SPEED', 'TIME_PRESSURE', 'CARELESS_DISTRACTION', 'OTHER', '']);
const formSchema = z.object({
  raw: z.string().max(16000), choice: z.enum(['A', 'B', 'C', 'D', 'BLANK', '']),
  answer: z.enum(['A', 'B', 'C', 'D', '']), category,
  ai: aiDraftSchema.optional(),
  touched: z.object({ raw: z.boolean().optional(), choice: z.boolean().optional(), answer: z.boolean().optional(), category: z.boolean().optional() }).optional()
});
const schema = z.object({ rows: z.array(z.object({ id: z.string().min(1).max(200), base: z.string().max(100000), form: formSchema })).max(200) });
export type DetailDraft = z.infer<typeof schema>;
export const validateDetailDraft = (value: unknown): DetailDraft | null => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
export const detailDraftScope = (cards: MistakeEntry[]) => `detail-list:${[...new Set(cards.map(card => card.sessionId ?? `card:${card.id}`))].sort().join(',')}`;

/** Keep only unsaved rows, with their original version so a newer saved card wins. */
export function buildDetailDraft(cards: MistakeEntry[], forms: Record<string, CardForm>, dirty: Set<string>): DetailDraft {
  return { rows: cards.filter(card => dirty.has(card.id) && forms[card.id]).map(card => ({ id: card.id, base: JSON.stringify(card), form: forms[card.id] })) };
}
export function restoreDetailDraft(draft: DetailDraft, cards: MistakeEntry[]): Record<string, CardForm> {
  const byId = new Map(cards.filter(card => !card.deletedAt).map(card => [card.id, card]));
  return Object.fromEntries(draft.rows.filter(row => byId.has(row.id) && JSON.stringify(byId.get(row.id)) === row.base).map(row => [row.id, row.form]));
}
