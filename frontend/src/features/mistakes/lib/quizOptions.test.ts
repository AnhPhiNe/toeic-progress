import { describe, it, expect } from 'vitest';
import { resolveQuizOptions } from '@/features/mistakes/lib/quizOptions';
import { MistakeEntry } from '@/shared/types';

describe('resolveQuizOptions', () => {
  it('correctly resolves options and marks correct answer when options array is provided', () => {
    const mistake: MistakeEntry = {
      id: 'test-1',
      part: 5,
      questionContext: 'Ms. Watson requested that all expense reports ______ submitted...',
      options: ['(A) are', '(B) be', '(C) were', '(D) will be'],
      userMistake: 'Chọn A do nhầm hòa hợp chủ vị',
      correctAnswer: '(B) be',
      trapTip: 'Cấu trúc giả định Subjunctive: S + request + that + S + V-bare',
      category: 'ADVANCED_GRAMMAR',
      tags: ['subjunctive'],
      status: 'NEEDS_REVIEW',
      createdAt: '2026-09-01T00:00:00Z'
    };

    const resolved = resolveQuizOptions(mistake);
    expect(resolved.options).toHaveLength(4);
    expect(resolved.options[0].letter).toBe('A');
    expect(resolved.options[0].text).toBe('are');
    expect(resolved.options[1].letter).toBe('B');
    expect(resolved.options[1].text).toBe('be');
    expect(resolved.options[1].isCorrect).toBe(true);
    expect(resolved.correctIndex).toBe(1);
    expect(resolved.options[0].isCorrect).toBe(false);
  });

  const base: MistakeEntry = {
    id: 'test-hardly', part: 5,
    questionContext: 'Hardly ______ the contract when the client asked for changes.',
    options: ['(A) he signed', '(B) he had signed', '(C) had he signed', '(D) did he signed'],
    userMistake: '(B) he had signed', correctAnswer: '(C) had he signed',
    category: 'ADVANCED_GRAMMAR', tags: ['inversion'], status: 'NEEDS_REVIEW', createdAt: '2026-09-01T00:00:00Z'
  };

  it('matches an unlabeled correct answer by exact text, not by a contained phrase or a letter inside a word', () => {
    // "had he signed" contains "he signed" (A) and the letter "a"; neither may decide the answer.
    const resolved = resolveQuizOptions({ ...base, correctAnswer: 'had he signed' });
    expect(resolved.correctIndex).toBe(2);
    expect(resolved.options.filter(option => option.isCorrect)).toHaveLength(1);
  });

  it('reports an unmatched answer instead of guessing one', () => {
    const resolved = resolveQuizOptions({ ...base, correctAnswer: 'Đáp án là câu đảo ngữ' });
    expect(resolved.correctIndex).toBe(-1);
    expect(resolved.options.some(option => option.isCorrect)).toBe(false);
  });

  it('never invents options from free text', () => {
    const resolved = resolveQuizOptions({
      ...base, options: undefined,
      questionContext: 'Hardly ______ the contract. (A) he signed (B) he had signed (C) had he signed (D) did he signed'
    });
    expect(resolved.options).toHaveLength(0);
    expect(resolved.correctIndex).toBe(-1);
  });
});
