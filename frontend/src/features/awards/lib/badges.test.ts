import { describe, expect, it } from 'vitest';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { StudySession } from '@/shared/types';
import { computeBadges } from './badges';

const test = (id: string, date: string, totalScore: number, extra: Partial<StudySession> = {}) =>
  ({ id, skillType: 'LR', sessionType: 'FULL_TEST', testName: extra.testName ?? `T${id}`, date, durationMinutes: 120, totalScore, createdAt: `${date}T10:00:00`, ...extra }) as StudySession;

function bundle(sessions: StudySession[], target = 800): DataBundle {
  return { schemaVersion: 3, profile: { name: 'A', targetScore: target, examDate: '', currentStreak: 0, longestStreak: 0, streakFreezes: 0, lastStudyDate: '', dailyMinGoalMinutes: 30, motto: '', selectedSkill: 'LR' },
    sessions, mistakes: [], pacingRuns: [], vocabLog: [], shieldDays: [] } as unknown as DataBundle;
}
const byId = (b: ReturnType<typeof computeBadges>) => Object.fromEntries(b.map(x => [x.id, x]));

describe('computeBadges', () => {
  it('earns nothing on an empty notebook and says what is left', () => {
    const b = byId(computeBadges(bundle([]), '2026-11-13'));
    expect(b['score-first'].earned).toBe(false);
    expect(b['streak-3'].left).toBe('còn 3 ngày');
    expect(Object.values(b).filter(x => x.earned)).toHaveLength(0);
  });

  it('awards score, streak, effort, part and secret badges from the data', () => {
    const sessions = [
      test('1', '2026-11-01', 600), test('2', '2026-11-02', 640, { testName: 'X' }), test('3', '2026-11-03', 660),
      test('4', '2026-11-04', 690, { wrongQuestions: [147, 150] }), test('5', '2026-11-12', 720, { testName: 'X', createdAt: '2026-11-12T23:30:00' })
    ];
    const b = byId(computeBadges(bundle(sessions, 700), '2026-11-13'));
    expect(b['score-first']).toMatchObject({ earned: true, date: '2026-11-01' });
    expect(b['score-record']).toMatchObject({ earned: true, date: '2026-11-02' });
    expect(b['score-record3']).toMatchObject({ earned: true, date: '2026-11-04' });
    expect(b['score-plus100']).toMatchObject({ earned: true, date: '2026-11-12' });
    expect(b['score-goal']).toMatchObject({ earned: true, date: '2026-11-12' });
    expect(b['streak-3']).toMatchObject({ earned: true, date: '2026-11-03' });
    expect(b['streak-7'].earned).toBe(false);
    expect(b['effort-tests5']).toMatchObject({ earned: true, date: '2026-11-12' });
    expect(b['part-7']).toMatchObject({ earned: true, date: '2026-11-04' });
    expect(b['secret-owl'].earned).toBe(true);
    expect(b['secret-comeback']).toMatchObject({ earned: true, date: '2026-11-12' });
    expect(b['secret-retake']).toMatchObject({ earned: true });
  });
});

