import { describe, expect, it } from 'vitest';
import type { StudySession, MistakeEntry } from '@/shared/types';
import { collectTestNames, suggestNextTestName } from './testNames';

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

  it('suggests the next numbered test after the latest Full Test', () => {
    const full = (id: string, testName: string, date: string, extra: Partial<StudySession> = {}): StudySession =>
      ({ id, testName, date, sessionType: 'FULL_TEST', skillType: 'LR', durationMinutes: 120, createdAt: `${date}T09:00:00Z`, ...extra });
    expect(suggestNextTestName([full('a', 'ETS 2024 Test 03', '2026-10-01'), full('b', 'ETS 2024 Test 3', '2026-09-01')])).toBe('ETS 2024 Test 04');
    expect(suggestNextTestName([full('a', 'Hacker 2 - Đề 9', '2026-10-01')])).toBe('Hacker 2 - Đề 10');
    expect(suggestNextTestName([full('a', 'ETS Test 4', '2026-09-01'), full('b', 'ETS Test 3', '2026-10-01')])).toBe('');
    expect(suggestNextTestName([full('a', 'Mock final', '2026-10-01')])).toBe('');
    expect(suggestNextTestName([full('a', 'ETS Test 3', '2026-10-01', { deletedAt: '2026-10-02T00:00:00Z' })])).toBe('');
    expect(suggestNextTestName([{ ...full('a', 'Part 5 drill 2', '2026-10-01'), sessionType: 'PART_PRACTICE' }])).toBe('');
  });
});
