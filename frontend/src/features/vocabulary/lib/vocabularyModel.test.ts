import { describe, expect, it } from 'vitest';
import type { VocabLog } from '@/shared/data/dataBundle';
import { groupVocabDays, summarizeVocabDays, vocabDayIndex, vocabPreset, vocabRangeError, vocabYAxis } from './vocabularyModel';

const stamp = '2026-10-09T09:00:00Z';
const log = (date: string, count: number, id = date): VocabLog => ({ id, date, count, updatedAt: stamp, deletedAt: null });

describe('vocabulary ranges and totals', () => {
  it('uses inclusive calendar days across months, years and leap days', () => {
    expect(vocabPreset('2026-10-09', 14).from).toBe('2026-09-26');
    expect(vocabPreset('2026-01-03', 7).from).toBe('2025-12-28');
    expect(vocabPreset('2024-03-01', 7).from).toBe('2024-02-24');
    expect(vocabDayIndex('2024-03-01') - vocabDayIndex('2024-02-28')).toBe(2);
    expect(vocabRangeError({ from: '2026-02-31', to: '2026-10-09', preset: null }, '2026-10-09')).toBeTruthy();
    expect(vocabRangeError({ from: '2026-10-10', to: '2026-10-09', preset: null }, '2026-10-09')).toBeTruthy();
    expect(vocabRangeError({ from: '2026-10-09', to: '2026-10-09', preset: null }, '2026-10-09')).toBe('');
  });
  it('groups legacy dates, preserves optional metadata, and averages recorded days without fabricating zero days', () => {
    const days = groupVocabDays([
      { ...log('2026-10-01', 10, 'a'), sourceName: 'ETS 1', parts: [5, 7] },
      { ...log('2026-10-01', 5, 'b'), sourceName: 'Book', parts: [6, 7] },
      log('2026-10-04', 25),
      { ...log('2026-10-03', 99), deletedAt: stamp }
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ count: 15, parts: [5, 6, 7], sourceNames: ['ETS 1', 'Book'] });
    expect(summarizeVocabDays(days)).toMatchObject({ count: 40, average: 20, record: { date: '2026-10-04', count: 25 } });
    expect(summarizeVocabDays([])).toMatchObject({ average: null, record: null, count: 0 });
    expect(vocabYAxis(groupVocabDays([log('2026-10-01', 35)]))).toEqual({ ceiling: 40, ticks: [0, 10, 20, 30, 40] });
  });
});
