import { describe, expect, it } from 'vitest';
import { readQuestion } from './questionText';

describe('question source fields', () => {
  it('uses the entire explicit question regardless of the order or first line of legacy text', () => {
    const question = 'What problem does\nthe man mention?';
    const context = '(M-Cn) Our order is incomplete.';
    expect(readQuestion({ questionContext: 'Questions 53 through 55 refer to the following conversation.', question, context }))
      .toEqual({ question, context });
  });
  it('does not turn a transcript into a title when extraction reported a missing question', () => {
    expect(readQuestion({ question: '', context: '(W-Br) Will you have to relocate?', questionContext: '(W-Br) Will you have to relocate?' }))
      .toEqual({ question: '', context: '(W-Br) Will you have to relocate?' });
  });
  it('still reads a legacy card without changing stored content', () => {
    const legacy = { questionContext: 'Reports ____ submitted.\nThe office is closed today.' };
    expect(readQuestion(legacy)).toEqual({ question: 'Reports ____ submitted.', context: 'The office is closed today.' });
    expect(legacy.questionContext).toBe('Reports ____ submitted.\nThe office is closed today.');
  });
});
