import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { calculateFromPartScores, convertRawToListeningScore, convertRawToReadingScore, SCORE_CONVERSION_VERSION } from '@/shared/domain/etsScoring';
import { resolveFullTestScore, scoreSourceForEditing } from '@/features/study-sessions/lib/fullTestScore';

const parts = { part1: 5, part2: 20, part3: 35, part4: 27, part5: 25, part6: 12, part7: 33 };
const session: StudySession = { id: 's1', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'ETS', date: '2026-10-06', durationMinutes: 120, createdAt: '2026-10-06T00:00:00Z' };

describe('full test score sources', () => {
  it('adds actual Part counts and marks the legacy curve as a reference estimate', () => {
    expect(resolveFullTestScore({ source: 'ESTIMATED', partScores: parts })).toMatchObject({ rawListening: 87, rawReading: 70, totalScore: 855, scoreSource: 'ESTIMATED', scoreConversionVersion: SCORE_CONVERSION_VERSION });
    expect(() => resolveFullTestScore({ source: 'ESTIMATED' })).toThrow();
  });

  it('uses entered section scores while preserving raw counts for analysis', () => {
    const result = resolveFullTestScore({ source: 'MANUAL_SECTIONS', listening: 445, reading: 350, partScores: parts });
    expect(result).toEqual({ scoreSource: 'MANUAL_SECTIONS', scaledListening: 445, scaledReading: 350, totalScore: 795, rawListening: 87, rawReading: 70, partScores: parts });
  });

  it('stores a total without guessing section scores or inventing zero Part counts', () => {
    expect(resolveFullTestScore({ source: 'MANUAL_TOTAL', total: 800 })).toEqual({ totalScore: 800, scoreSource: 'MANUAL_TOTAL' });
    expect(resolveFullTestScore({ source: 'MANUAL_TOTAL', total: 800, partScores: parts })).toEqual({ totalScore: 800, scoreSource: 'MANUAL_TOTAL', partScores: parts, rawListening: 87, rawReading: 70 });
    expect(resolveFullTestScore({ source: 'MANUAL_SECTIONS', listening: 5, reading: 495 })).toEqual({ scoreSource: 'MANUAL_SECTIONS', scaledListening: 5, scaledReading: 495, totalScore: 500 });
  });

  it.each([undefined, 0, 500, 444, 445.5, NaN, Infinity])('rejects invalid entered section score %s', value => {
    expect(() => resolveFullTestScore({ source: 'MANUAL_SECTIONS', listening: value, reading: 350 })).toThrow();
    expect(() => resolveFullTestScore({ source: 'MANUAL_SECTIONS', listening: 350, reading: value })).toThrow();
  });

  it.each([undefined, 5, 995, 801, 800.5, NaN, Infinity])('rejects invalid entered total %s', total => {
    expect(() => resolveFullTestScore({ source: 'MANUAL_TOTAL', total })).toThrow();
  });

  it('keeps imported scores when opening an old record for editing', () => {
    expect(scoreSourceForEditing({ ...session, partScores: parts, scaledListening: 445, scaledReading: 350, totalScore: 795 })).toBe('MANUAL_SECTIONS');
    expect(scoreSourceForEditing({ ...session, totalScore: 800 })).toBe('MANUAL_TOTAL');
    expect(scoreSourceForEditing({ ...session, partScores: parts, ...calculateFromPartScores(parts) })).toBe('ESTIMATED');
    expect(scoreSourceForEditing({ ...session, scoreSource: 'MANUAL_SECTIONS', partScores: parts, ...calculateFromPartScores(parts) })).toBe('MANUAL_SECTIONS');
  });
});

describe('reference curve input limits', () => {
  it('covers all integer raw scores with bounded, monotonic five point values', () => {
    for (const convert of [convertRawToListeningScore, convertRawToReadingScore]) {
      const values = Array.from({ length: 101 }, (_, raw) => convert(raw));
      expect(values[0]).toBe(5);
      expect(values[100]).toBe(495);
      expect(values.every((value, index) => value >= 5 && value <= 495 && value % 5 === 0 && (index === 0 || value >= values[index - 1]))).toBe(true);
    }
  });

  it.each([-1, 101, 87.5, NaN, Infinity])('rejects invalid raw count %s', raw => {
    expect(() => convertRawToListeningScore(raw)).toThrow();
    expect(() => convertRawToReadingScore(raw)).toThrow();
  });

  it('rejects a Part count exceeding the actual question count', () => {
    expect(() => calculateFromPartScores({ ...parts, part1: 7 })).toThrow();
    expect(() => calculateFromPartScores({ ...parts, part7: 33.5 })).toThrow();
  });
});
