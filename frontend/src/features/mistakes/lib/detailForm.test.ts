import { describe, expect, it } from 'vitest';
import { buildDetailEntry, detailExplanationInput, editDetailForm, EMPTY_FORM, explainInput, fromAI, savedDetailForm, withArrivedExplanation, withReadResult } from './detailForm';
import { sameExplanationInput } from './explanationMerge';
import { createDraftMistake } from './mistakeDrafts';
import type { AIMistakeParseResult } from '../services/aiMistakeExtractor';

const draft: AIMistakeParseResult = {
  part: 5, category: 'ADVANCED_GRAMMAR', question: 'The room ____ fifty guests.', context: '', questionContext: 'The room ____ fifty guests.',
  options: ['(A) accommodates', '(B) accommodating', '(C) accommodation', '(D) to accommodate'],
  correctAnswer: '(A) accommodates', answerSource: 'PROVIDED', userChoice: 'B', userChoiceState: 'CHOSEN',
  userMistake: '', trapTip: '', tags: [], missingInformation: [], optionNotes: [], explanation: null
};
const explained = { ...draft, explanation: { quickTip: 'Choose a verb.', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: '', keyVocabulary: '' } };
const card = () => createDraftMistake({ id: 'attempt', testName: 'ETS' }, 104, '2026-10-20T10:00:00.000Z');

describe('detail form preserves learner decisions', () => {
  it('keeps edits made before or during screenshot reading, including explicit clearing', () => {
    let form = editDetailForm(EMPTY_FORM, { choice: 'D', answer: 'C', category: 'TIME_PRESSURE', raw: '(A) sample' });
    form = withReadResult(form, draft);
    expect(form).toMatchObject({ choice: 'D', answer: 'C', category: 'TIME_PRESSURE', raw: '(A) sample' });
    const cleared = editDetailForm(form, { choice: '', answer: '', category: '' });
    expect(withReadResult(cleared, draft)).toMatchObject({ choice: '', answer: '', category: '' });
    expect(withArrivedExplanation(cleared, explained)).toMatchObject({ choice: '', answer: '', category: '' });
  });

  it('keeps the exact screenshot facts for ticket verification but rejects explanation for a different manual key', () => {
    const form = withReadResult(editDetailForm(EMPTY_FORM, { choice: 'D', answer: 'C' }), draft);
    expect(explainInput(form.ai!, 5)).toEqual(explainInput(draft, 5));
    expect(sameExplanationInput(detailExplanationInput(form, 5)!, explainInput(draft, 5))).toBe(false);
  });

  it('invalidates an existing explanation when the learner changes the choice or key', () => {
    const changed = editDetailForm(fromAI(explained), { answer: 'C' });
    expect(changed.ai?.explanation).toBeNull();
    expect(changed.category).toBe('');
    expect(changed.answer).toBe('C');
  });

  it('saves explicit clearing without resurrecting the old stored choices', () => {
    const stored = { ...card(), userChoice: 'D' as const, userChoiceState: 'CHOSEN' as const, correctAnswer: '(C)' };
    const saved = buildDetailEntry(stored, editDetailForm(savedDetailForm(stored), { choice: '', answer: '' }));
    expect(saved).toMatchObject({ userChoiceState: 'UNKNOWN', userChoice: undefined, correctAnswer: '', answerSource: 'MISSING' });
  });

  it('reopens a partial card with its original source so the matching late explanation can be accepted', () => {
    const saved = buildDetailEntry(card(), fromAI({ ...draft, correctAnswer: '', answerSource: 'MISSING' }));
    expect(typeof saved).toBe('object');
    if (typeof saved === 'string') throw new Error(saved);
    const reopened = savedDetailForm(saved);
    expect(sameExplanationInput(detailExplanationInput(reopened, 5)!, explainInput({ ...draft, correctAnswer: '', answerSource: 'MISSING' }, 5))).toBe(true);
    expect(withArrivedExplanation(reopened, explained).ai?.explanation?.quickTip).toBe('Choose a verb.');
  });

  it('retains the whole long passage on save and reread', () => {
    const context = 'Full passage information. '.repeat(193) + 'Delivery fee: $19.';
    const saved = buildDetailEntry({ ...card(), part: 7 }, fromAI({ ...draft, part: 7, context }));
    expect(typeof saved).toBe('object');
    if (typeof saved === 'string') throw new Error(saved);
    expect(saved.context).toBe(context);
    expect(savedDetailForm(saved).ai?.context).toBe(context);
  });

  it('refuses an oversized UTF-8 card with an explicit message and leaves the full form intact', () => {
    const context = 'ữ'.repeat(8000);
    const form = fromAI({ ...draft, context, part: 7 });
    expect(buildDetailEntry({ ...card(), part: 7 }, form)).toMatch(/quá dài để đồng bộ/);
    expect(form.ai?.context).toBe(context);
  });
});
