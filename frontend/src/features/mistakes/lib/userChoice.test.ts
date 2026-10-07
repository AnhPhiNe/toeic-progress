import { describe, expect, it } from 'vitest';
import { getUserChoice, letterFromChoiceText, optionLetter } from '@/features/mistakes/lib/userChoice';

describe('learner choice', () => {
  it('reads the chosen letter from narrated mistakes without matching the C of "Chọn"', () => {
    expect(letterFromChoiceText('Chọn A vì nghĩ reports số nhiều nên dùng are.')).toBe('A');
    expect(letterFromChoiceText('Tôi chọn nhầm (B) vì đọc lướt')).toBe('B');
    expect(letterFromChoiceText('(D) will be - nhầm thì')).toBe('D');
    expect(letterFromChoiceText('C. were')).toBe('C');
    expect(letterFromChoiceText('Chưa nhớ đã chọn gì')).toBe('');
    expect(letterFromChoiceText('(Không ghi nhận đáp án nhầm)')).toBe('');
  });

  it('prefers the stored choice over the narrated text', () => {
    expect(getUserChoice({ userChoice: 'B', userMistake: 'Chọn A' })).toBe('B');
    expect(getUserChoice({ userMistake: 'Chọn A' })).toBe('A');
  });

  it('reads option labels', () => {
    expect(optionLetter('(c) were')).toBe('C');
    expect(optionLetter('were')).toBe('');
  });
});
