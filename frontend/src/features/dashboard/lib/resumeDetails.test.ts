import { describe, expect, it } from 'vitest';
import type { StudySession } from '@/shared/types';
import { createDraftMistake } from '@/features/mistakes/lib/mistakeDrafts';
import { resumeDetails } from './resumeDetails';

const session = (id: string, date: string): StudySession => ({ id, date, testName: 'Same test', skillType: 'LR', sessionType: 'FULL_TEST', durationMinutes: 120, createdAt: `${date}T09:00:00Z` });
describe('resume unfinished attempt details', () => {
  it('selects newest unfinished attempt and counts its own incomplete cards only', () => {
    const older = session('old', '2026-10-20'), newer = session('new', '2026-10-23');
    const draft = createDraftMistake(newer, 153, newer.createdAt);
    const complete = { ...createDraftMistake(newer, 154, newer.createdAt), question: 'Who?', questionContext: 'Who?', correctAnswer: 'B', answerSource: 'PROVIDED' as const };
    const deleted = { ...createDraftMistake(newer, 155, newer.createdAt), deletedAt: newer.createdAt };
    const result = resumeDetails([older, newer], [createDraftMistake(older, 101, older.createdAt), draft, complete, deleted]);
    expect(result).toEqual({ session: newer, remaining: 1 });
    expect(resumeDetails([older, newer], [complete])).toBeNull();
  });
  it('excludes deleted sessions, Listening legacy drafts, and detached notes', () => {
    const test = session('test', '2026-10-23');
    const draft = createDraftMistake(test, 153, test.createdAt);
    expect(resumeDetails([{ ...test, deletedAt: test.createdAt }], [draft])).toBeNull();
    expect(resumeDetails([test], [{ ...draft, sessionId: 'elsewhere' }])).toBeNull();
    expect(resumeDetails([test], [createDraftMistake(test, 3, test.createdAt)])).toBeNull();
  });
});
