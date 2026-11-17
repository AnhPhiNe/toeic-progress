import { describe, expect, it } from 'vitest';
import type { ConfirmedResultTiming } from '@/shared/types';
import { parseSessionFormDraft } from '@/shared/data/studyFormDrafts';
import { timingCandidate } from '../components/ResultTimingReview';

const confirmed: ConfirmedResultTiming = { totalSeconds: 6763, listeningSeconds: null, readingSeconds: 4500, source: 'IMAGE_CONFIRMED',
  parts: { part1: null, part2: null, part3: null, part4: null, part5: 720, part6: null, part7: null } };

const draft = (candidate: unknown) => ({
  sessionType: 'FULL_TEST', testName: 'QA image elapsed', date: '2026-11-17', durationMinutes: 112.72, durationEdited: true, vocabCount: 1, notes: '',
  scoreSource: 'ESTIMATED', manualMode: 'MANUAL_SECTIONS', manualListening: '', manualReading: '', manualTotal: '', includePartDetails: true,
  entry: 'wrong', wrongQuestions: [107], partScores: { part1: 0, part2: 0, part3: 0, part4: 0, part5: 0, part6: 0, part7: 0 },
  practiceRows: [{ part: 5, correct: 0, total: 30 }], sourceScorePending: false, sourceScoreDraft: null,
  wrongNumberDraft: { typing: false, text: '' }, resultTiming: confirmed, timingCandidate: candidate
});

describe('timingCandidate from a confirmed timing', () => {
  it('drops the confirmed source so the edited candidate is a valid form draft', () => {
    const candidate = timingCandidate(confirmed);
    expect(candidate.timing).not.toHaveProperty('source');
    const edited = { ...candidate, edited: true, fields: { ...candidate.fields, part5: '13:15' } };
    const parsed = parseSessionFormDraft(draft(edited));
    expect(parsed?.timingCandidate?.fields.part5).toBe('13:15');
    expect(parsed?.timingCandidate?.timing.parts.part5).toBe(720);
  });
});
