import { describe, expect, it } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { mistakeTestName, uniqueTestNames } from './sourceTests';

describe('source tests', () => {
  const names = new Map([['session-1', 'ETS 2024 Test 03']]);
  const card = { sessionId: 'session-1' } as MistakeEntry;
  it('uses the linked session only when no explicit source is recorded', () => {
    expect(mistakeTestName(card, names)).toBe('ETS 2024 Test 03');
    expect(mistakeTestName({ ...card, sourceTestName: 'ETS 2023 Test 02' }, names)).toBe('ETS 2023 Test 02');
    expect(mistakeTestName({ ...card, sourceTestName: '' }, names)).toBe('');
    expect(mistakeTestName({ ...card, sourceTestName: null }, names)).toBe('ETS 2024 Test 03');
    expect(mistakeTestName(card, new Map())).toBe('');
  });
  it('groups equivalent names but keeps distinct tests separate and sorts test numbers naturally', () => {
    expect(uniqueTestNames([' ETS 2024   Test 10 ', 'ets 2024 Test 10', 'ETS 2024 Test 2', '', 'ETS 2023 Test 3']))
      .toEqual(['ETS 2023 Test 3', 'ETS 2024 Test 2', 'ETS 2024 Test 10']);
  });
});
