import type { MistakeEntry } from '@/shared/types';

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type ChoiceLetter = typeof CHOICE_LETTERS[number];
export type ChoiceState = NonNullable<MistakeEntry['userChoiceState']>;
export interface MistakeInput {
  question: string;
  options: string[];
  context: string;
  part: MistakeEntry['part'] | null;
  userChoiceState: ChoiceState;
  userChoice: ChoiceLetter | '';
  userReason: string;
  sourceAnswer: ChoiceLetter | '';
}

export function inferPart(text: string): MistakeEntry['part'] | null {
  const explicit = text.match(/\bPart\s*([1-7])\b/i);
  if (explicit) return Number(explicit[1]) as MistakeEntry['part'];
  const number = Number(text.match(/(?:Câu|Question|Q)\s*[#.:]?\s*(\d{1,3})\b/i)?.[1] ?? text.match(/^\s*(\d{1,3})[.)]\s+/)?.[1]);
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
  const text = raw.trim().replace(/(^|\n)[ \t]*[•●◦▪*-][ \t]+(?=(?:\([A-D]\)|[A-D][.):])[ \t]*)/gi, '$1');
  const part = partOverride ?? inferPart(text);
  const failed = (error: string) => ({ question: text, options: [] as string[], part, error });
  if (!text) return failed('Dán câu hỏi và các phương án.');
  const numbers = [...text.matchAll(/(?:^|\n)\s*(?:Câu|Question|Q)\s*[#.:]?\s*(\d{1,3})\b/gi)].map(match => match[1]);
  numbers.push(...[...text.matchAll(/(?:^|\n)\s*(\d{1,3})[.)]\s+/g)].map(match => match[1]).filter(value => Number(value) >= 101 && Number(value) <= 200));
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
    if (labels.length > 4 || new Set(labels).size !== labels.length) return failed('Có nhiều nhóm phương án hoặc nhãn trùng. Bấm Sửa để giữ một câu.');
    if (labels.some((label, index) => label !== CHOICE_LETTERS[index])) return failed('Các phương án cần theo thứ tự A–D. Bấm Sửa để chỉnh lại.');
    question = text.slice(0, matches[0].index).trim();
    options = matches.map((match, index) => formatOptionSlot(labels[index], text.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? text.length)));
  } else {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const count = part === 2 ? 3 : 4;
    if (lines.length <= count || lines.slice(-count).some(line => line.length > 500)) return failed('Chưa tách được phương án. Không có nhãn thì mỗi phương án một dòng; hoặc bấm Sửa.');
    question = lines.slice(0, -count).join('\n');
    options = lines.slice(-count).map((line, index) => `(${CHOICE_LETTERS[index]}) ${line}`);
  }
  question = question.split('\n').filter(line => !/^\s*(?:Câu\s+\d+\s*(?:Part\s+[1-7])?|Part\s+[1-7])\s*[:.]?\s*$/i.test(line)).join('\n').trim();
  if (!question || options.some(option => !option)) return failed('Câu hỏi hoặc phương án đang trống. Bấm Sửa để bổ sung.');
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
