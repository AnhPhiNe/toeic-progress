import { describe, expect, it } from 'vitest';
import type { AIMistakeParseResult, PageItem } from '@/features/mistakes/services/aiMistakeExtractor';
import { chunkQuestions, dataUrlBytes, mergeItems, questionPreview, remainingQuestions, rowStatus,
  type CaptureItem } from './captureBatch';

/** A data URL that decodes to exactly `bytes` bytes (bytes must be a multiple of 3). */
const picture = (bytes: number, id = 'x') => ({ id, dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(bytes / 3 * 4) });
const draft = (changes: Partial<AIMistakeParseResult> = {}): AIMistakeParseResult => ({
  part: 5, category: 'OTHER', questionContext: 'The manager asked staff to ___ the rules.', question: 'The manager asked staff to ___ the rules.', context: '',
  userMistake: '', correctAnswer: '(C) follow', trapTip: '', options: ['(A) adhere', '(B) comply', '(C) follow', '(D) obey'], tags: [],
  missingInformation: [], answerSource: 'PROVIDED', userChoice: 'B', userChoiceState: 'CHOSEN', userReason: '', optionNotes: [], explanation: null, ...changes });
const read = (number: number, changes: Partial<AIMistakeParseResult> = {}): PageItem => ({ number, draft: { ...draft(changes), part: 5 } as PageItem['draft'] });
let counter = 0;
const id = () => `id-${++counter}`;

describe('dataUrlBytes', () => {
  it('counts decoded bytes the way the backend does, including padding', () => {
    expect(dataUrlBytes(picture(600_000).dataUrl)).toBe(600_000);
    expect(dataUrlBytes('data:image/png;base64,QQ==')).toBe(1);
    expect(dataUrlBytes('data:image/png;base64,QUI=')).toBe(2);
    expect(dataUrlBytes('nonsense')).toBe(0);
  });
});

describe('chunkQuestions', () => {
  it('splits into groups of six, sorted and without repeats', () => {
    const numbers = [120, 101, 101, 105, 130, 111, 140, 150, 160, 170, 180, 190, 200];
    expect(chunkQuestions(numbers)).toEqual([[101, 105, 111, 120, 130, 140], [150, 160, 170, 180, 190, 200]]);
    expect(chunkQuestions([107, 108])).toEqual([[107, 108]]);
    expect(chunkQuestions([])).toEqual([]);
  });
  it('drops numbers that are not questions', () => {
    expect(chunkQuestions([0, 107, 201, 2.5])).toEqual([[107]]);
  });
});

describe('mergeItems', () => {
  it('merges readings across all Parts 1–7 sorted by question number', () => {
    const first = mergeItems([], [read(131), read(107)], 'ticket-1', id);
    const merged = mergeItems(first, [read(120), { ...read(50), number: 50 }], 'ticket-2', id);
    expect(merged.map(item => item.number)).toEqual([50, 107, 120, 131]);
    expect(merged.find(item => item.number === 50)).toMatchObject({ part: 3, ticket: 'ticket-2', checked: true });
    expect(merged.find(item => item.number === 120)).toMatchObject({ part: 5, ticket: 'ticket-2', checked: true });
    expect(merged.find(item => item.number === 131)).toMatchObject({ part: 6 });
  });
  it('de-duplicates by question number and keeps the more complete reading', () => {
    const first = mergeItems([], [read(107, { userChoice: '', correctAnswer: '', answerSource: 'MISSING' })], 'a', id);
    expect(rowStatus(first[0])).toBe('unsure');
    const second = mergeItems(first, [read(107)], 'b', id);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].draft.userChoice).toBe('B');
    expect(second[0].ticket).toBe('b');
    // An equal or poorer later reading changes nothing.
    const third = mergeItems(second, [read(107, { userChoice: '' })], 'c', id);
    expect(third[0].ticket).toBe('b');
  });
  it('keeps a row the learner unticked when a better reading arrives', () => {
    const first: CaptureItem[] = [{ ...mergeItems([], [read(107, { userChoice: '' })], 'a', id)[0], checked: false }];
    expect(mergeItems(first, [read(107)], 'b', id)[0].checked).toBe(false);
  });
  it('unticks a row nothing could be read from', () => {
    const [row] = mergeItems([], [read(141, { question: '', options: [] })], 'a', id);
    expect(row.checked).toBe(false);
    expect(rowStatus(row)).toBe('unreadable');
  });
});

describe('review helpers', () => {
  it('finds what a capture still has to look for', () => {
    const found = mergeItems([], [read(107), read(120)], null, id);
    expect(remainingQuestions([107, 108, 120, 130], found)).toEqual([108, 130]);
  });
  it('marks rows with a missing choice or answer as unsure, accepts BLANK choice & AI_PROPOSED answer, and accepts 3 options A–C for Part 2', () => {
    expect(rowStatus({ draft: draft() })).toBe('ok');
    expect(rowStatus({ draft: draft({ userChoice: '', userChoiceState: 'BLANK' }) })).toBe('ok');
    expect(rowStatus({ draft: draft({ answerSource: 'AI_PROPOSED' }) })).toBe('ok');
    expect(rowStatus({ draft: draft({ part: 2, options: ['(A) Yes.', '(B) No.', '(C) Tomorrow.'], correctAnswer: '(C) Tomorrow.' }) })).toBe('ok');
    expect(rowStatus({ draft: draft({ userChoice: '', userChoiceState: 'UNKNOWN' }) })).toBe('unsure');
    expect(rowStatus({ draft: draft({ answerSource: 'MISSING', correctAnswer: '' }) })).toBe('unsure');
    expect(rowStatus({ draft: draft({ options: ['(A) a', '(B) b'] }) })).toBe('unsure');
  });
  it('shortens the stem to one line', () => {
    expect(questionPreview(draft({ question: 'The manager asked all staff to ______ the new safety rules by Friday afternoon, as the memo said earlier today.' }), 60))
      .toBe('The manager asked all staff to ___ the new safety rules by…');
    expect(questionPreview(draft({ question: '' }))).toBe('Không đọc rõ phương án');
  });
});
