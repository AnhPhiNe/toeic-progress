import React from 'react';
import type { MistakeEntry } from '@/shared/types';

export const PartBadge: React.FC<{ part: number }> = ({ part }) => (
  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${
    part <= 4 ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300' : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300'
  }`}>P{part}</span>
);

/** A card can be explained once it has a written question and its options; Part 1 needs its picture, which is not kept. */
export function canExplain(mistake: MistakeEntry): boolean {
  return !mistake.explanation && !mistake.trapTip?.trim() && mistake.part !== 1 && Boolean(mistake.question?.trim()) && (mistake.options?.length ?? 0) >= 2;
}
