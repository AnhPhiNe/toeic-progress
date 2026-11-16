import type { MistakeEntry } from '@/shared/types';

/** The pink card on top of the phone notebook: how many are due, which Part has most, and a rough time. */
export function dueSummary(due: readonly Pick<MistakeEntry, 'part'>[]): { count: number; topPart: number | null; minutes: number } {
  const counts = new Map<number, number>();
  for (const card of due) counts.set(card.part, (counts.get(card.part) ?? 0) + 1);
  let topPart: number | null = null, best = 0;
  for (const [part, count] of [...counts].sort((a, b) => a[0] - b[0])) if (count > best) { best = count; topPart = part; }
  return { count: due.length, topPart, minutes: due.length ? Math.max(1, Math.round(due.length * 0.8)) : 0 };
}
