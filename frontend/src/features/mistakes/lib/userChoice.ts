import type { MistakeEntry } from '@/shared/types';

export type ChoiceLetter = 'A' | 'B' | 'C' | 'D';

/**
 * Letter of an option written in the "(A) text" form that the app and the AI
 * draft always produce. Free text is never guessed: "Chọn A vì..." or "be"
 * return '' instead of a letter that might be wrong.
 */
export function optionLetter(value: string): ChoiceLetter | '' {
  return (value.match(/^\s*\(([A-D])\)/i)?.[1]?.toUpperCase() || '') as ChoiceLetter | '';
}

/**
 * The learner's choice comes from structured data: the AI draft's userChoice
 * or the A–D buttons. Records saved before that field existed only have it
 * when the manual form wrote userMistake as "(A) text - reason".
 */
export function getUserChoice(mistake: Pick<MistakeEntry, 'userChoice' | 'userMistake'>): ChoiceLetter | '' {
  return mistake.userChoice || optionLetter(mistake.userMistake);
}

/** Reason part of a userMistake the manual form wrote as "(A) text - reason". */
export function reasonAfterChoice(userMistake: string, choiceLabel: string): string {
  const value = userMistake.trim();
  if (!choiceLabel) return value;
  if (value === choiceLabel) return '';
  return value.startsWith(`${choiceLabel} - `) ? value.slice(choiceLabel.length + 3).trim() : value;
}
