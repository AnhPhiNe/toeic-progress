import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MistakeEntry } from '@/shared/types';
import type { MistakeInput } from '@/features/mistakes/lib/mistakeInput';
import type { AIMistakeParseResult } from './aiMistakeExtractor';

const state = vi.hoisted(() => ({ owner: 'owner-a', cards: [] as MistakeEntry[], explain: vi.fn() }));
vi.mock('@/shared/data/dataBundle', () => ({ getActiveAccountId: () => state.owner }));
vi.mock('@/shared/data/storage', () => ({
  loadMistakes: () => state.cards.filter(card => !card.deletedAt),
  updateMistakes: (update: (cards: MistakeEntry[]) => MistakeEntry[]) => { state.cards = update(state.cards); return state.cards; }
}));
vi.mock('./aiMistakeExtractor', () => ({ explainBatchWithAI: state.explain }));
vi.mock('@/shared/api/api', () => ({ ApiRequestError: class extends Error {
  constructor(message: string, public status: number, public requestId?: string, public retryAfter?: number, public code?: string) { super(message); }
} }));

import { ApiRequestError } from '@/shared/api/api';
import { canRetryFree, enqueueExplanations, isExplaining, retryExplanation, setExplanationInterceptor } from './explanationQueue';

const input: MistakeInput = { question: 'What should employees do?', options: ['(A) Call.', '(B) Write.', '(C) Wait.', '(D) Leave.'],
  context: 'Employees should write a report.', part: 7, userChoice: 'A', userChoiceState: 'CHOSEN', userReason: '', sourceAnswer: 'B' };
const card = (id = 'c1'): MistakeEntry => ({ id, part: 7, question: input.question, context: input.context,
  questionContext: [input.question, input.context].join('\n\n'), options: [...input.options], userChoice: 'A', userChoiceState: 'CHOSEN',
  userMistake: '(A) Call.', correctAnswer: '(B) Write.', answerSource: 'PROVIDED', category: 'OTHER', tags: [], status: 'NEEDS_REVIEW', createdAt: '2026-10-20T00:00:00Z' });
