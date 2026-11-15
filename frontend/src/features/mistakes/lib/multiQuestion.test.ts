import { describe, expect, it } from 'vitest';
import { draftFromBlock, splitPastedQuestions, withLetters } from './multiQuestion';

const two = `Câu 117
The manager asked all staff to ______ the new safety rules.
(A) adhere (B) comply (C) follow (D) obey

Câu 124
Ms. Tan will ______ the client upon her arrival.
(A) meet
(B) greet
(C) join
(D) see`;

describe('splitPastedQuestions', () => {
  it('cuts a paste of several numbered questions at each heading', () => {
    const blocks = splitPastedQuestions(two);
    expect(blocks.map(block => block.number)).toEqual([117, 124]);
    expect(blocks[0].raw).toContain('(D) obey');
    expect(blocks[0].raw).not.toContain('Ms. Tan');
    expect(blocks[1].raw.startsWith('Câu 124')).toBe(true);
  });
  it('understands the other ways a test numbers its questions', () => {
    const options = '(A) a (B) b (C) c (D) d';
    const blocks = splitPastedQuestions(`Question 131: first\n${options}\nQ132. second\n${options}\n133) third\n${options}`);
    expect(blocks.map(block => block.number)).toEqual([131, 132, 133]);
  });
  it('treats one question, with or without its number, as a single question', () => {
    expect(splitPastedQuestions('Câu 117\nThe manager ___ the rules.\n(A) a (B) b (C) c (D) d')).toEqual([]);
    expect(splitPastedQuestions('The manager ___ the rules.\n(A) a (B) b (C) c (D) d')).toEqual([]);
    expect(splitPastedQuestions('')).toEqual([]);
  });
  it('ignores numbers outside the Reading range and a heading that repeats a number', () => {
    expect(splitPastedQuestions('Câu 5\nx\nCâu 117\ny\nCâu 117\nz')).toEqual([]);
    expect(splitPastedQuestions('Câu 117\nx\n(A) a (B) b\nCâu 124\ny\nCâu 117 again\nz').map(block => block.number)).toEqual([117, 124]);
  });
});

describe('draftFromBlock', () => {
  it('turns a block into a card draft with its Part from the question number and no answers yet', () => {
    const [first, second] = splitPastedQuestions(two).map(draftFromBlock);
    expect(first).toMatchObject({ number: 117, part: 5, error: '' });
    expect(first.draft?.options).toEqual(['(A) adhere', '(B) comply', '(C) follow', '(D) obey']);
    expect(first.draft?.question).toBe('The manager asked all staff to ______ the new safety rules.');
    expect(first.draft).toMatchObject({ userChoice: '', answerSource: 'MISSING', correctAnswer: '' });
    expect(second.draft?.options).toHaveLength(4);
  });
  it('explains a block it cannot read instead of guessing', () => {
    const block = draftFromBlock({ number: 118, raw: 'Câu 118\nOnly one line' });
    expect(block.draft).toBeNull();
    expect(block.error).not.toBe('');
  });
});

describe('withLetters', () => {
  it('sets the learner choice and the answer from the A-D chips', () => {
    const draft = draftFromBlock(splitPastedQuestions(two)[0]).draft!;
    expect(withLetters(draft, 'B', 'C')).toMatchObject({ userChoice: 'B', userChoiceState: 'CHOSEN', correctAnswer: '(C) follow', answerSource: 'PROVIDED' });
    expect(withLetters(draft, '', '')).toMatchObject({ userChoice: '', userChoiceState: 'UNKNOWN', correctAnswer: '', answerSource: 'MISSING' });
  });
});
