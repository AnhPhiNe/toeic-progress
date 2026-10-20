import { describe, expect, it } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import type { AIMistakeParseResult } from '@/features/mistakes/services/aiMistakeExtractor';
import { mergeExplanation } from './explanationMerge';

const card: MistakeEntry = {
  id: 'c1', part: 5, questionNumber: 109, question: 'Mr. Osei ____ a report.', questionContext: 'Mr. Osei ____ a report.', options: ['(A) posting', '(B) posts'],
  userMistake: '(A) posting', userChoice: 'A', userChoiceState: 'CHOSEN', correctAnswer: '', answerSource: 'MISSING', category: 'OTHER',
  tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-10-20T00:00:00Z'
};
const explanation = { quickTip: 'Chủ ngữ số ít: động từ thêm -s.', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: 'Dấu hiệu…', keyVocabulary: '' };
const draft: AIMistakeParseResult = {
  part: 5, category: 'ADVANCED_GRAMMAR', questionContext: card.questionContext, question: card.question, context: '', userMistake: '', correctAnswer: '(B) posts',
  answerSource: 'AI_PROPOSED', trapTip: 'Mẹo 10s: …', options: card.options!, tags: ['agreement'], missingInformation: [], userChoice: 'A',
  optionNotes: [{ label: 'A', pos: 'v', meaning: 'đăng (V-ing)' }, { label: 'B', pos: 'v', meaning: 'đăng (ngôi 3)' }], explanation
};

describe('adding an AI explanation to a card', () => {
  it('fills what is missing', () => {
    expect(mergeExplanation(card, draft)).toMatchObject({ explanation, trapTip: 'Mẹo 10s: …', tags: ['agreement'], category: 'ADVANCED_GRAMMAR',
      correctAnswer: '(B) posts', answerSource: 'AI_PROPOSED', optionNotes: draft.optionNotes, userChoice: 'A' });
  });

  it('keeps the answer from the page, the learner’s error type and existing tags', () => {
    const given: MistakeEntry = { ...card, correctAnswer: '(A) posting', answerSource: 'PROVIDED', category: 'CARELESS_DISTRACTION', tags: ['mine'] };
    expect(mergeExplanation(given, draft)).toMatchObject({ correctAnswer: '(A) posting', answerSource: 'PROVIDED', category: 'CARELESS_DISTRACTION', tags: ['mine'], explanation });
  });

  it('marks a doubt when AI solves the question differently from the page, and only then', () => {
    const given: MistakeEntry = { ...card, correctAnswer: '(A) posting', answerSource: 'PROVIDED' };
    expect(mergeExplanation(given, { ...draft, answerDoubt: 'B' })).toMatchObject({ correctAnswer: '(A) posting', answerDoubt: 'B' });
    expect(mergeExplanation(given, { ...draft, answerDoubt: '' }).answerDoubt).toBeUndefined();
    // Without a page answer AI's own answer simply fills it; there is nothing to doubt.
    expect(mergeExplanation(card, { ...draft, answerDoubt: 'B' }).answerDoubt).toBeUndefined();
  });

  it('leaves a missing answer missing when AI could not decide either', () => {
    expect(mergeExplanation(card, { ...draft, correctAnswer: '', answerSource: 'MISSING' })).toMatchObject({ correctAnswer: '', answerSource: 'MISSING' });
  });
});
