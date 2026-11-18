import { describe, expect, it } from 'vitest';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { MistakeEntry, PacingRun, StudySession } from '@/shared/types';
import { badgeStars, badgeTip, computeBadges, pickQuests, totalStars } from './badges';

const test = (id: string, date: string, totalScore: number, extra: Partial<StudySession> = {}) =>
  ({ id, skillType: 'LR', sessionType: 'FULL_TEST', testName: extra.testName ?? `T${id}`, date, durationMinutes: 120, totalScore, createdAt: `${date}T10:00:00`, ...extra }) as StudySession;

function bundle(sessions: StudySession[], patch: Partial<DataBundle> = {}, profile: Record<string, unknown> = {}): DataBundle {
  return { schemaVersion: 3, profile: { name: 'A', targetScore: 800, examDate: '', currentStreak: 0, longestStreak: 0, streakFreezes: 0, lastStudyDate: '', dailyMinGoalMinutes: 30, motto: '', selectedSkill: 'LR', ...profile },
    sessions, mistakes: [], pacingRuns: [], vocabLog: [], shieldDays: [], ...patch } as unknown as DataBundle;
}
const byId = (b: ReturnType<typeof computeBadges>) => Object.fromEntries(b.map(x => [x.id, x]));
const run = (id: string, patch: Partial<PacingRun> = {}): PacingRun => ({ id, presetId: 'PART_7', presetName: 'Part 7', partType: 'PART_7', date: '2026-11-01', createdAt: `2026-11-01T10:00:${id.padStart(2, '0')}Z`,
  plannedMinutes: 55, actualMinutes: 50, actualSeconds: 3000, finishedNaturally: false, phases: [], totalQuestions: 54, ...patch }) as PacingRun;
