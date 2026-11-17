import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { createDraftMistake } from '@/features/mistakes/lib/mistakeDrafts';
import { unfinishedDetailCount } from './unfinishedDetails';

const session = (id: string, date: string): StudySession => ({ id, date, testName: 'Same test', skillType: 'LR', sessionType: 'FULL_TEST', durationMinutes: 120, createdAt: `${date}T09:00:00Z` });
describe('unfinished detail count', () => {
  it('adds the incomplete Reading cards of every attempt', () => {
    const older = session('old', '2026-10-20'), newer = session('new', '2026-10-23');
    const complete = { ...createDraftMistake(newer, 154, newer.createdAt), question: 'Who?', questionContext: 'Who?', correctAnswer: 'B', answerSource: 'PROVIDED' as const };
    const deleted = { ...createDraftMistake(newer, 155, newer.createdAt), deletedAt: newer.createdAt };
    expect(unfinishedDetailCount([older, newer], [createDraftMistake(older, 101, older.createdAt), createDraftMistake(newer, 153, newer.createdAt), complete, deleted])).toBe(2);
    expect(unfinishedDetailCount([older, newer], [complete])).toBe(0);
  });
  it('excludes deleted sessions, Listening legacy drafts, and detached notes', () => {
    const test = session('test', '2026-10-23');
    const draft = createDraftMistake(test, 153, test.createdAt);
    expect(unfinishedDetailCount([{ ...test, deletedAt: test.createdAt }], [draft])).toBe(0);
    expect(unfinishedDetailCount([test], [{ ...draft, sessionId: 'elsewhere' }])).toBe(0);
    expect(unfinishedDetailCount([test], [createDraftMistake(test, 3, test.createdAt)])).toBe(0);
  });
});
