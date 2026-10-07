import { describe, it, expect } from 'vitest';

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

