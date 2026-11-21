import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ extract: vi.fn(), explainBatch: vi.fn(), group: vi.fn(), singles: vi.fn() }));
vi.mock('./aiMistakeExtractor', () => ({ extractPageWithAI: mocks.extract, explainBatchWithAI: mocks.explainBatch }));
vi.mock('@/features/mistakes/lib/capturePrepare', () => ({ prepareGroup: mocks.group, prepareSingles: mocks.singles }));
vi.mock('@/shared/data/dataBundle', () => ({ getActiveAccountId: () => 'owner-1' }));
vi.mock('@/shared/data/formDrafts', () => ({ readFormDraft: () => null, writeFormDraft: () => true, removeFormDraft: () => true }));

import { __resetCaptureForTests, addFiles, captureState, COMPRESSED_NOTE, retryFailure, setPart, setPhotoMode, setTestName, startReading } from './captureSession';

const draft = (changes = {}) => ({ part: 5, category: 'OTHER', questionContext: 'Q ___', question: 'Q ___', context: '', userMistake: '', correctAnswer: '(B) b',
  trapTip: '', options: ['(A) a', '(B) b', '(C) c', '(D) d'], tags: [], missingInformation: [], answerSource: 'PROVIDED', userChoice: 'A',
  userChoiceState: 'CHOSEN', userReason: '', optionNotes: [], explanation: null, ...changes });
const reply = (numbers: number[], ticket = 't') => ({ items: numbers.map(number => ({ number, draft: draft() })), missing: [], explainTicket: ticket,
  usage: { remaining: 26, limit: 27, guest: false } });
const files = (count: number) => Array.from({ length: count }, (_, index) => new File(['x'], `p${index}.png`, { type: 'image/png' }));
const image = (id: string) => ({ id, name: id, dataUrl: 'data:image/png;base64,AAAA' });
const request = (questions: number[], images = [image('q')], contextImages: ReturnType<typeof image>[] = []) => ({ contextImages, images, questions, slices: [] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.explainBatch.mockResolvedValue({ items: [], failed: [], retry: [] });
  __resetCaptureForTests();
});

