import { describe, expect, it } from 'vitest';
import { questionSnippet } from './questionSnippet';

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