const draft: AIMistakeParseResult = { part: 7, category: 'VOCABULARY_TRAP', question: input.question, context: input.context,
  questionContext: input.question, options: input.options, userChoice: 'A', userMistake: '', correctAnswer: '(B) Write.', answerSource: 'PROVIDED',
  trapTip: 'Look for the instruction.', tags: ['instruction'], optionNotes: [], missingInformation: [],
  explanation: { quickTip: 'Look for the instruction.', translation: '', questionType: '', evidence: 'write a report', paraphrase: '', analysis: 'The notice asks employees to write.', keyVocabulary: '' } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const result = (number = 178) => ({ items: [{ number, draft }], failed: [], retry: [] });
const ticket = (suffix = 'signature') => `${btoa(JSON.stringify({ e: Math.floor(Date.now() / 1000) + 3600 }))}.${suffix}`;
const queue = (id = 'c1', number = 178, key = ticket()) => enqueueExplanations(key, [{ cardId: id, number, input }]);
const settled = (...ids: string[]) => vi.waitFor(() => { for (const id of ids) expect(isExplaining(id)).toBe(false); });

beforeEach(() => {
  state.owner = 'owner-a'; state.cards = [card()]; state.explain.mockReset();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('window', new EventTarget());
  setExplanationInterceptor(null);
});
afterEach(() => { setExplanationInterceptor(null); vi.unstubAllGlobals(); });

describe('queued explanation delivery', () => {
  it('stores a matching result after an open detail form declines it, and removes the consumed ticket', async () => {
    const pending = deferred<ReturnType<typeof result>>(); state.explain.mockReturnValue(pending.promise);
    const interceptor = vi.fn(() => false); setExplanationInterceptor(interceptor);
    queue(); await vi.waitFor(() => expect(state.explain).toHaveBeenCalledOnce());
    pending.resolve(result()); await settled('c1');
    expect(interceptor).toHaveBeenCalledWith('c1', draft, input);
    expect(state.cards[0].explanation).toEqual(draft.explanation);
    expect(JSON.parse(localStorage.getItem('toeic_explain_tickets_v1')!)).toEqual({});
  });

  it.each(['question', 'options', 'context', 'choice', 'reason', 'source'] as const)('does not attach a stale result after editing %s', async field => {
    const pending = deferred<ReturnType<typeof result>>(); state.explain.mockReturnValue(pending.promise); queue();
    await vi.waitFor(() => expect(state.explain).toHaveBeenCalledOnce());
    const changes: Partial<MistakeEntry> = field === 'question' ? { question: 'A different question?' }
      : field === 'options' ? { options: ['(A) Changed.', ...input.options.slice(1)] }
      : field === 'context' ? { context: 'A revised notice.' } : field === 'choice' ? { userChoice: 'D' }
      : field === 'reason' ? { userReason: 'I changed my reasoning.' } : { correctAnswer: '(C) Wait.' };
    state.cards = [{ ...state.cards[0], ...changes }];
    pending.resolve(result()); await settled('c1');
    expect(state.cards[0].explanation).toBeUndefined(); expect(canRetryFree('c1')).toBe(false);
    expect(retryExplanation('c1')).toBe(false);
  });

  it('keeps the unconsumed result ticket so reverting to its source permits a valid retry', async () => {
    const pending = deferred<ReturnType<typeof result>>(); state.explain.mockReturnValueOnce(pending.promise); queue();
    await vi.waitFor(() => expect(state.explain).toHaveBeenCalledOnce());
    state.cards[0] = { ...state.cards[0], question: 'Changed?' };
    pending.resolve(result()); await settled('c1');
    expect(JSON.parse(localStorage.getItem('toeic_explain_tickets_v1')!).c1).toBeDefined();
    state.cards = [card()]; state.explain.mockResolvedValueOnce(result());
    expect(canRetryFree('c1')).toBe(true); expect(retryExplanation('c1')).toBe(true);
    await settled('c1'); expect(state.cards[0].explanation).toEqual(draft.explanation);
  });

  it('preserves a newer manual explanation and never revives a deleted card', async () => {
    state.cards.push(card('c2'));
    const pending = deferred<ReturnType<typeof result>>(); state.explain.mockReturnValue(pending.promise);
    enqueueExplanations(ticket(), [{ cardId: 'c1', number: 178, input }, { cardId: 'c2', number: 179, input }]);
    await vi.waitFor(() => expect(state.explain).toHaveBeenCalledOnce());
    state.cards = [{ ...card(), trapTip: 'My own explanation.' }];
    pending.resolve({ ...result(), items: [...result().items, { number: 179, draft }] }); await settled('c1', 'c2');
    expect(state.cards).toHaveLength(1); expect(state.cards[0].trapTip).toBe('My own explanation.');
    expect(state.cards[0].explanation).toBeUndefined();
  });

  it('does not dispatch queued work after an account switch or persist a response under the new owner', async () => {
    const pending = deferred<ReturnType<typeof result>>(); state.explain.mockReturnValue(pending.promise);
    queue(); await vi.waitFor(() => expect(state.explain).toHaveBeenCalledOnce()); queue('c2', 179);
    state.owner = 'owner-b'; pending.resolve(result()); await settled('c1', 'c2');
    expect(state.explain).toHaveBeenCalledOnce(); expect(state.cards[0].explanation).toBeUndefined();
    state.owner = 'owner-a'; expect(canRetryFree('c1')).toBe(true);
  });

  it('keeps retryable failures but removes exhausted tickets for only their question', async () => {
    state.cards.push(card('c2'));
    state.explain.mockResolvedValue({ items: [], failed: [178, 179], retry: [
      { number: 178, status: 'exhausted', remainingAttempts: 0 }, { number: 179, status: 'retryable', remainingAttempts: 2 }
    ] });
    enqueueExplanations(ticket(), [{ cardId: 'c1', number: 178, input }, { cardId: 'c2', number: 179, input }]); await settled('c1', 'c2');
    expect(canRetryFree('c1')).toBe(false); expect(canRetryFree('c2')).toBe(true);
  });

  it('keeps the original card and retry ticket when an explanation would exceed the sync payload limit', async () => {
    const context = 'x'.repeat(15500), longInput = { ...input, context };
    state.cards = [{ ...card(), context, questionContext: `${input.question}\n\n${context}` }];
    const original = structuredClone(state.cards[0]);
    state.explain.mockResolvedValue({ ...result(), items: [{ number: 178, draft: { ...draft, trapTip: 'x'.repeat(4000) } }] });
    enqueueExplanations(ticket(), [{ cardId: 'c1', number: 178, input: longInput }]); await settled('c1');
    expect(state.cards[0]).toEqual(original); expect(canRetryFree('c1')).toBe(true);
  });

  it('retains the final evidence of a 4,839-character passage after saving the explanation', async () => {
    const context = `${'x'.repeat(4815)} Delivery fee: $19. End.`;
    state.cards = [{ ...card(), context, questionContext: `${input.question}\n\n${context}` }];
    state.explain.mockResolvedValue(result());
    enqueueExplanations(ticket(), [{ cardId: 'c1', number: 178, input: { ...input, context } }]); await settled('c1');
    expect(state.cards[0].context).toBe(context); expect(state.cards[0].questionContext.endsWith('Delivery fee: $19. End.')).toBe(true);
    expect(state.cards[0].explanation).toEqual(draft.explanation);
  });

  it('drops definitively invalid tickets while keeping access-denied and transient failures retryable', async () => {
    state.explain.mockRejectedValueOnce(new ApiRequestError('Ticket invalid', 403, undefined, undefined, 'EXPLAIN_TICKET_INVALID'));
    queue(); await settled('c1'); expect(canRetryFree('c1')).toBe(false);
    state.explain.mockRejectedValueOnce(new ApiRequestError('Access pending', 403));
    queue(); await settled('c1'); expect(canRetryFree('c1')).toBe(true);
    state.explain.mockRejectedValueOnce(new Error('Network lost'));
    expect(retryExplanation('c1')).toBe(true); await settled('c1'); expect(canRetryFree('c1')).toBe(true);
  });

  it('dispatches up to three explanation batches concurrently for the same owner', async () => {
    state.cards = [card('c1'), card('c2'), card('c3'), card('c4')];
    let running = 0, peak = 0;
    state.explain.mockImplementation(async (_t: string, items: { number: number }[]) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 15));
      running -= 1;
      return result(items[0].number);
    });
    queue('c1', 178, ticket('s1'));
    queue('c2', 179, ticket('s2'));
    queue('c3', 180, ticket('s3'));
    queue('c4', 181, ticket('s4'));
    await settled('c1', 'c2', 'c3', 'c4');
    expect(peak).toBe(3);
    expect(state.explain).toHaveBeenCalledTimes(4);
  });
});
