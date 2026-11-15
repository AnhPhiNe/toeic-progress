import type { MistakeEntry } from '@/shared/types';
import { partOfQuestion } from '@/shared/domain/questionNumbers';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { parsePastedQuestion, type ChoiceLetter } from '@/features/mistakes/lib/mistakeInput';

export interface PastedBlock { number: number; raw: string }

// A line that starts a numbered question: "Câu 117", "Question 117:", "Q117." or just "117." (Reading numbers only).
const HEADING = /^\s*(?:(?:Câu(?:\s+hỏi)?|Question|Q)\s*[#.:]?\s*(\d{1,3})\b|(\d{3})[.)](?=\s|$))/i;

/**
 * A paste that holds several numbered questions is cut at each numbered heading.
 * One question (or none) returns an empty list: the caller then reads the text as the single question it is.
 * A heading that repeats an earlier number is not a new question and stays in its block.
 */
export function splitPastedQuestions(raw: string): PastedBlock[] {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const starts: { index: number; number: number }[] = [];
  lines.forEach((line, index) => {
    const match = HEADING.exec(line);
    const number = match ? Number(match[1] ?? match[2]) : NaN;
    if (Number.isInteger(number) && number >= 101 && number <= 200 && !starts.some(start => start.number === number)) starts.push({ index, number });
  });
  if (starts.length < 2) return [];
  return starts.map((start, position) => ({ number: start.number,
    raw: lines.slice(start.index, starts[position + 1]?.index ?? lines.length).join('\n').trim() })).filter(block => block.raw);
}

export interface ParsedBlock { number: number; part: MistakeEntry['part']; draft: AIMistakeParseResult | null; error: string }

/** What a block of pasted text means as a wrong question; the learner's choice and answer are filled in on review. */
export function draftFromBlock(block: PastedBlock): ParsedBlock {
  const part = partOfQuestion(block.number) as MistakeEntry['part'];
  const parsed = parsePastedQuestion(block.raw, part);
  if (parsed.error) return { number: block.number, part, draft: null, error: parsed.error };
  return { number: block.number, part, error: '', draft: {
    part, category: 'OTHER', questionContext: parsed.question, userMistake: '', question: parsed.question, context: '',
    correctAnswer: '', trapTip: '', options: parsed.options, tags: [], missingInformation: [], answerSource: 'MISSING', userChoice: '',
    userChoiceState: 'UNKNOWN', userReason: '', optionNotes: [], explanation: null } };
}

/** The draft after the learner chose "mình chọn" / "đáp án đúng" with the A–D chips. */
export function withLetters(draft: AIMistakeParseResult, choice: ChoiceLetter | '', answer: ChoiceLetter | ''): AIMistakeParseResult {
  const correct = answer ? draft.options.find(option => option.startsWith(`(${answer})`)) ?? '' : '';
  const picked = choice ? draft.options.find(option => option.startsWith(`(${choice})`)) ?? '' : '';
  return { ...draft, userChoice: choice, userChoiceState: choice ? 'CHOSEN' : 'UNKNOWN', correctAnswer: correct,
    answerSource: correct ? 'PROVIDED' : 'MISSING', userMistake: picked };
}
