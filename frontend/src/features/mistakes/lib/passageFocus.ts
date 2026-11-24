import type { MistakeEntry } from '@/shared/types';

export interface FocusRange { start: number; end: number }

const SENTENCE_END = /[.!?\n]/;

/** Grows a range to the whole sentence around it (up to the next full stop, question mark or line break). */
function sentenceAround(text: string, start: number, end: number): FocusRange {
  let s = start;
  while (s > 0 && !SENTENCE_END.test(text[s - 1])) s -= 1;
  let e = end;
  while (e < text.length && !SENTENCE_END.test(text[e])) e += 1;
  if (e < text.length && text[e] !== '\n') e += 1;
  while (s < e && /\s/.test(text[s])) s += 1;
  return { start: s, end: e };
}

/** Where the blank of question `number` sits in a Part 6 text: "135 ____", "(135) ____", "[135]" or a bare run of underscores. */
function blankRange(text: string, number?: number): FocusRange | null {
  if (number !== undefined) {
    const n = String(number);
    const patterns = [new RegExp(`[\\[(]\\s*${n}\\s*[\\])]`), new RegExp(`\\b${n}\\b\\s*[_＿…-]{2,}`), new RegExp(`[_＿]{2,}\\s*\\(?\\b${n}\\b`)];
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) return { start: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

/** The longest piece of a quoted evidence line that appears in the text; "…" and quote marks around it are ignored. */
function evidenceRange(text: string, evidence: string): FocusRange | null {
  const lower = text.toLowerCase();
  const pieces = evidence.split(/…|\.\.\./).map(piece => piece.trim().replace(/^["“”']+|["“”']+$/g, '').trim()).filter(piece => piece.length >= 6)
    .sort((a, b) => b.length - a.length);
  for (const piece of pieces) {
    const index = lower.indexOf(piece.toLowerCase());
    if (index >= 0) return { start: index, end: index + piece.length };
  }
  return null;
}

/**
 * The part of a reading text to highlight for one question: the sentence with its blank (Part 6), otherwise the evidence
 * Sóc quoted. Null when neither can be found, so nothing is marked rather than a guess.
 */
export function findFocus(text: string, options: { part: number; number?: number; evidence?: string }): FocusRange | null {
  if (!text.trim()) return null;
  if (options.part === 6) {
    const blank = blankRange(text, options.number);
    if (blank) return sentenceAround(text, blank.start, blank.end);
  }
  const quoted = options.evidence ? evidenceRange(text, options.evidence) : null;
  return quoted;
}

/**
 * The focus while reviewing. Before the answer only the question's own place (a Part 6 blank, found by its number)
 * may be marked: the evidence sentence would give the answer away, so it is used only once the learner has answered.
 */
export function reviewFocus(text: string, card: Pick<MistakeEntry, 'part' | 'questionNumber' | 'explanation'>, revealed: boolean): FocusRange | null {
  const evidence = revealed ? card.explanation?.evidences?.[0]?.text || card.explanation?.evidence : undefined;
  return findFocus(text, { part: card.part, number: card.questionNumber, evidence });
}

/** The text cut into what comes before, inside and after the focus. */
export function splitFocus(text: string, range: FocusRange | null): { before: string; focus: string; after: string } {
  if (!range) return { before: text, focus: '', after: '' };
  return { before: text.slice(0, range.start), focus: text.slice(range.start, range.end), after: text.slice(range.end) };
}

const squash = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

/** Question numbers of the cards that share this card's reading text, itself included, in order. */
export function groupNumbers(card: Pick<MistakeEntry, 'id' | 'context' | 'questionNumber'>, all: readonly Pick<MistakeEntry, 'id' | 'context' | 'questionNumber' | 'deletedAt'>[]): number[] {
  const own = card.questionNumber;
  const key = squash(card.context ?? '');
  const numbers = new Set<number>();
  if (own !== undefined) numbers.add(own);
  if (key) for (const other of all) if (!other.deletedAt && other.questionNumber !== undefined && squash(other.context ?? '') === key) numbers.add(other.questionNumber);
  return [...numbers].sort((a, b) => a - b);
}

/** "171–174" for a run of consecutive numbers, otherwise the numbers joined; '' for none. */
export function groupLabel(numbers: readonly number[]): string {
  if (!numbers.length) return '';
  const consecutive = numbers.every((value, index) => index === 0 || value === numbers[index - 1] + 1);
  return numbers.length > 1 && consecutive ? `${numbers[0]}–${numbers[numbers.length - 1]}` : numbers.join(', ');
}
