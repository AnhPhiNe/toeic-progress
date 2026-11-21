import { describe, expect, it } from 'vitest';
import type { MistakeEntry, StudySession } from '@/shared/types';
import { captureQuestions, defaultCapturePart, looksLikePastedQuestion, questionsToFind } from './captureContext';

describe('questions one Part capture looks for', () => {
  const logged = { questions: [103, 112, 133, 186, 189, 196], logged: true };
  it('uses the logged wrong questions of the chosen Part, or of the chosen passage group', () => {
    expect(captureQuestions(logged, 5)).toEqual([103, 112]);
    expect(captureQuestions(logged, 7)).toEqual([186, 189, 196]);
    expect(captureQuestions(logged, 7, { from: 186, to: 190 })).toEqual([186, 189]);
  });
  it('picks a smart explicit default Part (first Reading Part with wrongs, else Listening, else Part 5)', () => {
    expect(defaultCapturePart(logged)).toBe(5);
    expect(defaultCapturePart({ questions: [186, 189], logged: true })).toBe(7);
    expect(defaultCapturePart({ questions: [14, 42], logged: true })).toBe(2);
    expect(defaultCapturePart({ questions: [], logged: false })).toBe(5);
  });
  it('captures freely without a wrong list (the whole Part, or the whole group)', () => {
    const free = { questions: [], logged: false };
    expect(captureQuestions(free, 5)).toHaveLength(30);
    expect(captureQuestions(free, 6)).toEqual([131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146]);
    expect(captureQuestions(free, 7, { from: 176, to: 180 })).toEqual([176, 177, 178, 179, 180]);
    // A logged test with no wrong question in that Part is captured freely too.
    expect(captureQuestions({ questions: [103], logged: true }, 6)).toHaveLength(16);
  });
  it('filters out already-recorded wrong questions and switches to free capture when a test is already completed', () => {
    const now = '2026-11-20T00:00:00.000Z';
    const session: StudySession = {
      id: 's-e10', skillType: 'LR', sessionType: 'FULL_TEST', testName: 'Đề E10', date: '2026-11-20',
      durationMinutes: 120, wrongQuestions: [133, 135], createdAt: now, updatedAt: now, deletedAt: null
    };
    const recordedCard = (qNum: number): MistakeEntry => ({
      id: `m-${qNum}`, sessionId: 's-e10', sourceTestName: 'Đề E10', part: 6, questionNumber: qNum,
      questionContext: 'Some text', question: 'Some text', userMistake: 'Bỏ trống', correctAnswer: '(A) ok',
      answerSource: 'PROVIDED', userChoiceState: 'BLANK', category: 'OTHER', tags: [], status: 'NEEDS_REVIEW',
      createdAt: now, updatedAt: now, deletedAt: null
    });
    // Only 133 recorded so far -> still looks for [135]
    expect(questionsToFind([session], 'Đề E10', [recordedCard(133)])).toEqual({
      questions: [135], logged: true, sessionId: 's-e10'
    });
    // Both 133 and 135 recorded -> switches to open capture (logged: false) while keeping sessionId
    const completedPlan = questionsToFind([session], 'Đề E10', [recordedCard(133), recordedCard(135)]);
    expect(completedPlan.logged).toBe(false);
    expect(completedPlan.sessionId).toBe('s-e10');
    expect(captureQuestions(completedPlan, 6)).toEqual([131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146]);
  });
  it('detects pasted TOEIC question text while ignoring short plain strings or URLs', () => {
    expect(looksLikePastedQuestion('101. The manager ___ the report yesterday.\n(A) submit\n(B) submitted\n(C) submitting\n(D) submission')).toBe(true);
    expect(looksLikePastedQuestion('The meeting was rescheduled.\nA. quickly\nB. recently\nC. soon')).toBe(true);
    expect(looksLikePastedQuestion('ETS 2024 Test 5')).toBe(false);
    expect(looksLikePastedQuestion('https://study4.com/tests/123')).toBe(false);
    expect(looksLikePastedQuestion('')).toBe(false);
  });
});
