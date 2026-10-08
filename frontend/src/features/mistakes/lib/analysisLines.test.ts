import { describe, expect, it } from 'vitest';
import { analysisLines } from './analysisLines';

describe('readable analysis without mutating saved text', () => {
  it('keeps each explicit clue and option on its own line', () => {
    expect(analysisLines('Dấu hiệu: in stock.\nB — inventory: bản kiểm kê.\n\nA — proposal: chỉ đề xuất.')).toEqual([
      'Dấu hiệu: in stock.', 'B — inventory: bản kiểm kê.', 'A — proposal: chỉ đề xuất.'
    ]);
  });
  it('separates existing sentence prose without dropping text', () => {
    const text = 'Cụm inventory of decorations chỉ bản kiểm kê. Proposal là đề xuất. Bạn chọn A nhưng không hợp ngữ cảnh.';
    const lines = analysisLines(text);
    expect(lines).toHaveLength(3);
    expect(lines.join(' ')).toBe(text);
  });
  it('keeps empty and single-sentence fields predictable', () => {
    expect(analysisLines('')).toEqual([]);
    expect(analysisLines('B — inventory: bản kiểm kê; phù hợp ngữ cảnh.')).toEqual(['B — inventory: bản kiểm kê; phù hợp ngữ cảnh.']);
  });
});
