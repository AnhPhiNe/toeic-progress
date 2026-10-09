import { describe, expect, it } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { gradeLatestMistake, mergeMistakeEdit } from './mistakeUpdates';
import { canReview, getDueMistakes } from './spacedRepetition';
import { getTodayDateString } from '@/shared/data/storage';

const card: MistakeEntry = { id: 'm1', part: 5, questionContext: 'Reports ____ submitted.', options: ['(A) are', '(B) be'],
  correctAnswer: '(B) be', userMistake: '(A) are', category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: '2026-10-01T00:00:00Z' };
describe('reviewing and editing latest data', () => {
  it('treats omitted optional JSON fields as unchanged without ignoring actual content edits', () => {
    const snapshot = { ...card, userChoice: undefined, trapTip: undefined, explanation: undefined, optionNotes: undefined };
    const stored = JSON.parse(JSON.stringify(snapshot)) as MistakeEntry;
    expect(mergeMistakeEdit(stored, snapshot, { ...snapshot, tags: ['updated'] }).tags).toEqual(['updated']);
    expect(() => mergeMistakeEdit({ ...stored, trapTip: 'New remote explanation' }, snapshot, snapshot)).toThrow('nơi khác');
  });
  it('uses the latest review progress and retains fields not owned by review', () => {
    const latest = { ...card, reviewStage: 2, reviewCount: 4, nextReviewDate: getTodayDateString(), userReason: 'Updated elsewhere' };
    const result = gradeLatestMistake(latest, card, true);
    expect(result.reviewStage).toBe(3); expect(result.reviewCount).toBe(5); expect(result.userReason).toBe('Updated elsewhere');
    expect(result.lastReviewedAt).toMatch(/T.*Z$/);
  });
  it('blocks a changed or deleted review question until explicitly reloaded', () => {
    expect(() => gradeLatestMistake({ ...card, correctAnswer: '(A) are' }, card, true)).toThrow('thay đổi');
    expect(() => gradeLatestMistake(undefined, card, true)).toThrow('xóa');
  });
  it('retains newer schedules when editing content and detects concurrent content edits', () => {
    const latest = { ...card, reviewStage: 3, reviewCount: 8 };
    expect(mergeMistakeEdit(latest, card, { ...card, questionContext: 'Edited question' })).toMatchObject({ reviewStage: 3, reviewCount: 8, questionContext: 'Edited question' });
    expect(() => mergeMistakeEdit({ ...latest, tags: ['remote'] }, card, { ...card, tags: ['local'] })).toThrow('nơi khác');
  });
  it('excludes missing answers even if an old card still has a stale answer string', () => {
    const incomplete = { ...card, answerSource: 'MISSING' as const };
    expect(canReview(incomplete)).toBe(false); expect(getDueMistakes([incomplete])).toEqual([]);
    expect(canReview({ ...card, correctAnswer: '' })).toBe(false);
  });
});
