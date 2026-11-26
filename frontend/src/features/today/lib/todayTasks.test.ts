import { describe, expect, it } from 'vitest';
import type { MistakeEntry, PacingRun, StudySession } from '@/shared/types';
import { emptyBundle, type DataBundle } from '@/shared/data/dataBundle';
import { pickTodayTasks, todayReviewPlan } from './todayTasks';

const TODAY = '2026-11-13';
const meta = { updatedAt: '2026-11-01T00:00:00.000Z', deletedAt: null };
const fullParts = { part1: 6, part2: 25, part3: 39, part4: 30, part5: 30, part6: 16, part7: 54 };

const test = (id: string, date: string, parts: Partial<typeof fullParts> = {}) => ({
  ...meta, id, skillType: 'LR', sessionType: 'FULL_TEST', testName: `ETS ${id}`, date,
  durationMinutes: 120, totalScore: 800, partScores: { ...fullParts, ...parts }, createdAt: `${date}T03:00:00.000Z`,
}) as StudySession & typeof meta;

const mistake = (id: string, fields: Partial<MistakeEntry> = {}) => ({
  ...meta, id, part: 5, questionContext: `Câu ${id}`, userMistake: 'A', correctAnswer: 'B',
  category: 'VOCABULARY_TRAP', tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-11-01T00:00:00.000Z', ...fields,
}) as MistakeEntry & typeof meta;

const run = (partType: PacingRun['partType'], date = TODAY) => ({
  ...meta, id: `run-${partType}-${date}`, presetId: String(partType), presetName: 'x', date,
  plannedMinutes: 20, actualMinutes: 20, finishedNaturally: true, phases: [], createdAt: `${date}T03:00:00.000Z`, partType,
}) as PacingRun & typeof meta;

const bundle = (fields: Partial<DataBundle>): DataBundle => ({ ...emptyBundle(), ...fields });
// Noon local time is the same calendar day in every timezone the tests may run in.
const reviewedToday = () => new Date(2026, 10, 13, 12).toISOString();

