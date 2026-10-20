import { describe, expect, it } from 'vitest';
import { groupDetailAttempts } from './detailGroups';
import { createDraftMistake } from './mistakeDrafts';
import type { StudySession } from '@/shared/types';

const session = (id: string, date: string): StudySession => ({ id, testName: 'ETS Test 1', date, createdAt: `${date}T10:00:00Z`,
  skillType: 'LR', sessionType: 'FULL_TEST', durationMinutes: 120 });

describe('pending question groups', () => {
  it('separates two retakes with overlapping question 104 and labels each attempt/date', () => {
    const first = session('first', '2026-10-19'), second = session('second', '2026-10-20');
    const cards = [createDraftMistake(first, 104, first.createdAt), createDraftMistake(first, 120, first.createdAt),
      createDraftMistake(second, 104, second.createdAt), createDraftMistake(second, 125, second.createdAt)];
    const groups = groupDetailAttempts(cards, [second, first]);
    expect(groups.map(group => [group.attempt, group.cards.map(card => card.questionNumber)])).toEqual([
      ['Lần 1 · 19/10/2026', [104, 120]], ['Lần 2 · 20/10/2026', [104, 125]]
    ]);
  });

  it('keeps unlinked manual cards separate even with the same source name and question number', () => {
    const first = session('first', '2026-10-19');
    const linked = createDraftMistake(first, 104, first.createdAt);
    const groups = groupDetailAttempts([linked, { ...linked, id: 'manual1', sessionId: undefined }, { ...linked, id: 'manual2', sessionId: undefined }], [first]);
    expect(groups).toHaveLength(3);
    expect(groups.map(group => group.cards.length)).toEqual([1, 1, 1]);
    expect(groups.filter(group => !group.sessionId).map(group => group.attempt)).toEqual(['Thẻ nhập riêng', 'Thẻ nhập riêng']);
  });

  it('uses the history attempt numbering without counting SW or Part practice sessions', () => {
    const first = { ...session('first', '2026-10-19'), attemptNumber: 3 };
    const second = session('second', '2026-10-20');
    const groups = groupDetailAttempts([createDraftMistake(second, 104, second.createdAt)],
      [first, { ...session('sw', '2026-10-18'), skillType: 'SW' }, { ...session('part', '2026-10-18'), sessionType: 'PART_PRACTICE' }, second]);
    expect(groups[0].attempt).toBe('Lần 4 · 20/10/2026');
  });
});
