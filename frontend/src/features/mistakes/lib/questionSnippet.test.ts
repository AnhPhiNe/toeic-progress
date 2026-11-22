import { describe, expect, it } from 'vitest';
import { isNumberLabel, questionSnippet } from './questionSnippet';

describe('questionSnippet', () => {
  it('uses the first line of the question, then the context', () => {
    expect(questionSnippet({ question: '\n  Hardly ____ the contract\nsecond', questionContext: 'ctx', correctAnswer: '(C)' })).toBe('Hardly ____ the contract');
    expect(questionSnippet({ question: '  ', questionContext: 'Câu 182 (Đoạn kép): Thời điểm?', correctAnswer: '(C)' })).toBe('Câu 182 (Đoạn kép): Thời điểm?');
  });
  it('falls back to the correct answer, then a plain label', () => {
    expect(questionSnippet({ questionContext: '', correctAnswer: '(C) 18:00' })).toBe('(C) 18:00');
    expect(questionSnippet({ questionContext: '', correctAnswer: '' })).toBe('Câu sai');
  });
});

describe('questionSnippet for Part 6', () => {
  const context = 'Dear staff,\nThe lobby will close early. Visitors 131 ____ the side door until Friday. Thank you.';
  it('shows the sentence with the blank instead of a bare question number', () => {
    expect(questionSnippet({ part: 6, questionNumber: 131, question: 'Câu 131', questionContext: 'Câu 131', context, correctAnswer: '(B) should use' }))
      .toBe('Visitors 131 ____ the side door until Friday.');
  });
  it('keeps a real question and falls back when the blank is not found', () => {
    expect(questionSnippet({ part: 6, questionNumber: 131, question: 'What is the purpose of the notice?', questionContext: '', context, correctAnswer: '' })).toBe('What is the purpose of the notice?');
    expect(questionSnippet({ part: 6, questionNumber: 140, question: 'Câu 140', questionContext: '', context, correctAnswer: '' })).toBe('Câu 140');
  });
});

describe('isNumberLabel', () => {
  it('spots questions that only repeat the number and Part', () => {
    for (const text of ['Câu 18', 'Câu 18 Part 2', 'câu 18, part 2', '131.', 'Question 45']) expect(isNumberLabel(text)).toBe(true);
    for (const text of ['Where is the meeting?', 'Câu 18 hỏi về giờ họp', '']) expect(isNumberLabel(text)).toBe(false);
  });
});
