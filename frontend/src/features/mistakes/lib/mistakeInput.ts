import type { ErrorCategory, MistakeEntry } from '@/shared/types';

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;
/** Part 1 has spoken options and a photograph, rather than a written question stem. */
export const PART1_QUESTION = 'Part 1 · Mô tả tranh';
export type ChoiceLetter = typeof CHOICE_LETTERS[number];
export type ChoiceState = NonNullable<MistakeEntry['userChoiceState']>;
export interface MistakeInput {
  rawText?: string;
  question: string;
  options: string[];
  context: string;
  part: MistakeEntry['part'] | null;
  userChoiceState: ChoiceState;
  userChoice: ChoiceLetter | '';
  userReason: string;
  sourceAnswer: ChoiceLetter | '';
  errorCategory?: ErrorCategory;
  /** True when explaining an already-saved card (allows long multi-passage Part 6/7 contexts up to 8,000 chars). */
  savedCard?: boolean;
}

/** Copy/paste formatting is not part of the exam wording. Never interpret HTML as markup. */
function normalizePastedText(raw: string): string {
  const entities: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return raw.replace(/&(#x[\da-f]+|#\d+|nbsp|amp|quot|apos|lt|gt);/gi, (entity, name: string) => {
    if (!name.startsWith('#')) return entities[name.toLowerCase()] ?? entity;
    const value = Number.parseInt(name.slice(/^#x/i.test(name) ? 2 : 1), /^#x/i.test(name) ? 16 : 10);
    return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : entity;
  }).replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/[\u00a0\u202f]/g, ' ').replace(/\uFEFF/g, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|\n)[ \t]*#{1,6}[ \t]+/g, '$1').trim();
}

export function inferPart(text: string): MistakeEntry['part'] | null {
  const explicit = text.match(/\bPart\s*([1-7])\b/i);
  if (explicit) return Number(explicit[1]) as MistakeEntry['part'];
  const number = Number(text.match(/(?:Câu(?:\s+hỏi)?|Question|Q)\s*[#.:]?\s*(\d{1,3})\b/i)?.[1] ?? text.match(/^\s*(\d{1,3})(?:[.)]\s+|\s*\n)/)?.[1]);
  if (!number || number > 200) return null;
  return (number <= 6 ? 1 : number <= 31 ? 2 : number <= 70 ? 3 : number <= 100 ? 4 : number <= 130 ? 5 : number <= 146 ? 6 : 7);
}

export function formatOptionSlot(letter: string, text: string): string {
  const cleaned = text.trim().replace(new RegExp(`^(?:\\(${letter}\\)|${letter}[.:)\\-])\\s*`, 'i'), '').trim();
  return cleaned ? `(${letter.toUpperCase()}) ${cleaned}` : '';
}

export function parseOptionsTextToSlots(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const labeled = lines.some(line => /^(?:\([A-D]\)|[A-D][.:)\s-])/i.test(line));
  const slots = CHOICE_LETTERS.map((letter, index) => {
    const line = labeled ? lines.find(value => new RegExp(`^(?:\\(${letter}\\)|${letter}[.:)\\s-])`, 'i').test(value)) : lines[index];
    return line ? formatOptionSlot(letter, line).replace(/^\([A-D]\)\s*/, '') : '';
  });
  return { optA: slots[0], optB: slots[1], optC: slots[2], optD: slots[3] };
}

export function parsePastedQuestion(raw: string, partOverride?: MistakeEntry['part'] | null) {
  const text = normalizePastedText(raw).replace(/(^|\n)[ \t]*[•●◦▪*-][ \t]+(?=(?:\([A-D]\)|[A-D][.):])[ \t]*)/gi, '$1');
  const part = partOverride ?? inferPart(text);
  const failed = (error: string) => ({ question: text, options: [] as string[], part, error });
  if (!text) return failed('Dán câu hỏi và các phương án.');
  const numbers = [...text.matchAll(/(?:^|\n)\s*(?:Câu(?:\s+hỏi)?|Question|Q)\s*[#.:]?\s*(\d{1,3})\b/gi)].map(match => match[1]);
  numbers.push(...[...text.matchAll(/(?:^|\n)[ \t]*(\d{1,3})(?:[.)][ \t]+|[ \t]*(?=\n|$))/g)].map(match => match[1]).filter(value => Number(value) >= 101 && Number(value) <= 200));
  if (new Set(numbers).size > 1) return failed('Mỗi lần nhập một câu. Giữ lại câu cần ghi lỗi và đoạn văn liên quan.');
  let matches = [...text.matchAll(/(?:^|\n|[ \t]+)(?:\(([A-D])\)|([A-D])[.):])[ \t]*/gi)];
  if (matches.length < 2) {
    const bare = [...text.matchAll(/(?:^|\n)([A-D])[ \t]+/gi)];
    matches = bare.length >= 2 && bare.every((match, index) => match[1].toUpperCase() === CHOICE_LETTERS[index]) ? bare : [];
  }
  let question: string;
  let options: string[];
  if (matches.length >= 2) {
    const labels = matches.map(match => (match[1] || match[2]).toUpperCase());
    if (labels.length > 4 || new Set(labels).size !== labels.length) return failed('Có nhiều nhóm phương án hoặc nhãn trùng. Giữ lại một câu trong ô nhập.');
    if (labels.some((label, index) => label !== CHOICE_LETTERS[index])) return failed('Các phương án cần theo thứ tự A–D. Chỉnh trực tiếp trong ô nhập.');
    question = text.slice(0, matches[0].index).trim();
    options = matches.map((match, index) => formatOptionSlot(labels[index], text.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? text.length)));
  } else {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const count = part === 2 ? 3 : 4;
    if (lines.length < count || (lines.length === count && part !== 1) || lines.slice(-count).some(line => line.length > 500)) return failed('Chưa tách được phương án. Không có nhãn thì mỗi phương án một dòng; hoặc thêm nhãn A–D.');
    question = lines.slice(0, -count).join('\n');
    options = lines.slice(-count).map((line, index) => `(${CHOICE_LETTERS[index]}) ${line}`);
  }
  const questionLines = question.split('\n');
  // Remove only leading UI labels/question numbers, never headings or numbers
  // within the passage/transcript itself.
  while (questionLines.length) {
    const first = questionLines[0].trim();
    const label = /^(?:(?:Câu(?:\s+hỏi)?|Question|Q)(?:\s*[#.:]?\s*\d{1,3}(?:\s*Part\s+[1-7])?)?|Part\s+[1-7])\s*[:.]?$/i.test(first);
    const number = /^\d{1,3}[.)]?$/.test(first) && Number(first.replace(/[.)]$/, '')) >= 1 && Number(first.replace(/[.)]$/, '')) <= 200;
    if (first && !label && !number) break;
    questionLines.shift();
  }
  question = questionLines.join('\n').trim();
  if (part === 1 && !question && options.length === 4) question = PART1_QUESTION;
  if (!question || options.some(option => !option)) return failed('Câu hỏi hoặc phương án đang trống. Bổ sung trực tiếp trong ô nhập.');
  if (part === 2 && options.length > 3) return failed('Part 2 chỉ có ba phương án A–C.');
  return { question, options, part, error: '' };
}

export function inputText(input: MistakeInput): string {
  return JSON.stringify(input);
}

export function learnerMistake(input: Pick<MistakeInput, 'userChoiceState' | 'userChoice' | 'userReason' | 'options'>): string {
  const choice = input.userChoiceState === 'CHOSEN'
    ? input.options.find(option => option.startsWith(`(${input.userChoice})`)) || `(${input.userChoice})`
    : input.userChoiceState === 'BLANK' ? 'Bỏ trống' : 'Không nhớ';
  return input.userReason.trim() ? `${choice} - ${input.userReason}` : choice;
}