describe('capture session', () => {
  it('takes the Part first (Parts 1–7), at most ten screenshots and five passage pages', () => {
    setPart(7);
    addFiles(files(6), 'passage');
    expect(captureState().images.filter(item => item.zone === 'passage')).toHaveLength(5);
    expect(captureState().overflow).toBe(true);
    addFiles(files(9), 'questions');
    expect(captureState().images).toHaveLength(10);
    // A Part 5 capture has one zone; changing the Part starts afresh.
    setPart(5);
    expect(captureState().images).toHaveLength(0);
    addFiles(files(2), 'passage');
    expect(captureState().images.map(item => item.zone)).toEqual(['questions', 'questions']);
    // Listening Part 3 is supported too.
    setPart(3);
    addFiles(files(1), 'questions');
    expect(captureState().images).toHaveLength(1);
  });

  it('reads a Part 6–7 group with its passage in the same request and forwards photoMode', async () => {
    setPart(7); setTestName('ETS 2024 Test 11'); setPhotoMode(true);
    addFiles(files(2), 'passage'); addFiles(files(1), 'questions');
    mocks.group.mockResolvedValueOnce({ requests: [request([186, 187, 188, 189, 190], [image('q')], [image('p1'), image('p2')])], split: false, compressed: true });
    mocks.extract.mockResolvedValueOnce(reply([186, 189]));
    await startReading({ questions: [186, 187, 188, 189, 190], getToken: async () => 'tok', contextSupported: true });
    expect(mocks.group.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.group.mock.calls[0][1]).toHaveLength(1);
    expect(mocks.extract.mock.calls[0][6]).toHaveLength(2);
    expect(mocks.extract.mock.calls[0][8]).toEqual({ photoMode: true });
    expect(captureState()).toMatchObject({ phase: 'review', note: COMPRESSED_NOTE });
    expect(captureState().items.map(item => item.number)).toEqual([186, 189]);
  });

  it('runs up to three readings in parallel, all with one batch id', async () => {
    setPart(5); setTestName('ETS 2024 Test 11');
    addFiles(files(4));
    mocks.singles.mockResolvedValueOnce({
      requests: [request([101, 102, 103, 104, 105, 106]), request([107]), request([108]), request([109])],
      split: false, compressed: false,
    });
    let running = 0, peak = 0;
    mocks.extract.mockImplementation(async (questions: { number: number }[]) => {
      running += 1; peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 10));
      running -= 1;
      return reply([questions[0].number]);
    });
    await startReading({ questions: [101, 102, 103, 104, 105, 106, 107, 108, 109], getToken: async () => 'tok' });
    expect(peak).toBe(3);
    expect(new Set(mocks.extract.mock.calls.map(call => call[5])).size).toBe(1);
    expect(captureState().items.map(item => item.number)).toEqual([101, 107, 108, 109]);
  });

  it('keeps going when one reading fails and retries it inside the same capture', async () => {
    setPart(5); setTestName('ETS 2024 Test 11');
    addFiles(files(1));
    mocks.singles.mockResolvedValueOnce({ requests: [request([107]), request([117])], split: false, compressed: false });
    mocks.extract.mockRejectedValueOnce(new Error('Máy chủ đang bận.')).mockResolvedValueOnce(reply([117]));
    await startReading({ questions: [107, 117], getToken: async () => 'tok' });
    let state = captureState();
    expect(state.items.map(item => item.number)).toEqual([117]);
    expect(state.failures).toHaveLength(1);
    expect(state.failures[0]).toMatchObject({ message: 'Máy chủ đang bận.', questions: [107] });
    mocks.extract.mockResolvedValueOnce(reply([107]));
    const batch = mocks.extract.mock.calls[0][5];
    await retryFailure(state.failures[0].id);
    state = captureState();
    expect(state.failures).toHaveLength(0);
    expect(state.items.map(item => item.number)).toEqual([107, 117]);
    expect(mocks.extract.mock.calls[mocks.extract.mock.calls.length - 1][5]).toBe(batch);
  });

  it('tells a reading that finished with the dialog closed', async () => {
    setPart(5); setTestName('ETS 2024 Test 11');
    addFiles(files(1));
    mocks.singles.mockResolvedValueOnce({ requests: [request([107])], split: false, compressed: false });
    mocks.extract.mockResolvedValueOnce(reply([107]));
    await startReading({ questions: [107], getToken: async () => 'tok' });
    expect(captureState().finishedInBackground).toBe(true);
  });

  it('automatically widens to the full Part in the same batch when a narrow logged list matches 0 questions on the photo', async () => {
    setPart(6); setTestName('Đề E10');
    addFiles(files(1));
    // First pass searches narrow logged list [143, 144, 146] -> finds 0 items on a 135–138 photo
    mocks.group
      .mockResolvedValueOnce({ requests: [request([143, 144, 146])], split: false, compressed: false })
      .mockResolvedValueOnce({ requests: [request(Array.from({ length: 16 }, (_, i) => 131 + i))], split: false, compressed: false });
    mocks.extract
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValueOnce(reply([135, 136, 137, 138]));
    await startReading({ questions: [143, 144, 146], getToken: async () => 'tok', contextSupported: true });
    expect(mocks.extract).toHaveBeenCalledTimes(2);
    // Both passes share the exact same batchId (1 AI use)
    expect(mocks.extract.mock.calls[0][5]).toBe(mocks.extract.mock.calls[1][5]);
    expect(captureState().items.map(item => item.number)).toEqual([135, 136, 137, 138]);
  });

  it('solves and verifies ALL read items (both MISSING and PROVIDED) via explainBatchWithAI, surfacing answerDoubt and unticking right answers', async () => {
    setPart(7); setTestName('Free Paper Test');
    addFiles(files(1));
    mocks.group.mockResolvedValueOnce({ requests: [request([155, 156, 157])], split: false, compressed: false });
    // Page reading returns 155 (2-mark PROVIDED C), 156 (1-mark MISSING), 157 (1-mark MISSING)
    mocks.extract.mockResolvedValueOnce({
      items: [
        { number: 155, draft: draft({ part: 7, userChoice: 'D', correctAnswer: '(C) c', answerSource: 'PROVIDED' }) },
        { number: 156, draft: draft({ part: 7, userChoice: 'D', correctAnswer: '', answerSource: 'MISSING' }) },
        { number: 157, draft: draft({ part: 7, userChoice: 'A', correctAnswer: '', answerSource: 'MISSING' }) },
      ],
      missing: [],
      explainTicket: 'ticket-solve',
      usage: { remaining: 26, limit: 27, guest: false },
    });
    // AI solves all 3 independently: disagrees with 155's 2nd mark (answerDoubt: 'B'), solves 156 -> D (right), 157 -> B (wrong)
    mocks.explainBatch.mockResolvedValueOnce({
      failed: [],
      retry: [],
      items: [
        { number: 155, draft: draft({ part: 7, userChoice: 'D', correctAnswer: '(C) c', answerSource: 'PROVIDED', answerDoubt: 'B', category: 'VOCABULARY_TRAP' }) },
        { number: 156, draft: draft({ part: 7, userChoice: 'D', correctAnswer: '(D) d', answerSource: 'AI_PROPOSED', category: 'ADVANCED_GRAMMAR' }) },
        { number: 157, draft: draft({ part: 7, userChoice: 'A', correctAnswer: '(B) b', answerSource: 'AI_PROPOSED', category: 'VOCABULARY_TRAP' }) },
      ],
    });
    await startReading({ questions: [155, 156, 157], getToken: async () => 'tok', contextSupported: true });
    expect(mocks.explainBatch).toHaveBeenCalledOnce();
    expect(mocks.explainBatch.mock.calls[0][1].map((item: { number: number }) => item.number)).toEqual([155, 156, 157]);
    const [q155, q156, q157] = captureState().items;
    expect(q155.draft.answerDoubt).toBe('B');
    expect(q155.checked).toBe(true);
    expect(q156.draft.correctAnswer).toBe('(D) d');
    expect(q156.checked).toBe(false);
    expect(q157.draft.correctAnswer).toBe('(B) b');
    expect(q157.checked).toBe(true);
    expect(captureState().solving).toBe(false);
  });

  it('surfaces a clear non-blocking note when immediate solving fails instead of failing silently', async () => {
    setPart(6); setTestName('Paper Test');
    addFiles(files(1));
    mocks.group.mockResolvedValueOnce({ requests: [request([139])], split: false, compressed: false });
    mocks.extract.mockResolvedValueOnce({
      items: [{ number: 139, draft: draft({ part: 6, userChoice: 'B', correctAnswer: '', answerSource: 'MISSING' }) }],
      missing: [],
      explainTicket: 'ticket-err',
      usage: { remaining: 26, limit: 27, guest: false },
    });
    mocks.explainBatch.mockRejectedValueOnce(new Error('timeout'));
    await startReading({ questions: [139], getToken: async () => 'tok', contextSupported: true });
    expect(captureState().phase).toBe('review');
    expect(captureState().solving).toBe(false);
    expect(captureState().note).toContain('chưa kịp tự giải đáp án');
  });
});
