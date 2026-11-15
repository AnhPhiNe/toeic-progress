import { describe, expect, it } from 'vitest';
import type { AIMistakeParseResult, PageItem } from '@/features/mistakes/services/aiMistakeExtractor';
import { chunkImages, chunkQuestions, dataUrlBytes, mergeItems, planRequests, questionPreview, remainingQuestions, rowStatus,
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

describe('chunkImages', () => {
  it('puts at most three images in one request', () => {
    const images = Array.from({ length: 10 }, (_, index) => picture(300_000, String(index)));
    expect(chunkImages(images).map(chunk => chunk.length)).toEqual([3, 3, 3, 1]);
  });
  it('keeps each request within 2 MiB of image bytes', () => {
    const images = [picture(900_000, 'a'), picture(900_000, 'b'), picture(900_000, 'c'), picture(300_000, 'd')];
    const chunks = chunkImages(images);
    expect(chunks.map(chunk => chunk.map(image => image.id))).toEqual([['a', 'b'], ['c', 'd']]);
    for (const chunk of chunks) expect(chunk.reduce((sum, image) => sum + dataUrlBytes(image.dataUrl), 0)).toBeLessThanOrEqual(2 * 1024 * 1024);
  });
  it('keeps the order and sends a single oversized image alone', () => {
    const big = picture(3_000_000, 'big');
    expect(chunkImages([picture(300_000, 'a'), big, picture(300_000, 'b')]).map(chunk => chunk.map(image => image.id))).toEqual([['a'], ['big'], ['b']]);
    expect(chunkImages([])).toEqual([]);
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

describe('planRequests', () => {
  const images = (count: number) => Array.from({ length: count }, (_, index) => picture(300_000, String(index)));
  it('asks every image chunk for each group of six questions when that fits in four requests', () => {
    const { requests, unsent } = planRequests(images(3), [101, 102, 103, 104, 105, 106, 107, 108]);
    expect(requests.map(request => request.questions)).toEqual([[101, 102, 103, 104, 105, 106], [107, 108]]);
    expect(unsent).toEqual([]);
  });
  it('lets each image chunk look for all the questions when groups would need too many requests', () => {
    const { requests } = planRequests(images(10), [101, 102, 103, 104, 105, 106, 107]);
    expect(requests).toHaveLength(4);
    for (const request of requests) expect(request.questions).toHaveLength(7);
    expect(requests.map(request => request.images.length)).toEqual([3, 3, 3, 1]);
  });
  it('never plans more than four requests and reports the images it could not send', () => {
    const many = Array.from({ length: 14 }, (_, index) => picture(900_000, String(index)));
    const { requests, unsent } = planRequests(many, [107]);
    expect(requests).toHaveLength(4);
    expect(requests.flatMap(request => request.images).length + unsent.length).toBe(14);
    expect(unsent.length).toBeGreaterThan(0);
  });
  it('plans nothing without images or questions', () => {
    expect(planRequests([], [107]).requests).toEqual([]);
    expect(planRequests(images(2), []).requests).toEqual([]);
  });
});

describe('mergeItems', () => {
  it('merges readings, sorted by question number, and drops Listening numbers', () => {
    const first = mergeItems([], [read(131), read(107)], 'ticket-1', id);
    const merged = mergeItems(first, [read(120), { ...read(50), number: 50 }], 'ticket-2', id);
    expect(merged.map(item => item.number)).toEqual([107, 120, 131]);
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
  it('marks rows with a missing choice or answer as unsure', () => {
    expect(rowStatus({ draft: draft() })).toBe('ok');
    expect(rowStatus({ draft: draft({ userChoice: '' }) })).toBe('unsure');
    expect(rowStatus({ draft: draft({ answerSource: 'MISSING', correctAnswer: '' }) })).toBe('unsure');
    expect(rowStatus({ draft: draft({ options: ['(A) a', '(B) b'] }) })).toBe('unsure');
  });
  it('shortens the stem to one line', () => {
    expect(questionPreview(draft({ question: 'The manager asked all staff to ______ the new safety rules by Friday afternoon, as the memo said earlier today.' }), 60))
      .toBe('The manager asked all staff to ___ the new safety rules by…');
    expect(questionPreview(draft({ question: '' }))).toBe('Không đọc rõ phương án');
  });
});
