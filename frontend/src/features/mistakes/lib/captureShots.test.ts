import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildShotList, classifyDoubt, firstOpenShot, nextOpenShot, numberChoices, part5Shots, readCapturePrefs, shotDone, shotMissing, shotSub, shotTitle,
  suggestListeningReason, writeCapturePrefs } from './captureShots';
import { EMPTY_FORM, type CardForm } from './detailForm';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';

const ai = (patch: Partial<AIMistakeParseResult> = {}): AIMistakeParseResult => ({
  part: 5, category: 'OTHER', questionContext: 'q', userMistake: '', question: 'The manager ___ the report.', context: '', correctAnswer: '(C) at',
  trapTip: '', options: ['(A) by', '(B) until', '(C) at', '(D) since'], tags: [], missingInformation: [], answerSource: 'PROVIDED',
  userChoice: 'B', optionNotes: [], explanation: null, ...patch
});
const form = (patch: Partial<CardForm> = {}, read: Partial<AIMistakeParseResult> = {}): CardForm => ({ ...EMPTY_FORM, choice: 'B', answer: 'C', ai: ai(read), ...patch });

describe('Part 5 shots', () => {
  it('groups wrong numbers within ten questions into one Tấm', () => {
    const shots = part5Shots([103, 107, 112, 128]);
    expect(shots).toHaveLength(2);
    expect(shots.map(shot => [shot.from, shot.to, shot.wrong])).toEqual([[103, 112, [103, 107, 112]], [128, 128, [128]]]);
    expect(shots.map(shotTitle)).toEqual(['Tấm 1 · câu 103–112', 'Tấm 2 · câu 128']);
    expect(shots.map(shotSub)).toEqual(['sai 103, 107, 112', '']);
  });
  it('starts a new Tấm once a number is ten or more past the first', () => {
    expect(part5Shots([101, 110, 111, 120, 121]).map(shot => shot.wrong)).toEqual([[101, 110], [111, 120], [121]]);
    expect(part5Shots([])).toEqual([]);
  });
});

describe('the shot list', () => {
  it('lists Part 5 Tấm, then Part 6 and Part 7 passage groups', () => {
    const items = buildShotList([4, 103, 107, 112, 128, 135, 149, 189]);
    expect(items.map(shotTitle)).toEqual(['Tấm 1 · câu 103–112', 'Tấm 2 · câu 128', 'Nhóm 135–138', 'Nhóm 149–150', 'Nhóm 186–190']);
    expect(shotSub(items[4])).toBe('câu 189 · 3 đoạn + câu hỏi');
    expect(shotSub(items[3])).toBe('câu 149');
  });
  it('ticks an item when Sóc returns all its numbers, and names what is still missing', () => {
    const [first, second] = buildShotList([103, 107, 112, 128]);
    const read = new Set([103, 107, 112]);
    const covered = (number: number) => read.has(number);
    expect(shotDone(first, covered)).toBe(true);
    expect(shotDone(second, covered)).toBe(false);
    expect(shotMissing(second, new Set([128]), covered)).toEqual([128]);
    expect(shotMissing(first, new Set([128]), covered)).toEqual([]);
    read.add(128);
    expect(shotDone(second, covered)).toBe(true);
    expect(shotMissing(second, new Set([128]), covered)).toEqual([]);
  });
  it('moves to the next open item and knows the last one', () => {
    const items = buildShotList([103, 128, 149, 189]);
    const done = new Set(['s5-128']);
    const open = (item: { key: string }) => !done.has(item.key);
    expect(nextOpenShot(items, 's5-103', open)?.key).toBe('g149');
    expect(nextOpenShot(items, 'g186', open)).toBeNull();
    done.add('s5-103');
    expect(firstOpenShot(items, open)?.key).toBe('g149');
  });
});

describe('Listening suggestion', () => {
  it('picks the most used Listening reason, else the speed', () => {
    expect(suggestListeningReason([])).toBe('LISTENING_SPEED');
    expect(suggestListeningReason([
      { part: 3, category: 'VOCABULARY_TRAP', deletedAt: null }, { part: 2, category: 'VOCABULARY_TRAP', deletedAt: null },
      { part: 4, category: 'LISTENING_SPEED', deletedAt: null }, { part: 5, category: 'CARELESS_DISTRACTION', deletedAt: null },
      { part: 5, category: 'CARELESS_DISTRACTION', deletedAt: null }, { part: 5, category: 'CARELESS_DISTRACTION', deletedAt: null }
    ])).toBe('VOCABULARY_TRAP');
  });
});

describe('doubtful rows', () => {
  it('a clean reading is confident', () => {
    expect(classifyDoubt({ form: form(), part: 5 })).toBeNull();
    expect(classifyDoubt({ form: EMPTY_FORM, part: 5 })).toBeNull();
  });
  it('a guessed number, a rejection, a differing answer or key, no answer, or no passage is doubtful', () => {
    expect(classifyDoubt({ form: form(), part: 5, inferredNumber: true })?.kind).toBe('number');
    expect(classifyDoubt({ form: form(), part: 5, rejection: 'Ảnh mờ' })).toEqual({ kind: 'rejected', detail: 'Ảnh mờ' });
    expect(classifyDoubt({ form: form({}, { answerDoubt: 'D' }), part: 5 })?.kind).toBe('answer');
    expect(classifyDoubt({ form: form(), part: 5, knownAnswer: '(A) by' })).toEqual({ kind: 'key', detail: 'A' });
    expect(classifyDoubt({ form: form(), part: 5, knownAnswer: '(C) at' })).toBeNull();
    expect(classifyDoubt({ form: form({ answer: '' }), part: 5 })?.kind).toBe('missingAnswer');
    expect(classifyDoubt({ form: form({ answer: '' }), part: 5, explaining: true })).toBeNull();
    expect(classifyDoubt({ form: form(), part: 7 })?.kind).toBe('context');
    expect(classifyDoubt({ form: form({}, { context: 'Đoạn 1 — Email' }), part: 7 })).toBeNull();
  });
  it('offers the guess with the nearest open numbers', () => {
    expect(numberChoices(128, [103, 126, 130, 112])).toEqual([126, 128, 130]);
    expect(numberChoices(128, [])).toEqual([128]);
  });
});

describe('remembered capture choices', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('keeps photo mode and the Part 7 zone per account', () => {
    expect(readCapturePrefs('u1')).toEqual({ photoMode: false, part7Zone: 'questions' });
    writeCapturePrefs('u1', { photoMode: true });
    writeCapturePrefs('u1', { part7Zone: 'passage' });
    expect(readCapturePrefs('u1')).toEqual({ photoMode: true, part7Zone: 'passage' });
    expect(readCapturePrefs('u2')).toEqual({ photoMode: false, part7Zone: 'questions' });
    expect([...values.keys()].some(key => key.startsWith('toeic_') && key.endsWith(':u1'))).toBe(true);
  });
});
