import type { MistakeEntry } from '@/shared/types';

export type ChoiceLetter = 'A' | 'B' | 'C' | 'D';

// "(A) are", "A. are", "A - ...": a letter that is not the first letter of a word such as "Chọn".
const LEADING_LETTER = /^\s*(?:\(([A-Da-d])\)|([A-D])(?![\p{L}\p{N}]))/u;
// "Chọn A vì...", "Tôi chọn nhầm (B)", "nghĩ là C".
const NARRATED_LETTER = /(?:[Cc]họn nhầm|[Cc]họn|[Nn]ghĩ là)\s*\(?([A-D])\)?(?![\p{L}\p{N}])/u;

/** Letter of the option the learner described choosing, or '' when the text names none. */
export function letterFromChoiceText(text: string): ChoiceLetter | '' {
  const leading = text.match(LEADING_LETTER);
  const letter = leading ? (leading[1] || leading[2]) : text.match(NARRATED_LETTER)?.[1];
  return (letter?.toUpperCase() || '') as ChoiceLetter | '';
}

/** Stored choice first; older records only describe it inside userMistake. */
export function getUserChoice(mistake: Pick<MistakeEntry, 'userChoice' | 'userMistake'>): ChoiceLetter | '' {
  return mistake.userChoice || letterFromChoiceText(mistake.userMistake);
}

export function optionLetter(option: string): ChoiceLetter | '' {
  return (option.match(/^\s*\(([A-D])\)/i)?.[1]?.toUpperCase() || '') as ChoiceLetter | '';
}
