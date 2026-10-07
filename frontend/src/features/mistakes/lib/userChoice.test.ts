import { describe, expect, it } from 'vitest';
import { getUserChoice, optionLetter, reasonAfterChoice } from '@/features/mistakes/lib/userChoice';

describe('learner choice', () => {
  it('reads only the "(A) text" label format, never free text', () => {
    expect(optionLetter('(c) were')).toBe('C');
    expect(optionLetter('(D) will be - nhầm thì')).toBe('D');
    expect(optionLetter('Chọn A vì nghĩ reports số nhiều')).toBe('');
    expect(optionLetter('be')).toBe('');
    expect(optionLetter('Delayed until Friday')).toBe('');
  });

  it('prefers the stored choice and does not guess from narrated mistakes', () => {
    expect(getUserChoice({ userChoice: 'B', userMistake: '(A) are' })).toBe('B');
    expect(getUserChoice({ userMistake: '(A) are - nhầm số nhiều' })).toBe('A');
    expect(getUserChoice({ userMistake: 'Chọn A vì nghĩ reports số nhiều' })).toBe('');
  });

  it('strips only the exact prefix the manual form wrote', () => {
    expect(reasonAfterChoice('(A) are - nhầm số nhiều', '(A) are')).toBe('nhầm số nhiều');
    expect(reasonAfterChoice('(A) are', '(A) are')).toBe('');
    expect(reasonAfterChoice('Chọn A vì nghĩ reports số nhiều', '(A) are')).toBe('Chọn A vì nghĩ reports số nhiều');
  });
});