const card = (id: string, patch: Partial<MistakeEntry> = {}): MistakeEntry => ({ id, part: 5, questionContext: 'Câu 101', userMistake: '(A)', correctAnswer: '(B)', category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-11-01T10:00:00Z', ...patch }) as MistakeEntry;

describe('new badges', () => {
  it('has about forty badges with unique ids and consistent tiers', () => {
    const all = computeBadges(bundle([]), '2026-11-13');
    expect(all.length).toBeGreaterThanOrEqual(40);
    expect(new Set(all.map(b => b.id)).size).toBe(all.length);
    const b = byId(all);
    expect(b['score-first'].tier).toBe('b');
    expect(b['streak-7'].tier).toBe('s');
    expect(b['score-800'].tier).toBe('g');
    expect(all.some(x => x.family === 'speed')).toBe(true);
  });

  it('awards absolute score marks and section 400s', () => {
    const sessions = [test('1', '2026-11-01', 610, { scaledListening: 300, scaledReading: 310 }), test('2', '2026-11-05', 810, { scaledListening: 410, scaledReading: 400 })];
    const b = byId(computeBadges(bundle(sessions), '2026-11-13'));
    expect(b['score-600']).toMatchObject({ earned: true, date: '2026-11-01' });
    expect(b['score-700']).toMatchObject({ earned: true, date: '2026-11-05' });
    expect(b['score-800'].earned).toBe(true);
    expect(b['score-900']).toMatchObject({ earned: false, left: 'còn 90 điểm' });
    expect(b['score-900'].progress).toBeCloseTo(0.9, 1);
    expect(b['score-listen400']).toMatchObject({ earned: true, date: '2026-11-05' });
    expect(b['score-read400'].earned).toBe(true);
  });

  it('awards Tuần trọn vẹn when the weekly goal is met in some week', () => {
    const sessions = [test('1', '2026-11-02', 600), test('2', '2026-11-03', 610), test('3', '2026-11-05', 620)];
    expect(byId(computeBadges(bundle(sessions, {}, { weeklyGoalDays: 3 }), '2026-11-13'))['streak-week']).toMatchObject({ earned: true, date: '2026-11-05' });
    const five = byId(computeBadges(bundle(sessions), '2026-11-13'))['streak-week'];
    expect(five.earned).toBe(false);
    expect(five.progress).toBeCloseTo(0.6);
  });

  it('counts reviews, screenshot captures and Part drills', () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(`c${i}`, { sourceImageIds: ['h'], reviewCount: 50 }));
    const practice = Array.from({ length: 50 }, (_, i) => test(`p${i}`, '2026-11-01', 0, { sessionType: 'PART_PRACTICE' }));
    const b = byId(computeBadges(bundle(practice, { mistakes: cards } as Partial<DataBundle>), '2026-11-13'));
    expect(b['effort-capture10'].earned).toBe(true);
    expect(b['effort-review500'].earned).toBe(true);
    expect(b['effort-practice50'].earned).toBe(true);
    expect(b['effort-tests50']).toMatchObject({ earned: false, left: 'còn 50' });
  });

  it('awards Gỡ Part 1, 2, 4 and the whole Reading section from one test', () => {
    const clean = test('1', '2026-11-01', 700, { wrongQuestions: [1, 7, 8, 9] });
    const b = byId(computeBadges(bundle([clean]), '2026-11-13'));
    expect(b['part-1'].earned).toBe(true);
    expect(b['part-2'].earned).toBe(true);
    expect(b['part-4'].earned).toBe(true);
    expect(b['part-read']).toMatchObject({ earned: true, date: '2026-11-01' });
    const messy = test('2', '2026-11-02', 500, { wrongQuestions: [101, 102, 103, 104, 105, 106, 131, 132, 133, 134] });
    const m = byId(computeBadges(bundle([messy]), '2026-11-13'));
    expect(m['part-read'].earned).toBe(false);
    expect(m['part-5'].earned).toBe(false);
    expect(m['part-5'].progress).toBeCloseTo(5 / 6, 1);
  });

  it('awards the Tốc độ badges from timed runs', () => {
    const runs = [
      run('1', { date: '2026-11-01', actualSeconds: 3100 }), run('2', { date: '2026-11-02', actualSeconds: 3000 }),
      run('3', { date: '2026-11-03', actualSeconds: 2900 }), run('4', { date: '2026-11-04', actualSeconds: 2950 }),
      run('5', { date: '2026-11-05', actualSeconds: 3200 }),
      run('6', { date: '2026-11-06', partType: 'FULL_READING', plannedMinutes: 75, actualSeconds: 4400, totalQuestions: 100 }),
      run('7', { date: '2026-11-07', finishedNaturally: true, actualSeconds: 3300 })
    ];
    const b = byId(computeBadges(bundle([], { pacingRuns: runs } as Partial<DataBundle>), '2026-11-13'));
    expect(b['speed-ontime']).toMatchObject({ earned: true, date: '2026-11-01' });
    expect(b['speed-ontime5']).toMatchObject({ earned: true, date: '2026-11-05' });
    expect(b['speed-p7record']).toMatchObject({ earned: true, date: '2026-11-02' });
    expect(b['speed-read75']).toMatchObject({ earned: true, date: '2026-11-06' });
    const slow = byId(computeBadges(bundle([], { pacingRuns: [run('1', { actualSeconds: 3500 }), run('2', { finishedNaturally: true, actualSeconds: 3300 })] } as Partial<DataBundle>), '2026-11-13'));
    expect(slow['speed-p7record'].earned).toBe(false);
    expect(slow['speed-ontime5'].earned).toBe(false);
  });

  it('awards Dậy sớm and Sổ tay sạch', () => {
    const early = [test('1', '2026-11-03', 600, { createdAt: '2026-11-03T05:10:00' })];
    expect(byId(computeBadges(bundle(early), '2026-11-13'))['secret-early']).toMatchObject({ earned: true, date: '2026-11-03' });
    expect(byId(computeBadges(bundle([test('2', '2026-11-03', 600, { createdAt: '2026-11-03T08:10:00' })]), '2026-11-13'))['secret-early'].earned).toBe(false);
    const reviewed = ['a', 'b', 'c'].map(id => card(id, { lastReviewedAt: '2026-11-13T09:00:00', nextReviewDate: '2026-11-20', reviewCount: 1 }));
    expect(byId(computeBadges(bundle([], { mistakes: reviewed } as Partial<DataBundle>), '2026-11-13'))['secret-clean'].earned).toBe(true);
    const oneDue = [...reviewed, card('d', { nextReviewDate: '2026-11-12' })];
    expect(byId(computeBadges(bundle([], { mistakes: oneDue } as Partial<DataBundle>), '2026-11-13'))['secret-clean'].earned).toBe(false);
  });
});

describe('stars, tooltips and quests', () => {
  it('counts gold 3, silver 2, bronze 1 for earned badges only', () => {
    const all = computeBadges(bundle([test('1', '2026-11-01', 610)]), '2026-11-13');
    const earned = all.filter(b => b.earned);
    const by = (t: string) => earned.filter(b => b.tier === t).length;
    expect(totalStars(all)).toBe(by('g') * 3 + by('s') * 2 + by('b'));
    expect(badgeStars({ tier: 'g' })).toBe(3);
    expect(badgeStars({ tier: 's' })).toBe(2);
    expect(badgeStars({ tier: 'b' })).toBe(1);
    expect(totalStars(all)).toBeGreaterThan(0);
  });

  it('writes the tooltip as "Huy hiệu vàng · how"', () => {
    const b = byId(computeBadges(bundle([]), '2026-11-13'));
    expect(badgeTip(b['score-goal'])).toBe('Huy hiệu vàng · Một đề đạt 800 điểm. (còn 800 điểm)');
    expect(badgeTip(b['secret-owl'])).toContain('bí mật');
  });

  it('picks the three locked non-secret badges closest to done', () => {
    const all = computeBadges(bundle([test('1', '2026-11-01', 780), test('2', '2026-11-02', 790)]), '2026-11-13');
    const q = pickQuests(all);
    expect(q).toHaveLength(3);
    expect(q.every(x => !x.earned && x.family !== 'secret')).toBe(true);
    expect(q[0].progress).toBeGreaterThanOrEqual(q[1].progress);
    expect(q[1].progress).toBeGreaterThanOrEqual(q[2].progress);
    expect(q.map(x => x.id)).toContain('score-800');
  });
});
