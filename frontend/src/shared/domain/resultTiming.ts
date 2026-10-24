import { z } from 'zod';
import type { ResultImageTiming } from '@/shared/types';

const seconds = z.number().int().min(0).max(86400).nullable();
export const resultImageTimingSchema = z.object({
  totalSeconds: seconds, listeningSeconds: seconds, readingSeconds: seconds,
  parts: z.object({ part1: seconds, part2: seconds, part3: seconds, part4: seconds, part5: seconds, part6: seconds, part7: seconds }).strict()
}).strict();
export const hasResultTiming = (timing: ResultImageTiming) => [timing.totalSeconds, timing.listeningSeconds, timing.readingSeconds, ...Object.values(timing.parts)].some(value => value !== null);
export const confirmedResultTimingSchema = resultImageTimingSchema.extend({ source: z.literal('IMAGE_CONFIRMED') }).refine(hasResultTiming, 'Chưa có thời gian đã xác nhận.');
export const emptyResultTiming = (): ResultImageTiming => ({ totalSeconds: null, listeningSeconds: null, readingSeconds: null,
  parts: { part1: null, part2: null, part3: null, part4: null, part5: null, part6: null, part7: null } });
export function formatElapsed(value: number): string {
  const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), seconds = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
/** Explicit m:ss or h:mm:ss, never a conversion from remaining time or section sums. */
export function parseElapsed(value: string): number | null | 'invalid' {
  if (!value.trim()) return null;
  const parts = value.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d{1,5}$/.test(part))) return 'invalid';
  const numbers = parts.map(Number);
  if (numbers.slice(1).some(number => number >= 60)) return 'invalid';
  const total = numbers.reduce((sum, number) => sum * 60 + number, 0);
  return total <= 86400 ? total : 'invalid';
}
