import type { VocabLog } from '@/shared/data/dataBundle';
import { validCalendarDate as validVocabDate } from '@/shared/domain/dateRange';
export { formatRangeDate as formatVocabDate, calendarDayIndex as vocabDayIndex, dateRangePreset as vocabPreset, validCalendarDate as validVocabDate, dateRangeError as vocabRangeError } from '@/shared/domain/dateRange';
export type { DateRange as VocabRange } from '@/shared/domain/dateRange';

export interface VocabDetails { sourceName?: string; parts?: number[] }
export interface VocabDay {
  id: string;
  date: string;
  count: number;
  cumulative: number;
  sourceNames: string[];
  parts: number[];
}

export function vocabDaySignature(logs: VocabLog[], date: string): string {
  return JSON.stringify(logs.filter(log => !log.deletedAt && log.date === date)
    .map(log => [log.id, log.count, log.sourceName ?? '', log.parts ?? [], log.updatedAt])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/** Legacy duplicates stay visible as one daily total; only an explicit save retires them. */
export function groupVocabDays(logs: VocabLog[]): VocabDay[] {
  const grouped = new Map<string, VocabDay>();
  for (const log of logs) {
    if (log.deletedAt || !validVocabDate(log.date) || !Number.isFinite(log.count) || log.count <= 0) continue;
    const day = grouped.get(log.date) ?? { id: `vocab:${log.date}`, date: log.date, count: 0, cumulative: 0, sourceNames: [], parts: [] };
    day.count += log.count;
    if (log.sourceName?.trim() && !day.sourceNames.includes(log.sourceName.trim())) day.sourceNames.push(log.sourceName.trim());
    for (const part of log.parts ?? []) if (Number.isInteger(part) && part >= 1 && part <= 7 && !day.parts.includes(part)) day.parts.push(part);
    grouped.set(log.date, day);
  }
  let cumulative = 0;
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => {
    cumulative += day.count;
    return { ...day, cumulative, parts: day.parts.sort((a, b) => a - b) };
  });
}

export function summarizeVocabDays(days: VocabDay[]) {
  return {
    count: days.reduce((sum, day) => sum + day.count, 0),
    average: days.length ? Math.round(days.reduce((sum, day) => sum + day.count, 0) / days.length * 10) / 10 : null,
    record: days.reduce<VocabDay | null>((best, day) => !best || day.count > best.count ? day : best, null)
  };
}

export function vocabYAxis(days: VocabDay[]) {
  const maximum = Math.max(10, ...days.map(day => day.count));
  const power = 10 ** Math.floor(Math.log10(maximum / 4));
  const ratio = maximum / 4 / power;
  const step = Math.max(1, power * (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10));
  const ceiling = Math.ceil(maximum / step) * step;
  return { ceiling, ticks: Array.from({ length: ceiling / step + 1 }, (_, index) => index * step) };
}
