import type { LRPartScore } from '@/shared/types';

export type PartNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Question numbers of a TOEIC Listening & Reading test: each Part always covers the same range. */
export const PART_QUESTION_RANGES: Record<PartNumber, readonly [number, number]> = {
  1: [1, 6], 2: [7, 31], 3: [32, 70], 4: [71, 100], 5: [101, 130], 6: [131, 146], 7: [147, 200]
};
export const TOTAL_QUESTIONS = 200;
export const PART_NUMBERS: readonly PartNumber[] = [1, 2, 3, 4, 5, 6, 7];

export function isQuestionNumber(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= TOTAL_QUESTIONS;
}

export function partOfQuestion(question: number): PartNumber | null {
  if (!isQuestionNumber(question)) return null;
  return PART_NUMBERS.find(part => question <= PART_QUESTION_RANGES[part][1]) ?? null;
}

export function questionsOfPart(part: PartNumber): number[] {
  const [first, last] = PART_QUESTION_RANGES[part];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/** Valid question numbers, without duplicates, in ascending order. */
export function normalizeQuestionList(questions: Iterable<number>): number[] {
  return [...new Set([...questions].filter(isQuestionNumber))].sort((a, b) => a - b);
}

/**
 * Reads a typed list such as "3 15, 22 101-104". Ranges use "-" or "–".
 * Anything that is not a question number (or a valid range of them) is reported instead of guessed.
 */
export function parseQuestionList(text: string): { questions: number[]; invalid: string[] } {
  const found: number[] = [], invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(token);
    if (range) {
      const first = Number(range[1]), last = Number(range[2]);
      if (isQuestionNumber(first) && isQuestionNumber(last) && first <= last) {
        for (let question = first; question <= last; question += 1) found.push(question);
      } else invalid.push(token);
    } else if (/^\d{1,3}$/.test(token) && isQuestionNumber(Number(token))) found.push(Number(token));
    else invalid.push(token);
  }
  return { questions: normalizeQuestionList(found), invalid };
}

/** Writes a list back compactly: consecutive runs of three or more become ranges ("101-104"). */
export function formatQuestionList(questions: Iterable<number>): string {
  const sorted = normalizeQuestionList(questions), parts: string[] = [];
  for (let index = 0; index < sorted.length;) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    if (end - index >= 2) parts.push(`${sorted[index]}-${sorted[end]}`);
    else for (let item = index; item <= end; item += 1) parts.push(String(sorted[item]));
    index = end + 1;
  }
  return parts.join(' ');
}

export function wrongQuestionsByPart(wrong: Iterable<number>): Record<PartNumber, number[]> {
  const groups = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } as Record<PartNumber, number[]>;
  for (const question of normalizeQuestionList(wrong)) groups[partOfQuestion(question)!].push(question);
  return groups;
}

/** Correct answers per Part when every question outside `wrong` was answered correctly. */
export function partScoresFromWrong(wrong: Iterable<number>): LRPartScore {
  const groups = wrongQuestionsByPart(wrong);
  const correct = (part: PartNumber) => PART_QUESTION_RANGES[part][1] - PART_QUESTION_RANGES[part][0] + 1 - groups[part].length;
  return { part1: correct(1), part2: correct(2), part3: correct(3), part4: correct(4), part5: correct(5), part6: correct(6), part7: correct(7) };
}
