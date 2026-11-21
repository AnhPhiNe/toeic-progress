import type { MistakeEntry } from '@/shared/types';
import { draftMistakeId, isBlankDraft } from '@/features/mistakes/lib/mistakeDrafts';
import { buildBatchEntries, type BatchExtractedItem } from '@/features/mistakes/lib/batchCapture';
import { canExplainRead, explainInput } from '@/features/mistakes/lib/detailForm';
import type { MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import type { CaptureItem } from '@/features/mistakes/lib/captureBatch';
import { enqueueExplanations } from './explanationQueue';

export interface SaveCaptureOptions {
  testName: string;
  /** A logged session of this test: its blank "chưa ghi chi tiết" cards are filled in instead of duplicated. */
  sessionId?: string;
  existing: readonly MistakeEntry[];
  onAddBatch?: (entries: MistakeEntry[]) => void;
  onUpdate: (entry: MistakeEntry, original: MistakeEntry) => void;
}

/**
 * Saves the ticked rows of a review. Throws with a message when nothing could be saved; the rows then stay as they are.
 * Rows whose question already has a blank card from a logged test fill that card; the others become new cards in one commit.
 */
export function saveCaptureItems(items: readonly CaptureItem[], options: SaveCaptureOptions): { saved: number; explanationsQueued: boolean } {
  const chosen = items.filter(item => item.checked);
  if (!chosen.length) throw new Error('Chọn ít nhất một câu để lưu.');
  const blanks = new Map<string, MistakeEntry>();
  if (options.sessionId) {
    for (const item of chosen) {
      const card = options.existing.find(value => value.id === draftMistakeId(options.sessionId!, item.number) && !value.deletedAt);
      if (card && isBlankDraft(card)) blanks.set(item.id, card);
    }
  }
  const keyed: BatchExtractedItem[] = chosen.map(({ checked: _checked, ...item }) => ({ ...item, id: blanks.get(item.id)?.id ?? item.id }));
  const entries = buildBatchEntries(keyed, options.testName, options.sessionId);
  const fills = entries.filter(entry => blanks.size && [...blanks.values()].some(card => card.id === entry.id));
  const additions = entries.filter(entry => !fills.includes(entry));
  if (additions.length && !options.onAddBatch) throw new Error('Chưa hỗ trợ lưu nhiều câu trong phiên này. Bản nháp vẫn được giữ.');
  // Cards of a logged test are filled in first; the new cards are then committed together.
  for (const entry of fills) {
    const original = [...blanks.values()].find(card => card.id === entry.id)!;
    options.onUpdate({ ...entry, createdAt: original.createdAt }, original);
  }
  if (additions.length) options.onAddBatch!(additions);
  // Explanations are queued after the save: a failure here never means the cards were not saved.
  let explanationsQueued = true;
  try {
    const byTicket = new Map<string, { cardId: string; number: number; input: MistakeInput }[]>();
    for (const item of keyed) {
      if (!item.ticket || !canExplainRead(item.draft, item.part)) continue;
      if (item.draft.explanation?.quickTip?.trim() || item.draft.trapTip?.trim()) continue;
      const list = byTicket.get(item.ticket) ?? [];
      list.push({ cardId: item.id, number: item.number, input: explainInput(item.draft, item.part) });
      byTicket.set(item.ticket, list);
    }
    for (const [ticket, list] of byTicket) enqueueExplanations(ticket, list);
  } catch { explanationsQueued = false; }
  return { saved: entries.length, explanationsQueued };
}
