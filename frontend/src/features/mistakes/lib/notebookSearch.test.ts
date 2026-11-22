import { describe, expect, it } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { dueFirst, matchesSearch } from './notebookSearch';

const card = (id: string, fields: Partial<MistakeEntry> = {}) => ({
  id, part: 5, question: 'Reports should ____ submitted.', questionContext: '', userMistake: '', correctAnswer: '(B) be', answerSource: 'PROVIDED',
  category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '', deletedAt: null, ...fields,
}) as MistakeEntry;

describe('matchesSearch', () => {
  it('finds words from the explanation and the learner note, ignoring case', () => {
    const m = card('a', { userReason: 'Quên chia số nhiều', explanation: { quickTip: 'Sau should là nguyên thể', analysis: '', translation: 'Báo cáo nên được nộp', evidence: '', paraphrase: '', questionType: '', keyVocabulary: 'submit = nộp' } });
    for (const term of ['NGUYÊN THỂ', 'được nộp', 'submit', 'số nhiều', 'reports', '']) expect(matchesSearch(m, term)).toBe(true);
    expect(matchesSearch(m, 'đảo ngữ')).toBe(false);
  });
});

describe('dueFirst', () => {
  it('lists due cards first in review order, then the rest unchanged', () => {
    const later = card('later', { nextReviewDate: '2099-01-01' });
    const mastered = card('mastered', { status: 'MASTERED' });
    const old = card('old', { nextReviewDate: '2020-01-01' });
    const fresh = card('fresh');
    expect(dueFirst([later, mastered, old, fresh], '2026-11-22').map(m => m.id)).toEqual(['fresh', 'old', 'later', 'mastered']);
  });
});
