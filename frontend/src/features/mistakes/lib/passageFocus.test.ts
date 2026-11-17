import { describe, expect, it } from 'vitest';
import { findFocus, groupLabel, groupNumbers, splitFocus } from './passageFocus';

const email = 'Dear Ms. Patel,\nThank you for choosing us. All rooms 135 ____ with a view of the lake. Breakfast is served daily.';

describe('findFocus', () => {
  it('Part 6: marks the whole sentence that holds the blank', () => {
    const parts = splitFocus(email, findFocus(email, { part: 6, number: 135 }));
    expect(parts.focus).toBe('All rooms 135 ____ with a view of the lake.');
    expect(parts.before.endsWith('us. ')).toBe(true);
  });

  it('Part 7: marks the quoted evidence, ignoring ellipses and quotes', () => {
    const text = 'The cafeteria is closed. Employees may use the temporary food court set up in the lobby of Building B, which opens at 7.';
    const parts = splitFocus(text, findFocus(text, { part: 7, evidence: '“…food court set up in the lobby of Building B”' }));
    expect(parts.focus).toBe('food court set up in the lobby of Building B');
  });

  it('marks nothing when nothing can be found', () => {
    expect(findFocus(email, { part: 7, evidence: 'not in the text at all' })).toBeNull();
    expect(findFocus(email, { part: 6, number: 140 })).toBeNull();
    expect(findFocus('', { part: 6, number: 135 })).toBeNull();
    expect(splitFocus('abc', null)).toEqual({ before: 'abc', focus: '', after: '' });
  });
});

describe('groupNumbers', () => {
  const card = (id: string, questionNumber: number, context: string) => ({ id, questionNumber, context });
  it('collects the cards that share the reading text', () => {
    const all = [card('a', 171, 'Same  text'), card('b', 173, 'same text'), card('c', 180, 'other'), { ...card('d', 172, 'same text'), deletedAt: 'x' }];
    expect(groupNumbers(all[0], all)).toEqual([171, 173]);
    expect(groupNumbers(all[2], all)).toEqual([180]);
  });
  it('labels runs and lists', () => {
    expect(groupLabel([171, 172, 173, 174])).toBe('171–174');
    expect(groupLabel([171, 173])).toBe('171, 173');
    expect(groupLabel([171])).toBe('171');
    expect(groupLabel([])).toBe('');
  });
});
