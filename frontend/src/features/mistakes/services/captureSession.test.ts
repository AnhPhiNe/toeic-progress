import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ extract: vi.fn(), prepare: vi.fn() }));
vi.mock('./aiMistakeExtractor', () => ({ extractPageWithAI: mocks.extract }));
vi.mock('@/features/mistakes/lib/imageInput', () => ({ prepareImage: mocks.prepare }));
vi.mock('@/shared/data/dataBundle', () => ({ getActiveAccountId: () => 'owner-1' }));
vi.mock('@/shared/data/formDrafts', () => ({ readFormDraft: () => null, writeFormDraft: () => true, removeFormDraft: () => true }));

import { __resetCaptureForTests, addFiles, captureState, retryFailure, setTestName, startReading } from './captureSession';

const draft = (changes = {}) => ({ part: 5, category: 'OTHER', questionContext: 'Q ___', question: 'Q ___', context: '', userMistake: '', correctAnswer: '(B) b',
  trapTip: '', options: ['(A) a', '(B) b', '(C) c', '(D) d'], tags: [], missingInformation: [], answerSource: 'PROVIDED', userChoice: 'A',
  userChoiceState: 'CHOSEN', userReason: '', optionNotes: [], explanation: null, ...changes });
const reply = (numbers: number[], ticket = 't') => ({ items: numbers.map(number => ({ number, draft: draft() })), missing: [], explainTicket: ticket,
  usage: { remaining: 26, limit: 27, guest: false } });
const files = (count: number) => Array.from({ length: count }, (_, index) => new File(['x'], `p${index}.png`, { type: 'image/png' }));

beforeEach(() => {
  vi.clearAllMocks();
  let counter = 0;
  mocks.prepare.mockImplementation(async (file: File) => ({ id: `${file.name}-${++counter}`, name: file.name, dataUrl: 'data:image/jpeg;base64,AAAA' }));
  __resetCaptureForTests();
});

describe('capture session', () => {
  it('accepts at most ten screenshots and says the rest is for the next capture', async () => {
    await addFiles(files(12));
    expect(captureState().images).toHaveLength(10);
    expect(captureState().overflow).toBe(true);
    expect(mocks.prepare).toHaveBeenCalledTimes(10);
  });

  it('reads in chunks of three images, one batch id for all, and merges the results without repeats', async () => {
    await addFiles(files(7));
    setTestName('ETS 2024 Test 11');
    mocks.extract.mockResolvedValueOnce(reply([107, 117])).mockResolvedValueOnce(reply([117, 124])).mockResolvedValueOnce(reply([131]));
    // Wide mode: every chunk looks for all of the 8 questions.
    await startReading({ questions: [107, 117, 124, 131, 135, 141, 150, 160], getToken: async () => 'tok' });
    expect(mocks.extract).toHaveBeenCalledTimes(3);
    expect(mocks.extract.mock.calls.map(call => call[1].length)).toEqual([3, 3, 1]);
    expect(new Set(mocks.extract.mock.calls.map(call => call[5])).size).toBe(1);
    // Later readings only ask for what is still missing.
    expect(mocks.extract.mock.calls[1][0].map((question: { number: number }) => question.number)).not.toContain(107);
    const state = captureState();
    expect(state.phase).toBe('review');
    expect(state.items.map(item => item.number)).toEqual([107, 117, 124, 131]);
  });

  it('keeps going when one reading fails, lists the screenshots, and retries them inside the same capture', async () => {
    await addFiles(files(4));
    setTestName('ETS 2024 Test 11');
    mocks.extract.mockRejectedValueOnce(new Error('Máy chủ đang bận.')).mockResolvedValueOnce(reply([107]));
    await startReading({ questions: [107, 117], getToken: async () => 'tok' });
    let state = captureState();
    expect(state.items.map(item => item.number)).toEqual([107]);
    expect(state.failures).toHaveLength(1);
    expect(state.failures[0]).toMatchObject({ message: 'Máy chủ đang bận.' });
    expect(state.failures[0].imageIds).toHaveLength(3);
    mocks.extract.mockResolvedValueOnce(reply([117]));
    const batch = mocks.extract.mock.calls[0][5];
    await retryFailure(state.failures[0].id);
    state = captureState();
    expect(state.failures).toHaveLength(0);
    expect(state.items.map(item => item.number)).toEqual([107, 117]);
    expect(mocks.extract.mock.calls[mocks.extract.mock.calls.length - 1][5]).toBe(batch);
  });

  it('tells a reading that finished with the dialog closed', async () => {
    await addFiles(files(1));
    setTestName('ETS 2024 Test 11');
    mocks.extract.mockResolvedValueOnce(reply([107]));
    await startReading({ questions: [107], getToken: async () => 'tok' });
    expect(captureState().finishedInBackground).toBe(true);
  });
});
