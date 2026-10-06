import { describe, it, expect } from 'vitest';
import { resolveQuizOptions } from '@/features/mistakes/components/TrapQuizModal';
import { MistakeEntry } from '@/shared/types';

describe('TrapQuizModal - resolveQuizOptions', () => {
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

  it('extracts options embedded directly in questionContext using regex', () => {
    const mistake: MistakeEntry = {
      id: 'test-2',
      part: 5,
      questionContext: 'Hardly ______ the contract when the client asked for changes. (A) he signed (B) he had signed (C) had he signed (D) did he signed',
      userMistake: 'Chọn B',
      correctAnswer: 'Đáp án là (C) had he signed',
      category: 'ADVANCED_GRAMMAR',
      tags: ['inversion'],
      status: 'MASTERED',
      createdAt: '2026-09-01T00:00:00Z'
    };

    const resolved = resolveQuizOptions(mistake);
    expect(resolved.options).toHaveLength(4);
    expect(resolved.correctIndex).toBe(2);
    expect(resolved.options[2].letter).toBe('C');
    expect(resolved.options[2].isCorrect).toBe(true);
    expect(resolved.questionTitle).toContain('Hardly ______ the contract');
  });

  it('falls back to 3 choices for Part 2 when no options are present', () => {
    const mistake: MistakeEntry = {
      id: 'test-3',
      part: 2,
      questionContext: 'Who is in charge of reviewing vendor proposals?',
      userMistake: 'Chờ đợi nghe tên người Mr. Smith',
      correctAnswer: 'Hasn\'t the director assigned anyone yet?',
      category: 'CARELESS_DISTRACTION',
      tags: ['part2'],
      status: 'NEEDS_REVIEW',
      createdAt: '2026-09-01T00:00:00Z'
    };

    const resolved = resolveQuizOptions(mistake);
    expect(resolved.options).toHaveLength(3);
    expect(resolved.correctIndex).toBeGreaterThanOrEqual(0);
    expect(resolved.options[resolved.correctIndex].isCorrect).toBe(true);
    expect(resolved.options[resolved.correctIndex].text).toContain('Hasn\'t the director assigned');
  });

  it('falls back to 4 choices for Ms. Watson subjunctive question when options were omitted', () => {
    const mistake: MistakeEntry = {
      id: 'test-watson',
      part: 5,
      questionContext: 'Ms. Watson requested that all expense reports ______ submitted...',
      userMistake: 'Người học chọn (D) will be do dịch nghĩa tương lai',
      correctAnswer: '(B) be',
      category: 'ADVANCED_GRAMMAR',
      tags: ['subjunctive'],
      status: 'NEEDS_REVIEW',
      createdAt: '2026-09-01T00:00:00Z'
    };

    const resolved = resolveQuizOptions(mistake);
    expect(resolved.options).toHaveLength(4);
    expect(resolved.correctIndex).toBe(1);
    expect(resolved.options[1].letter).toBe('B');
    expect(resolved.options[1].text).toBe('be');
    expect(resolved.options[3].letter).toBe('D');
    expect(resolved.options[3].text).toBe('will be');
  });
});

describe('MistakeNotebookView - Option Slots Helper', () => {
  it('parses formatted options lines into separate slot strings', async () => {
    const { parseOptionsTextToSlots } = await import('@/features/mistakes/components/MistakeNotebookView');
    const input = '(A) are\n(B) be\n(C) were\n(D) will be';
    const slots = parseOptionsTextToSlots(input);
    expect(slots.optA).toBe('are');
    expect(slots.optB).toBe('be');
    expect(slots.optC).toBe('were');
    expect(slots.optD).toBe('will be');
  });

  it('parses plain lines into slots based on line order', async () => {
    const { parseOptionsTextToSlots } = await import('@/features/mistakes/components/MistakeNotebookView');
    const input = 'are\nbe\nwere\nwill be';
    const slots = parseOptionsTextToSlots(input);
    expect(slots.optA).toBe('are');
    expect(slots.optB).toBe('be');
    expect(slots.optC).toBe('were');
    expect(slots.optD).toBe('will be');
  });

  it('formats option slot correctly whether user typed prefix or not', async () => {
    const { formatOptionSlot } = await import('@/features/mistakes/components/MistakeNotebookView');
    expect(formatOptionSlot('A', 'are')).toBe('(A) are');
    expect(formatOptionSlot('B', '(B) be')).toBe('(B) be');
    expect(formatOptionSlot('c', 'C. were')).toBe('(C) were');
    expect(formatOptionSlot('D', '')).toBe('');
  });
});

