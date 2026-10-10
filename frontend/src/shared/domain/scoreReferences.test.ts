import { describe, expect, it } from 'vitest';
import { CONCORDANCE_TIERS, getConcordanceByToeic, getToeicSectionReference, getPracticeScoreRange, convertRawToListeningScore, convertRawToReadingScore } from './etsScoring';

describe('sourced conservative mock score estimates', () => {
  it('uses the published range endpoints without inventing extra per-question precision', () => {
    expect(getPracticeScoreRange('listening', 88)).toEqual({ min: 405, max: 470 });
    expect(getPracticeScoreRange('reading', 93)).toEqual({ min: 425, max: 490 });
    expect(getPracticeScoreRange('listening', 99)).toEqual({ min: 475, max: 495 });
    expect(getPracticeScoreRange('reading', 99)).toEqual({ min: 460, max: 495 });
    expect(getPracticeScoreRange('listening', 0)).toEqual({ min: 5, max: 35 });
    expect(getPracticeScoreRange('reading', 0)).toEqual({ min: 5, max: 15 });
    for (const skill of ['listening', 'reading'] as const) {
      for (let raw = 0; raw <= 100; raw++) {
        const range = getPracticeScoreRange(skill, raw);
        expect(range.min).toBeLessThanOrEqual(range.max);
        expect(range.min % 5).toBe(0);
        expect(range.max % 5).toBe(0);
        if (raw > 0) expect(range.min).toBeGreaterThanOrEqual(getPracticeScoreRange(skill, raw - 1).min);
        if (raw > 1 && raw < 100 && raw % 5 !== 1) expect(range).toEqual(getPracticeScoreRange(skill, raw - 1));
      }
    }
    expect(getPracticeScoreRange('listening', 100)).toEqual({ min: 495, max: 495 });
    expect(getPracticeScoreRange('reading', 100)).toEqual({ min: 495, max: 495 });
    expect(convertRawToListeningScore(88)).toBe(405);
    expect(convertRawToReadingScore(93)).toBe(425);
  });
});

describe('independent score references through CEFR', () => {
  it('requires both section thresholds instead of classifying by total alone', () => {
    expect(getConcordanceByToeic(490, 455)?.cefr).toBe('C1');
    expect(getConcordanceByToeic(455, 490)?.cefr).toBe('B2');
    expect(getConcordanceByToeic(400, 385)?.cefr).toBe('B2');
    expect(getConcordanceByToeic(495, 495)?.cefr).toBe('C1');
    expect(getConcordanceByToeic(495, 5)).toBeNull();
    expect(getConcordanceByToeic(5, 5)).toBeNull();
  });
  it('uses each skills own minimum and never assigns C2 from TOEIC', () => {
    for (const tier of CONCORDANCE_TIERS.filter(tier => tier.minListening !== null)) {
      expect(getToeicSectionReference('listening', tier.minListening!)?.cefr).toBe(tier.cefr);
      expect(getToeicSectionReference('reading', tier.minReading!)?.cefr).toBe(tier.cefr);
      expect(getToeicSectionReference('listening', tier.minListening! - 5)?.cefr).not.toBe(tier.cefr);
      expect(getToeicSectionReference('reading', tier.minReading! - 5)?.cefr).not.toBe(tier.cefr);
    }
    expect(getToeicSectionReference('listening', 495)?.cefr).toBe('C1');
    expect(getToeicSectionReference('reading', 495)?.cefr).toBe('C1');
    for (const score of [0, -1, NaN, Infinity, 500, 60.5]) {
      expect(getConcordanceByToeic(score, 495)).toBeNull();
      expect(getToeicSectionReference('reading', score)).toBeNull();
    }
  });
});
