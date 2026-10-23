import { describe, expect, it } from 'vitest';
import { skillSummary } from './skillSummary';
import type { StudySession } from '@/shared/types';

const official: StudySession = { id: 'official', skillType: 'LR', sessionType: 'FULL_TEST', date: '2026-10-22',
  testName: 'Official', durationMinutes: 120, createdAt: '2026-10-22T09:00:00Z', totalScore: 745, scaledListening: 375, scaledReading: 370 };

describe('skill summary preserves unknown counts', () => {
  it('does not invent raw counts from official scaled scores', () => {
    expect(skillSummary(official, 'listening')).toMatchObject({ scaled: 375, total: 100, correct: undefined, accuracy: undefined });
  });
  it('requires every Part of the selected skill before summing', () => {
    const partial = { ...official, partScores: { part1: 6 } as StudySession['partScores'] };
    expect(skillSummary(partial, 'listening').correct).toBeUndefined();
    const reading = { ...official, partScores: { part5: 30, part6: 16, part7: 50 } as StudySession['partScores'] };
    expect(skillSummary(reading, 'reading')).toMatchObject({ correct: 96, accuracy: 96 });
    expect(skillSummary(reading, 'listening').correct).toBeUndefined();
  });
  it('keeps an explicitly recorded zero and prefers raw counts when supplied', () => {
    expect(skillSummary({ ...official, rawListening: 0 }, 'listening')).toMatchObject({ correct: 0, accuracy: 0 });
    expect(skillSummary({ ...official, rawListening: 80 }, 'listening').correct).toBe(80);
  });
  it('uses complete Listening detail and refuses invalid or incomplete totals', () => {
    const partScores = { part1: 6, part2: 20, part3: 30, part4: 24 } as StudySession['partScores'];
    expect(skillSummary({ ...official, partScores }, 'listening')).toMatchObject({ correct: 80, total: 100, accuracy: 80 });
    expect(skillSummary({ ...official, partScores, rawListening: 0 }, 'listening').correct).toBe(0);
    expect(skillSummary({ ...official, partScores: { ...partScores, part2: 26 } as StudySession['partScores'] }, 'listening').correct).toBeUndefined();
  });
  it('uses actual partial practice denominators and leaves an unpracticed skill unknown', () => {
    const practice: StudySession = { ...official, sessionType: 'PART_PRACTICE', rawReading: undefined,
      practiceParts: [{ part: 7, correct: 4, total: 5 }] };
    expect(skillSummary(practice, 'reading')).toMatchObject({ correct: 4, total: 5, accuracy: 80 });
    expect(skillSummary(practice, 'listening')).toMatchObject({ correct: undefined, accuracy: undefined });
  });
});
