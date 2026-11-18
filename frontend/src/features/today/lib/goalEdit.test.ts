import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudySession } from '@/shared/types';
import { defaultProfile } from '@/shared/data/dataBundle';
import {
  CELEBRATED_KEY, bestScore, examDateLabel, examState, goalPreview, hasSeenPastExam, isReachedGoal, markPastExamSeen,
  previewHeadline, savedLine, skipCelebrationFor, stepGoal
} from './goalEdit';
import { goalLabel, shownGoal } from './goalSetup';

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});

const test = (id: string, date: string, total: number, l?: number, r?: number) => ({
  id, date, createdAt: `${date}T09:00:00Z`, skillType: 'LR', sessionType: 'FULL_TEST', testName: `ETS ${id}`, durationMinutes: 120,
  totalScore: total, scaledListening: l, scaledReading: r
}) as unknown as StudySession;

// First test 560, best 680: with goal 800 the stairs go 550 580 610 640 680 710 740 770 and Sóc stands on bậc 5 (680).
const climb = [test('1', '2026-10-01', 560, 290, 270), test('2', '2026-10-15', 620, 320, 300), test('3', '2026-11-01', 680, 350, 330)];

describe('stepGoal', () => {
  it('moves by 25 to the next multiple of 25', () => {
    expect(stepGoal(800, 1)).toBe(825);
    expect(stepGoal(800, -1)).toBe(775);
    expect(stepGoal(735, 1)).toBe(750);
    expect(stepGoal(735, -1)).toBe(725);
  });
  it('stays within 10 to 990', () => {
    expect(stepGoal(990, 1)).toBe(990);
    expect(stepGoal(975, 1)).toBe(990);
    expect(stepGoal(25, -1)).toBe(10);
    expect(stepGoal(10, -1)).toBe(10);
  });
});

describe('goalPreview', () => {
  it('keeps eight stairs and says how wide they are and where Sóc stands', () => {
    const p = goalPreview(climb, 800, 800);
    expect(p).toMatchObject({ estimate: false, cur: 4, curBefore: 4, step: 31 });
    expect(p.bars).toEqual(['passed', 'passed', 'passed', 'passed', 'now', 'next', 'next', 'next']);
    expect(previewHeadline(p, 800)).toEqual({ lead: 'Mỗi bậc ≈ 31 điểm', rest: 'bạn ở bậc 5/8' });
  });
  it('a raise spreads the stairs: Sóc can land a stair lower', () => {
    const p = goalPreview(climb, 800, 850);
    expect(p).toMatchObject({ cur: 3, curBefore: 4, step: 38 });
    expect(p.bars).toHaveLength(8);
    expect(p.bars).toEqual(['passed', 'passed', 'passed', 'now', 'next', 'next', 'next', 'next']);
    expect(previewHeadline(p, 850)).toEqual({ lead: 'Mỗi bậc ≈ 38 điểm', rest: 'bạn ở bậc 4/8' });
  });
  it('a lower goal packs the stairs closer', () => {
    const p = goalPreview(climb, 900, 750);
    expect(p.bars).toHaveLength(8);
    expect(p.step).toBeLessThan(goalPreview(climb, 900, 900).step);
    expect(p.cur).toBeGreaterThanOrEqual(p.curBefore);
  });
  it('splits the goal into Nghe / Đọc from the learner balance', () => {
    const { split } = goalPreview(climb, 800, 850);
    expect(split.listening + split.reading).toBe(850);
    expect(split.listening).toBeGreaterThan(split.reading);
  });
  it('shows estimated stairs before the first test', () => {
    const p = goalPreview([], 800, 850);
    expect(p.estimate).toBe(true);
    expect(p.bars).toEqual(Array(8).fill('next'));
    expect(previewHeadline(p, 850)).toEqual({ lead: 'Mỗi bậc ≈ 50 điểm', rest: '8 bậc ước lượng tới cúp 850' });
  });
});

describe('goals at or below the best score', () => {
  it('detects a reached goal', () => {
    expect(bestScore(climb)).toBe(680);
    expect(bestScore([])).toBeNull();
    expect(isReachedGoal(650, 680)).toBe(true);
    expect(isReachedGoal(680, 680)).toBe(true);
    expect(isReachedGoal(700, 680)).toBe(false);
    expect(isReachedGoal(650, null)).toBe(false);
    expect(goalPreview(climb, 800, 650).reached).toBe(true);
  });
  it('ignores deleted tests and practice sessions for the best score', () => {
    const deleted = { ...test('4', '2026-11-05', 900), deletedAt: '2026-11-06T00:00:00Z' } as StudySession;
    const practice = { ...test('5', '2026-11-05', 950), sessionType: 'PART_PRACTICE' } as StudySession;
    expect(bestScore([...climb, deleted, practice])).toBe(680);
  });
  it('marks the goal celebrated so saving it never fires the one-time celebration', () => {
    skipCelebrationFor(650);
    expect(localStorage.getItem(CELEBRATED_KEY)).toBe('650');
  });
  it('has Sóc say one short line after saving', () => {
    expect(savedLine({ reached: false, target: 900, step: 50, dropped: true })).toBe('Mục tiêu 900 rồi, mỗi bậc giờ ~50 điểm!');
    expect(savedLine({ reached: false, target: 825, step: 34, dropped: false })).toBe('Cúp mới 825, mình leo tiếp nhé!');
    expect(savedLine({ reached: true, target: 650, step: 10, dropped: false })).toBe('Cúp 650 đã nằm trong tay bạn rồi!');
  });
});

describe('exam date', () => {
  it('tells a past date from one ahead', () => {
    expect(examState('', '2026-11-17')).toEqual({ kind: 'none' });
    expect(examState('nope', '2026-11-17')).toEqual({ kind: 'none' });
    expect(examState('2026-11-17', '2026-11-17')).toEqual({ kind: 'soon', days: 0 });
    expect(examState('2026-12-23', '2026-11-17')).toEqual({ kind: 'soon', days: 36 });
    expect(examState('2026-11-10', '2026-11-17')).toEqual({ kind: 'past', daysAgo: 7 });
  });
  it('labels the date with its weekday', () => {
    expect(examDateLabel('2026-12-23')).toBe('Thứ Tư, 23/12');
  });
  it('remembers the "Thi xong chưa?" bubble per owner and exam date', () => {
    expect(hasSeenPastExam(null, '2026-11-10')).toBe(false);
    markPastExamSeen(null, '2026-11-10');
    expect(hasSeenPastExam(null, '2026-11-10')).toBe(true);
    expect(hasSeenPastExam('owner-b', '2026-11-10')).toBe(false);
    expect(hasSeenPastExam(null, '2026-11-12')).toBe(false);
  });
});

describe('fresh profile goal', () => {
  it('stores goalChosen false so nothing shows the placeholder 990 as chosen', () => {
    const profile = defaultProfile();
    expect(profile.goalChosen).toBe(false);
    expect(shownGoal(profile)).toBeNull();
    expect(goalLabel(profile)).toBe('Chưa chọn');
    expect(goalLabel({ ...profile, targetScore: 850 })).toBe('850');
    expect(goalLabel({ ...profile, goalChosen: true })).toBe('990');
  });
});
