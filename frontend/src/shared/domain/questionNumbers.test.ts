import { describe, expect, it } from 'vitest';
import { formatQuestionList, normalizeQuestionList, parseQuestionList, partOfQuestion, partScoresFromWrong, questionsOfPart, wrongQuestionsByPart } from './questionNumbers';
import { PART_MAX_QUESTIONS } from './etsScoring';

describe('question numbers', () => {
  it('maps every question to the fixed TOEIC Part ranges', () => {
    expect([1, 6, 7, 31, 32, 70, 71, 100, 101, 130, 131, 146, 147, 200].map(partOfQuestion)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
    expect([0, 201, 1.5, -3].map(partOfQuestion)).toEqual([null, null, null, null]);
    for (const part of [1, 2, 3, 4, 5, 6, 7] as const) expect(questionsOfPart(part)).toHaveLength(PART_MAX_QUESTIONS[`part${part}`]);
  });

  it('parses typed lists with ranges and reports what it cannot read', () => {
    expect(parseQuestionList('3 15, 22;101-104  147–148 15')).toEqual({ questions: [3, 15, 22, 101, 102, 103, 104, 147, 148], invalid: [] });
    expect(parseQuestionList('0 201 12a 30-20 5-300 abc').invalid).toEqual(['0', '201', '12a', '30-20', '5-300', 'abc']);
    expect(parseQuestionList('   ')).toEqual({ questions: [], invalid: [] });
  });

  it('normalizes and formats lists compactly', () => {
    expect(normalizeQuestionList([5, 3, 3, 0, 201, 2.5, 200])).toEqual([3, 5, 200]);
    expect(formatQuestionList([104, 3, 101, 102, 103, 15, 16])).toBe('3 15 16 101-104');
    expect(formatQuestionList(parseQuestionList(formatQuestionList([1, 2, 3, 9, 150, 151, 152, 199])).questions)).toBe('1-3 9 150-152 199');
  });

  it('turns wrong questions into correct answers per Part', () => {
    const wrong = [3, 15, 22, 104, 112, 151, 200];
    expect(wrongQuestionsByPart(wrong)).toEqual({ 1: [3], 2: [15, 22], 3: [], 4: [], 5: [104, 112], 6: [], 7: [151, 200] });
    expect(partScoresFromWrong(wrong)).toEqual({ part1: 5, part2: 23, part3: 39, part4: 30, part5: 28, part6: 16, part7: 52 });
    expect(partScoresFromWrong([])).toEqual(PART_MAX_QUESTIONS);
    expect(Object.values(partScoresFromWrong(Array.from({ length: 200 }, (_, index) => index + 1)))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