describe('pickTodayTasks', () => {
  it('gives a brand new learner one first-test task', () => {
    const tasks = pickTodayTasks(emptyBundle(), TODAY);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: 'FULL_TEST', title: 'Ghi điểm đề đầu tiên', done: false, kicker: 'TIẾP THEO · 120 PHÚT' });
  });

  it('orders review, timer and full test, with stable ids per kind and day', () => {
    const data = bundle({
      sessions: [test('1', '2026-11-01', { part7: 30 })],
      mistakes: [mistake('a'), mistake('b'), mistake('c')],
    });
    const tasks = pickTodayTasks(data, TODAY);
    expect(tasks.map(t => t.kind)).toEqual(['REVIEW_MISTAKES', 'PART_TIMER', 'FULL_TEST']);
    expect(tasks.map(t => t.id)).toEqual([
      'review_mistakes:2026-11-13', 'part_timer:2026-11-13', 'full_test:2026-11-13',
    ]);
    expect(tasks[2]).toMatchObject({ title: 'Làm 1 đề full', reason: 'Đã 12 ngày chưa làm đề', minutes: 120 });
    expect(pickTodayTasks(data, TODAY).map(t => t.id)).toEqual(tasks.map(t => t.id));
  });

  it('sizes the mistake review at a minute per card, 5 to 15 minutes', () => {
    const few = pickTodayTasks(bundle({ mistakes: [mistake('a'), mistake('b'), mistake('c')] }), TODAY)[0];
    expect(few).toMatchObject({ title: 'Ôn 3 câu sai', reason: 'Đến hạn hôm nay', minutes: 5, count: 3, kicker: 'TIẾP THEO · 5 PHÚT' });
    const many = pickTodayTasks(bundle({ mistakes: Array.from({ length: 40 }, (_, i) => mistake(String(i))) }), TODAY)[0];
    expect(many).toMatchObject({ title: 'Ôn 15 câu sai', minutes: 15, count: 15 });
  });

  it('skips mistakes that are not due, deleted or unreviewable', () => {
    const data = bundle({ mistakes: [
      mistake('later', { nextReviewDate: '2026-11-20' }),
      mistake('gone', { deletedAt: '2026-11-02T00:00:00.000Z' }),
      mistake('mastered', { status: 'MASTERED' }),
      mistake('noAnswer', { correctAnswer: '' }),
    ] });
    expect(pickTodayTasks(data, TODAY).filter(t => t.kind === 'REVIEW_MISTAKES')).toEqual([]);
  });

  it('marks the review done once today\'s queue is cleared, and keeps it open while cards remain', () => {
    const reviewed = mistake('r', { lastReviewedAt: reviewedToday(), nextReviewDate: '2026-11-16' });
    const cleared = pickTodayTasks(bundle({ mistakes: [reviewed] }), TODAY)[0];
    expect(cleared).toMatchObject({ kind: 'REVIEW_MISTAKES', title: 'Ôn 1 câu sai', done: true });
    const partly = pickTodayTasks(bundle({ mistakes: [reviewed, mistake('due')] }), TODAY)[0];
    expect(partly).toMatchObject({ title: 'Ôn 2 câu sai', done: false });
  });

  it('picks the Reading Part with the most lost questions relative to its size', () => {
    // Part 6 loses 4/16 = 25%, Part 7 loses 10/54 = 19%, Part 5 loses 3/30 = 10%.
    const data = bundle({ sessions: [test('1', '2026-11-12', { part5: 27, part6: 12, part7: 44 })] });
    const timer = pickTodayTasks(data, TODAY).find(t => t.kind === 'PART_TIMER');
    expect(timer).toMatchObject({ title: 'Bấm giờ Part 6', reason: 'Part bạn sai nhiều nhất', part: 6, minutes: 15, kicker: 'TIẾP THEO · 15 PHÚT', done: false });
  });

  it('gives Part 7 twenty minutes and averages several recent tests', () => {
    const data = bundle({ sessions: [test('1', '2026-11-10', { part7: 40 }), test('2', '2026-11-11', { part5: 25 })] });
    expect(pickTodayTasks(data, TODAY).find(t => t.kind === 'PART_TIMER')).toMatchObject({ part: 7, minutes: 20 });
  });

  it('never suggests a Listening Part and says so when Listening is weaker', () => {
    const data = bundle({ sessions: [test('1', '2026-11-12', { part2: 10, part7: 50 })] });
    expect(pickTodayTasks(data, TODAY).find(t => t.kind === 'PART_TIMER')).toMatchObject({ part: 7, reason: 'Part đọc bạn sai nhiều nhất' });
  });

  it('skips the timer when Reading is perfect or there are no usable tests', () => {
    expect(pickTodayTasks(bundle({ sessions: [test('1', '2026-11-12', { part2: 10 })] }), TODAY)).toEqual([]);
    expect(pickTodayTasks(bundle({ mistakes: [mistake('a')] }), TODAY).some(t => t.kind === 'PART_TIMER')).toBe(false);
  });

  it('marks the timer done after a pacing run today for that Part', () => {
    const sessions = [test('1', '2026-11-12', { part7: 40 })];
    const timer = (runs: PacingRun[]) => pickTodayTasks(bundle({ sessions, pacingRuns: runs as DataBundle['pacingRuns'] }), TODAY)
      .find(t => t.kind === 'PART_TIMER');
    expect(timer([run('PART_7_MULTI')])?.done).toBe(true);
    expect(timer([run('FULL_READING')])?.done).toBe(true);
    expect(timer([run('PART_5')])?.done).toBe(false);
    expect(timer([run('PART_7', '2026-11-12')])?.done).toBe(false);
    expect(timer([{ ...run('PART_7'), deletedAt: '2026-11-13T05:00:00.000Z' }])?.done).toBe(false);
  });

  it('asks for a full test only after more than seven days', () => {
    const at = (date: string) => pickTodayTasks(bundle({ sessions: [test('1', date, { part2: 10 })] }), TODAY).find(t => t.kind === 'FULL_TEST');
    expect(at('2026-11-06')).toBeUndefined();
    expect(at('2026-11-05')).toMatchObject({ reason: 'Đã 8 ngày chưa làm đề', done: false });
  });

  it('asks for a first full test when there is other data but no full test', () => {
    const tasks = pickTodayTasks(bundle({ mistakes: [mistake('a')] }), TODAY);
    expect(tasks[tasks.length - 1]).toMatchObject({ kind: 'FULL_TEST', title: 'Làm 1 đề full', reason: 'Bạn chưa làm đề full nào' });
  });

  it('ticks the full test when today\'s test closes a long gap', () => {
    const data = bundle({ sessions: [test('old', '2026-10-01', { part2: 10 }), test('new', TODAY, { part2: 10 })] });
    expect(pickTodayTasks(data, TODAY).find(t => t.kind === 'FULL_TEST')).toMatchObject({ reason: 'Đã 43 ngày chưa làm đề', done: true });
  });

  it('returns nothing when a recent learner has nothing pending', () => {
    expect(pickTodayTasks(bundle({ sessions: [test('1', '2026-11-12')] }), TODAY)).toEqual([]);
  });

  it('caps the list at available task kinds', () => {
    const data = bundle({ sessions: [test('1', '2026-10-01', { part7: 30 })], mistakes: [mistake('a')] });
    expect(pickTodayTasks(data, TODAY)).toHaveLength(3);
  });
});

describe('todayReviewPlan', () => {
  const due = (n: number) => Array.from({ length: n }, (_, i) => mistake(`d${i}`, { question: 'Q ____', answerSource: 'PROVIDED', nextReviewDate: '2026-11-01' }));
  const done = (n: number) => Array.from({ length: n }, (_, i) => mistake(`r${i}`, { question: 'Q ____', answerSource: 'PROVIDED', nextReviewDate: '2026-11-14', lastReviewedAt: reviewedToday() }));

  it('opens at most the 15-card batch, minus what was reviewed today', () => {
    expect(todayReviewPlan(due(60), TODAY)).toMatchObject({ due: 60, batch: 15, left: 15 });
    expect(todayReviewPlan([...due(55), ...done(5)], TODAY)).toMatchObject({ due: 55, reviewedToday: 5, batch: 15, left: 10 });
    expect(todayReviewPlan([...due(45), ...done(15)], TODAY)).toMatchObject({ batch: 15, left: 0 });
  });

  it('never opens more than are due', () => {
    expect(todayReviewPlan([...due(3), ...done(2)], TODAY)).toMatchObject({ due: 3, batch: 5, left: 3 });
    expect(todayReviewPlan([], TODAY)).toMatchObject({ batch: 0, left: 0 });
  });
});
