import type { MistakeEntry, OptionNote } from '@/shared/types';
import { optionLetter } from '@/features/mistakes/lib/userChoice';

export interface ParsedOption {
  letter: string;
  text: string;
  isCorrect: boolean;
  note?: OptionNote;
}

/**
 * Options for display and review, from structured data only: the stored options and
 * a correct answer that names one of them by label "(B) ..." or by exact text.
 * Options are never pulled out of free text or invented; an answer that matches no
 * option gives correctIndex = -1.
 */
export function resolveQuizOptions(mistake: Pick<MistakeEntry, 'questionContext' | 'options' | 'correctAnswer' | 'optionNotes'>): {
  questionTitle: string;
  options: ParsedOption[];
  correctIndex: number;
} {
  const label = /^\s*(?:\(([A-D])\)|([A-D])[.):])\s*/i;
  const normalize = (value?: string | null) => (value ?? '').replace(label, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const notes = new Map((mistake.optionNotes ?? []).map(note => [note.label, note]));
  const options: ParsedOption[] = (mistake.options ?? []).map((option, index) => {
    const optStr = typeof option === 'string' ? option : '';
    const match = optStr.match(label);
    const letter = (match?.[1] || match?.[2] || String.fromCharCode(65 + index)).toUpperCase();
    return {
      letter,
      text: optStr.replace(label, '').trim() || optStr,
      isCorrect: false,
      note: notes.get(letter as OptionNote['label'])
    };
  });
  const targetLetter = optionLetter(mistake.correctAnswer);
  const answerText = normalize(mistake.correctAnswer);
  let correctIndex = targetLetter ? options.findIndex(option => option.letter === targetLetter) : -1;
  if (correctIndex === -1 && answerText) correctIndex = options.findIndex(option => normalize(option.text) === answerText);
  if (correctIndex >= 0) options[correctIndex].isCorrect = true;
  return { questionTitle: (mistake.questionContext || '').trim(), options, correctIndex };
}
