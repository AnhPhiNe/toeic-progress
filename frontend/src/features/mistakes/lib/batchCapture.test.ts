import { describe, expect, it } from 'vitest';
import { buildBatchEntries, type BatchExtractedItem } from './batchCapture';
import { getDemoSampleInput } from '@/features/mistakes/services/aiMistakeExtractor';

const item = (number: number): BatchExtractedItem => ({
  id: `draft-${number}`, number, part: 5, category: 'OTHER', draft: { ...getDemoSampleInput().result,
    question: 'Reports ____ submitted.', context: '', questionContext: 'Reports ____ submitted.', userChoice: '', userChoiceState: 'UNKNOWN' }
});

describe('batch card preflight', () => {
  it('retains draft IDs on retry and preserves every source field', () => {
    const items = [item(101), item(102)];
    const first = buildBatchEntries(items, 'ETS', 'session');
    const retry = buildBatchEntries(items, 'ETS', 'session');
    expect(first.map(card => card.id)).toEqual(['draft-101', 'draft-102']);
    expect(retry.map(card => card.id)).toEqual(first.map(card => card.id));
    expect(first[0]).toMatchObject({ sourceTestName: 'ETS', sessionId: 'session', questionNumber: 101,
      question: items[0].draft.question, options: items[0].draft.options });
  });
  it('rejects the entire batch when a later card exceeds the UTF-8 payload limit', () => {
    const second = item(102); second.draft.context = 'ễ'.repeat(11500);
    second.draft.questionContext = second.draft.question + '\n\n' + second.draft.context;
    expect(() => buildBatchEntries([item(101), second], 'ETS')).toThrow('64 KiB');
  });
  it.each(['x'.repeat(1001), 'x'.repeat(16001)])('rejects field violations even before the byte ceiling', value => {
    const second = item(102); second.draft.correctAnswer = value;
    expect(() => buildBatchEntries([item(101), second], 'ETS')).toThrow('chưa hợp lệ');
  });
  it('rejects duplicate IDs, duplicate question numbers and a question in the wrong part', () => {
    expect(() => buildBatchEntries([item(101), { ...item(102), id: 'draft-101' }], 'ETS')).toThrow('ID');
    expect(() => buildBatchEntries([item(101), { ...item(101), id: 'different' }], 'ETS')).toThrow('ID');
    expect(() => buildBatchEntries([{ ...item(158), part: 5 }], 'ETS')).toThrow('ID');
  });
  it('rejects an inconsistent learner choice instead of silently changing it', () => {
    const card = item(101); card.draft.userChoiceState = 'CHOSEN';
    expect(() => buildBatchEntries([card], 'ETS')).toThrow('lựa chọn');
  });
  it('accepts Listening Parts 1–4 captured cards alongside Reading cards', () => {
    const p2: BatchExtractedItem = { ...item(12), part: 2, draft: { ...item(12).draft, part: 2, options: ['(A) Yes.', '(B) No.', '(C) Tomorrow.'], correctAnswer: '(C) Tomorrow.' } };
    const p3: BatchExtractedItem = { ...item(32), part: 3, draft: { ...item(32).draft, part: 3 } };
    const entries = buildBatchEntries([p2, p3, item(101)], 'ETS');
    expect(entries.map(card => [card.part, card.questionNumber])).toEqual([[2, 12], [3, 32], [5, 101]]);
  });
});
