import type { MistakeEntry, MistakeExplanation, OptionNote } from '@/shared/types';
import { optionLetter } from '@/features/mistakes/lib/userChoice';

/** Structured AI fields together with the options and text they describe. */
export interface StructuredSource {
  options: string[];
  trapTip: string;
  optionNotes: OptionNote[];
  explanation: MistakeExplanation | null;
}

/**
 * Keep structured fields only while they still describe the card after a manual edit:
 * an option's meaning stays when that option's text is unchanged, and the explanation
 * stays when the explanation text was not edited.
 */
export function carryStructured(
  source: StructuredSource | null,
  options: string[],
  trapTip: string
): Pick<MistakeEntry, 'optionNotes' | 'explanation'> {
  if (!source) return { optionNotes: undefined, explanation: undefined };
  const before = new Map(source.options.map(option => [optionLetter(option), option.trim()]));
  const after = new Map(options.map(option => [optionLetter(option), option.trim()]));
  const optionNotes = source.optionNotes.filter(note => before.has(note.label) && before.get(note.label) === after.get(note.label));
  const explanation = source.explanation && trapTip.trim() === source.trapTip.trim() ? source.explanation : undefined;
  return { optionNotes: optionNotes.length > 0 ? optionNotes : undefined, explanation };
}
