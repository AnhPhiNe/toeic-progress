import { describe, expect, it } from 'vitest';
import type { StudySession, MistakeEntry } from '@/shared/types';
import { collectTestNames } from './testNames';

describe('shared source names', () => {
  it('uses names from full tests, part practice and notes without requiring a score', () => {
    const sessions = [{ id: 'full', testName: 'ETS 2024 Test 01' }, { id: 'part', testName: 'ETS 2024 Test 02' }] as StudySession[];
    const notes = [{ sourceTestName: '  ets 2024   test 01  ' }, { sourceTestName: 'ETS 2025 Test 03' }] as MistakeEntry[];
    expect(collectTestNames(sessions, notes)).toEqual(['ETS 2024 Test 01', 'ETS 2024 Test 02', 'ETS 2025 Test 03']);
  });
  it('ignores deleted records and respects an explicitly removed legacy source', () => {
    const sessions = [{ id: 'old', testName: 'Deleted test', deletedAt: '2026-10-08' }] as StudySession[];
    const notes = [{ sourceTestName: 'Deleted note source', deletedAt: '2026-10-08' },
      { sessionId: 'old' }, { sourceTestName: '', sessionId: 'old' }] as MistakeEntry[];
    expect(collectTestNames(sessions, notes)).toEqual([]);
  });
});
