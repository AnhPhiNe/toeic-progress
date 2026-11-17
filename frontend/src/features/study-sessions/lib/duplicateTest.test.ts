import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { duplicateDayLabel, findDuplicateFullTest } from './duplicateTest';

const s = (o: Partial<StudySession>) => ({ id: Math.random().toString(), sessionType: 'FULL_TEST', skillType: 'LR', testName: 'ETS 2024 Test 04',
  date: '2026-11-17', totalScore: 900, createdAt: '2026-11-17T08:00:00Z', ...o }) as StudySession;

describe('findDuplicateFullTest', () => {
  it('matches the same name on the same date, ignoring case and spacing', () => {
    const old = s({ id: 'old' });
    expect(findDuplicateFullTest([old], '  ets   2024 test 04 ', '2026-11-17')?.id).toBe('old');
    expect(findDuplicateFullTest([old], 'ETS 2024 TEST 04', '2026-11-17')?.id).toBe('old');
  });
  it('ignores other dates, other names, deleted rows, practice and the row being edited', () => {
    const sessions = [
      s({ id: 'other-day', date: '2026-11-16' }),
      s({ id: 'other-name', testName: 'ETS 2024 Test 05' }),
      s({ id: 'deleted', deletedAt: '2026-11-17T09:00:00Z' }),
      s({ id: 'practice', sessionType: 'PART_PRACTICE' }),
      s({ id: 'self' })
    ];
    expect(findDuplicateFullTest(sessions, 'ETS 2024 Test 04', '2026-11-17', 'self')).toBeNull();
  });
  it('returns nothing for an empty name and picks the newest of several matches', () => {
    expect(findDuplicateFullTest([s({})], '   ', '2026-11-17')).toBeNull();
    const sessions = [s({ id: 'a', createdAt: '2026-11-17T08:00:00Z' }), s({ id: 'b', createdAt: '2026-11-17T10:00:00Z' }), s({ id: 'c', createdAt: '2026-11-17T09:00:00Z' })];
    expect(findDuplicateFullTest(sessions, 'ETS 2024 Test 04', '2026-11-17')?.id).toBe('b');
  });
});

describe('duplicateDayLabel', () => {
  it('names today, yesterday or the day', () => {
    expect(duplicateDayLabel('2026-11-17', '2026-11-17')).toBe('hôm nay');
    expect(duplicateDayLabel('2026-11-16', '2026-11-17')).toBe('hôm qua');
    expect(duplicateDayLabel('2026-11-01', '2026-11-17')).toBe('ngày 1/11');
    expect(duplicateDayLabel('2026-02-28', '2026-03-01')).toBe('hôm qua');
  });
});
