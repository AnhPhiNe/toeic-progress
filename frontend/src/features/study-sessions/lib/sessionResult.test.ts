import { describe, expect, it } from 'vitest';
import { summarizeSessionResult } from './sessionResult';
import type { MistakeEntry, StudySession } from '@/shared/types';

const test = (id: string, date: string, totalScore: number, patch: Partial<StudySession> = {}): StudySession => ({
  id, testName: `ETS ${id}`, skillType: 'LR', sessionType: 'FULL_TEST', date, createdAt: `${date}T08:00:00Z`, durationMinutes: 120, totalScore, ...patch
});
const card = (id: string, sessionId: string, question: number, patch: Partial<MistakeEntry> = {}): MistakeEntry => ({
  id, sessionId, questionNumber: question, part: 5, category: 'VOCABULARY_TRAP', status: 'NEEDS_REVIEW', questionContext: '', question: 'Stem',
  correctAnswer: '(A) by', answerSource: 'PROVIDED', userMistake: '', tags: [], createdAt: '2026-10-01T00:00:00Z', ...patch
});

describe('summarizeSessionResult', () => {
  it('celebrates a first test without inventing a comparison', () => {
    const now = test('a', '2026-10-01', 600, { wrongQuestions: [] });
    const result = summarizeSessionResult(now, [now], [], 850);
    expect(result.delta).toBeNull();
    expect(result.headline).toBe('Đã lưu bài đầu tiên!');
    expect(result.mood).toBe('happy');
    expect(result.step).toBe('done');
    expect(result.goal).toEqual({ target: 850, remaining: 250, fillPercent: 600 / 850 * 100 });
  });

  it('compares with the previous scored Full Test and marks a new best', () => {
    const rows = [test('a', '2026-10-01', 650), test('b', '2026-10-05', 710), test('p', '2026-10-06', 0, { sessionType: 'PART_PRACTICE' })];
    const now = test('c', '2026-10-09', 745, { wrongQuestions: [150, 151, 160, 101] });
    const result = summarizeSessionResult(now, [...rows, now], [], 850);
    expect(result.delta).toBe(35);
    expect(result.headline).toBe('Tăng 35 điểm!');
    expect(result.subline).toBe('Điểm cao nhất của bạn từ trước tới giờ.');
    expect(result.goal?.gainFromPercent).toBeCloseTo(710 / 850 * 100);
  });

  it('stays honest when the score drops and only claims a trend the data shows', () => {
    const rows = [test('a', '2026-09-01', 600), test('b', '2026-09-05', 610), test('c', '2026-09-09', 620), test('d', '2026-09-12', 700), test('e', '2026-09-15', 710)];
    const down = test('f', '2026-09-20', 690);
    const result = summarizeSessionResult(down, [...rows, down], [], 850);
    expect(result.headline).toBe('Giảm 20 điểm lần này');
    expect(result.mood).toBe('calm');
    expect(result.subline).toBe('Không sao. Trung bình 3 bài gần nhất của bạn vẫn tăng 90 điểm.');
    const flat = summarizeSessionResult(test('g', '2026-09-03', 590), [rows[0], rows[1]], []);
    expect(flat.subline).toBe('Không sao, một bài chưa nói lên tất cả.');
  });

  it('asks to mark wrong questions when only a score was entered, but still reads per-Part counts', () => {
    const now = test('a', '2026-10-01', 700, { partScores: { part1: 6, part2: 25, part3: 34, part4: 30, part5: 24, part6: 16, part7: 42 } });
    const result = summarizeSessionResult(now, [now], []);
    expect(result.step).toBe('mark');
    expect(result.partLosses).toEqual([{ part: 7, wrong: 12, total: 54 }, { part: 5, wrong: 6, total: 30 }, { part: 3, wrong: 5, total: 39 }]);
  });

  it('offers detail for blank Reading drafts and review once cards are ready', () => {
    const now = test('s', '2026-10-01', 700, { wrongQuestions: [20, 101, 102, 150] });
    const blank = card('d1', 's', 101, { question: '', correctAnswer: '', answerSource: 'MISSING' });
    const detail = summarizeSessionResult(now, [now], [blank]);
    expect(detail.step).toBe('detail');
    expect(detail.detailCount).toBe(3);
    const ready = [card('r1', 's', 101), card('r2', 's', 102, { category: 'ADVANCED_GRAMMAR' }), card('r3', 's', 150), card('x', 'other', 101)];
    const review = summarizeSessionResult(now, [now], ready);
    expect(review.step).toBe('review');
    expect(review.reviewIds).toEqual(['r1', 'r2', 'r3']);
    expect(review.detailCount).toBe(0);
    expect(review.categoryLosses[0]).toMatchObject({ category: 'VOCABULARY_TRAP', count: 2 });
  });

  it('grows the sprout with the best score so far, never shrinking after a drop', () => {
    const rows = [test('a', '2026-09-01', 500), test('b', '2026-09-05', 780)];
    expect(summarizeSessionResult(test('c', '2026-09-09', 600), [...rows], [], 850).stage).toBe('lush');
    expect(summarizeSessionResult(test('c', '2026-09-09', 860), [...rows], [], 850).stage).toBe('bloom');
    expect(summarizeSessionResult(test('c', '2026-09-09', 540), [rows[0]], [], 850).stage).toBe('sprout');
    expect(summarizeSessionResult(test('c', '2026-09-09', 640), [rows[0]], [], 850).stage).toBe('leaves');
  });
});
