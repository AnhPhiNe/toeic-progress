import { describe, expect, it } from 'vitest';
import type { DataBundle } from '@/shared/data/dataBundle';
import type { MistakeEntry, PacingRun, StudySession } from '@/shared/types';
import { computeBadges, totalStars } from './badges';
import { TIER_BADGES, badgeLabel, badgeLines, badgeValues, computeTierBadges, earnedTiers, segmentFill, tierFor, tierStars } from './badgeTiers';
import { levelStars } from './outfit';
import { rankGearItem, sanitizeGear, toggleGear, wornGear } from '@/shared/ui/soc/socGear';
import { socMoodSvg } from '@/shared/ui/soc/socSvg';

const test = (id: string, date: string, totalScore: number, extra: Partial<StudySession> = {}) =>
  ({ id, skillType: 'LR', sessionType: 'FULL_TEST', testName: `T${id}`, date, durationMinutes: 120, totalScore, createdAt: `${date}T10:00:00`, ...extra }) as StudySession;
const card = (id: string, patch: Partial<MistakeEntry> = {}): MistakeEntry => ({ id, part: 5, questionContext: 'Câu 101', userMistake: '(A)', correctAnswer: '(B)',
  category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-11-01T10:00:00Z', ...patch }) as MistakeEntry;
const run = (id: string, patch: Partial<PacingRun> = {}): PacingRun => ({ id, presetId: 'PART_7', presetName: 'Part 7', partType: 'PART_7', date: '2026-11-01',
  createdAt: `2026-11-01T10:00:${id.padStart(2, '0')}Z`, plannedMinutes: 55, actualMinutes: 50, actualSeconds: 3000, finishedNaturally: false, phases: [], totalQuestions: 54, ...patch }) as PacingRun;
function bundle(patch: Record<string, unknown> = {}): DataBundle {
  return { schemaVersion: 3, profile: { name: 'A', targetScore: 800, examDate: '', currentStreak: 0, longestStreak: 0, streakFreezes: 0, lastStudyDate: '',
    dailyMinGoalMinutes: 30, motto: '', selectedSkill: 'LR' }, sessions: [], mistakes: [], pacingRuns: [], vocabLog: [], shieldDays: [], ...patch } as unknown as DataBundle;
}
const byId = (list: ReturnType<typeof computeTierBadges>) => Object.fromEntries(list.map(b => [b.id, b]));

describe('20 badges × 3 tiers', () => {
  it('has the approved list: 20 badges, 4 groups of 5, rising thresholds', () => {
    expect(TIER_BADGES).toHaveLength(20);
    expect(new Set(TIER_BADGES.map(b => b.id)).size).toBe(20);
    for (const g of ['on', 'tb', 'bb', 'de']) expect(TIER_BADGES.filter(b => b.group === g)).toHaveLength(5);
    for (const b of TIER_BADGES) expect(b.th[0] < b.th[1] && b.th[1] < b.th[2]).toBe(true);
    expect(TIER_BADGES.find(b => b.id === 'de-mark')!.th).toEqual([600, 750, 900]);
  });

  it('turns a value into a tier at each threshold', () => {
    expect([0, 9, 10, 19, 20, 49, 50, 500].map(v => tierFor(v, [10, 20, 50]))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('labels a badge like the mockup and fills the bar segments', () => {
    const b = byId(computeTierBadges({ 'on-streak': 34, 'tb-weak': 12, 'de-mark': 950 }));
    expect(badgeLabel(b['on-streak'])).toBe('Bạc · 34/50 tới Vàng');
    expect(badgeLabel(b['tb-weak'])).toBe('Bạc · +12%/+20% tới Vàng');
    expect(badgeLabel(b['on-hard'])).toBe('0/10 tới Đồng');
    expect(badgeLines(b['on-streak'])).toEqual(['Bạc', '34/50 → Vàng']);
    expect(badgeLines(b['on-hard'])).toEqual(['Chưa có', '0/10 → Đồng']);
    expect(badgeLines(b['de-mark'])).toEqual(['Vàng', 'đủ 3 bậc']);
    expect(badgeLines(b['tb-weak'])).toEqual(['Bạc', '12%/20% → Vàng']);
    expect(badgeLabel(b['de-mark'])).toBe('Vàng · đủ 3 bậc');
    expect(segmentFill(b['on-streak'])).toEqual([1, 1, (34 - 20) / 30]);
  });

  it('computes values from the learner\'s own data', () => {
    const v = badgeValues(bundle({
      sessions: [test('1', '2026-10-01', 500, { scaledListening: 260, scaledReading: 240 }), test('2', '2026-10-08', 620, { scaledListening: 320, scaledReading: 300 }),
        test('3', '2026-10-15', 590), test('4', '2026-10-22', 700, { scaledListening: 360, scaledReading: 340 })],
      mistakes: [
        card('a', { lastReviewedAt: '2026-11-02T10:00:00Z', reviewCount: 1, reviewStage: 1 }),
        card('b', { lastReviewedAt: '2026-11-02T11:00:00Z', reviewCount: 5, reviewStage: 3, userReason: 'đọc ẩu' }),
        card('c', { lastReviewedAt: '2026-11-03T10:00:00Z', reviewCount: 2, reviewStage: 0 }),
        card('d', { lastReviewedAt: '2026-11-04T10:00:00Z', reviewCount: 1, reviewStage: 1, status: 'MASTERED', sessionId: 's1' })
      ],
      pacingRuns: [run('1'), run('2', { actualSeconds: 3500 }), run('3', { finishedNaturally: true })],
      vocabLog: [{ id: 'v1', date: '2026-11-01', count: 5 }, { id: 'v2', date: '2026-11-02', count: 5 }, { id: 'v3', date: '2026-11-02', count: 1 }] as DataBundle['vocabLog']
    }), '2026-11-05');
    expect(v['on-streak']).toBe(2);
    expect(v['on-hard']).toBe(1);
    expect(v['on-reason']).toBe(1);
    expect(v['on-clean']).toBe(1);
    expect(v['on-due']).toBe(3);
    expect(v['tb-total']).toBe(200);
    expect(v['tb-listen']).toBe(100);
    expect(v['tb-read']).toBe(100);
    expect(v['tb-record']).toBe(2);
    expect(v['de-full']).toBe(4);
    expect(v['de-mark']).toBe(700);
    expect(v['de-p7']).toBe(1);
    expect(v['bb-vocab']).toBe(2);
    expect(v['bb-parts']).toBe(4); // a full test covers all 7 Parts that week
  });

  it('keeps a tier once reached (device best) and maps the old badges as a floor', () => {
    const now = byId(computeTierBadges({ 'bb-streak': 3 }, { 'bb-streak': 31 }));
    expect(now['bb-streak'].tier).toBe(2);
    const legacy = byId(computeTierBadges({}, {}, [{ id: 'streak-100', earned: true }, { id: 'score-900', earned: true }, { id: 'score-first', earned: false }]));
    expect(legacy['bb-streak'].tier).toBe(3);
    expect(legacy['de-mark'].tier).toBe(3);
    expect(legacy['de-full'].tier).toBe(0);
  });

  it('counts tiers and level stars (Đồng 1, Bạc 2, Vàng 3)', () => {
    const list = computeTierBadges({ 'on-streak': 34, 'de-mark': 950, 'de-full': 1 });
    expect(earnedTiers(list)).toBe(6);
    expect(tierStars(list)).toBe(3 + 6 + 1);
  });

  it('never gives a lower level than the old badges did', () => {
    const b = bundle({ sessions: [test('1', '2026-10-01', 910, { scaledListening: 450, scaledReading: 460 })] });
    expect(levelStars(b, '2026-11-05')).toBeGreaterThanOrEqual(totalStars(computeBadges(b, '2026-11-05')));
  });
});

describe('season reward gear', () => {
  it('parses seasonal ids and needs ownership, not a level', () => {
    expect(rankGearItem('ao-choang.m2')).toMatchObject({ label: 'Áo choàng mùa', season: 2, rankTier: 'kim-cuong', slot: 'body' });
    expect(rankGearItem('ao-choang.m0')).toBeUndefined();
    expect(rankGearItem('hat.m1')).toBeUndefined();
    expect(sanitizeGear(['frame-vang.m1', 'scarf'], 7)).toEqual(['scarf']);
    expect(sanitizeGear(['frame-vang.m1', 'scarf'], 2, ['frame-vang.m1'])).toEqual(['frame-vang.m1', 'scarf']);
  });

  it('wears one frame and one head item at a time', () => {
    const owned = ['frame-bac.m1', 'frame-vang.m1', 'vuong-mien.m1'];
    let worn = toggleGear([], 'frame-bac.m1', 5, owned);
    worn = toggleGear(worn, 'frame-vang.m1', 5, owned);
    expect(worn).toEqual(['frame-vang.m1']);
    worn = toggleGear(toggleGear(worn, 'helmet', 5, owned), 'vuong-mien.m1', 5, owned);
    expect(worn).toEqual(['frame-vang.m1', 'vuong-mien.m1']);
    expect(wornGear(['khan-ngoc.m1'], 3, [])).toEqual([]);
  });

  it('draws season items into Sóc with the season colour', () => {
    const s1 = socMoodSvg('idle', ['ao-choang.m1']), s2 = socMoodSvg('idle', ['ao-choang.m2']);
    expect(s1).toContain('#7b3fd6');
    expect(s2).toContain('#1f9e93');
    expect(socMoodSvg('idle', ['frame-vang.m1'])).toContain('#d99a00');
  });
});
