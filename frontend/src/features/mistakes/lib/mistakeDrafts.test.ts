import { describe, expect, it } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import { applyDraftSync, createDraftMistake, draftMistakeId, needsSupplement, sessionDrafts, syncDraftMistakes } from './mistakeDrafts';
import { getDueMistakes } from './spacedRepetition';

const NOW = '2026-10-19T09:00:00.000Z';
const session = { id: 's1', testName: 'ETS 2024 Test 4', wrongQuestions: [3, 104, 151] };

describe('draft mistakes from a wrong-question list', () => {
  it('creates one draft per wrong question with test, Part and number filled in', () => {
    const { add, removeIds } = syncDraftMistakes(session, [], NOW);
    expect(removeIds).toEqual([]);
    expect(add.map(card => [card.id, card.part, card.questionNumber])).toEqual([
      ['draft:s1:3', 1, 3], ['draft:s1:104', 5, 104], ['draft:s1:151', 7, 151]
    ]);
    expect(add[1]).toMatchObject({ sessionId: 's1', sourceTestName: 'ETS 2024 Test 4', answerSource: 'MISSING', userChoiceState: 'UNKNOWN', category: 'OTHER', status: 'NEEDS_REVIEW' });
    expect(() => createDraftMistake(session, 201, NOW)).toThrow();
  });

  it('keeps drafts out of review until they have a question and an answer', () => {
    const draft = createDraftMistake(session, 104, NOW);
    expect(needsSupplement(draft)).toBe(true);
    expect(getDueMistakes([draft], '2026-10-19')).toEqual([]);
    const answered: MistakeEntry = { ...draft, userChoice: 'B', userChoiceState: 'CHOSEN', correctAnswer: '(D)', answerSource: 'PROVIDED' };
    expect(needsSupplement(answered)).toBe(true);
    const complete: MistakeEntry = { ...answered, question: 'Reports should ____ submitted.', questionContext: 'Reports should ____ submitted.' };
    expect(needsSupplement(complete)).toBe(false);
    expect(getDueMistakes([complete], '2026-10-19')).toHaveLength(1);
  });

  it('adds only new numbers and removes untouched drafts that are no longer wrong', () => {
    const [q3, q104, q151] = syncDraftMistakes(session, [], NOW).add;
    const worked: MistakeEntry = { ...q151, userChoice: 'B', userChoiceState: 'CHOSEN' };
    const other: MistakeEntry = { ...createDraftMistake({ id: 's2', testName: 'Other' }, 3, NOW) };
    const result = syncDraftMistakes({ ...session, wrongQuestions: [104, 200] }, [q3, q104, worked, other], NOW);
    expect(result.add.map(card => card.questionNumber)).toEqual([200]);
    expect(result.removeIds).toEqual([q3.id]);
  });

  it('does not recreate a card that already exists and ignores deleted ones', () => {
    const [q3] = syncDraftMistakes({ ...session, wrongQuestions: [3] }, [], NOW).add;
    expect(syncDraftMistakes({ ...session, wrongQuestions: [3] }, [q3], NOW).add).toEqual([]);
    const deleted = { ...q3, deletedAt: NOW };
    expect(syncDraftMistakes({ ...session, wrongQuestions: [3] }, [deleted], NOW).add.map(card => card.id)).toEqual([draftMistakeId('s1', 3)]);
  });

  it('lists a session’s drafts in question order', () => {
    const cards = syncDraftMistakes(session, [], NOW).add.reverse();
    const done: MistakeEntry = { ...cards[0], question: 'Q', questionContext: 'Q', correctAnswer: '(A)', answerSource: 'PROVIDED' };
    expect(sessionDrafts('s1', [done, ...cards.slice(1)]).map(card => card.questionNumber)).toEqual([3, 104]);
  });

  it('applies a save, an edit and a deleted test to the notebook', () => {
    const other: MistakeEntry = { ...createDraftMistake({ id: 's2', testName: 'Other' }, 5, NOW) };
    const saved = applyDraftSync(session, [other], NOW);
    expect(saved.map(card => card.id)).toEqual(['draft:s1:3', 'draft:s1:104', 'draft:s1:151', other.id]);
    const worked = saved.map(card => card.id === 'draft:s1:151' ? { ...card, userChoice: 'B' as const, userChoiceState: 'CHOSEN' as const } : card);
    const edited = applyDraftSync({ ...session, wrongQuestions: [104] }, worked, NOW);
    expect(edited.map(card => card.id)).toEqual(['draft:s1:104', 'draft:s1:151', other.id]);
    const deleted = applyDraftSync({ id: 's1', testName: '', wrongQuestions: [] }, edited, NOW);
    expect(deleted.map(card => card.id)).toEqual(['draft:s1:151', other.id]);
    expect(applyDraftSync(session, saved, NOW)).toBe(saved);
  });
});
