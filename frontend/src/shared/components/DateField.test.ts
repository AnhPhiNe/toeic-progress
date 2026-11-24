import { describe, expect, it } from 'vitest';
import { formatVnDate } from './DateField';

describe('formatVnDate', () => {
  it('formats ISO YYYY-MM-DD into Vietnamese dd/mm/yyyy', () => {
    expect(formatVnDate('2026-11-24')).toBe('24/11/2026');
    expect(formatVnDate('2026-01-05')).toBe('05/01/2026');
  });

  it('trims surrounding spaces and passes through empty or non-ISO strings', () => {
    expect(formatVnDate(' 2026-12-31 ')).toBe('31/12/2026');
    expect(formatVnDate('')).toBe('');
    expect(formatVnDate('24/11/2026')).toBe('24/11/2026');
  });
});
