import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signInAnonymously: vi.fn(), backendRequest: vi.fn() }));
vi.mock('@/shared/api/api', () => ({ apiAvailable: true, backendRequest: mocks.backendRequest }));
vi.mock('@/shared/api/supabaseClient', () => ({ cloud: { auth: { getSession: mocks.getSession, signInAnonymously: mocks.signInAnonymously } } }));

import { extractMistakeWithAI, extractPageWithAI, readResultsWithAI, explainBatchWithAI, getDemoSampleInput, getAIUsage, getAIConfiguration } from './aiMistakeExtractor';

const guest = { user: { id: 'guest-id', is_anonymous: true }, access_token: 'guest-token' };
const account = { user: { id: 'account-id', is_anonymous: false }, access_token: 'account-token' };

describe('visible result-image scores', () => {
  const images = [{ id: 'score', name: 'result.png', dataUrl: 'data:image/png;base64,test' }];
  it('keeps elapsed seconds and null scopes without deriving any section or total', async () => {
    const timing = { totalSeconds: 6721, listeningSeconds: null, readingSeconds: null,
      parts: { part1: null, part2: null, part3: null, part4: null, part5: 870, part6: null, part7: null } };
    mocks.backendRequest.mockResolvedValue({ wrong: [107], skipped: [], timing, usage: {} });
    expect((await readResultsWithAI(images, vi.fn())).timing).toEqual(timing);
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
  });
  it.each([-1, 86401, true, '112', 1.5])('rejects invalid elapsed duration %s without another request', async value => {
    mocks.backendRequest.mockResolvedValue({ wrong: [], skipped: [], timing: { totalSeconds: value,
      listeningSeconds: null, readingSeconds: null,
      parts: { part1: null, part2: null, part3: null, part4: null, part5: null, part6: null, part7: null } }, usage: {} });
    await expect(readResultsWithAI(images, vi.fn())).rejects.toThrow('chưa hợp lệ');
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
  });
  it('returns source scores independently of the wrong question list', async () => {
    const scores = { listening: 375, reading: 370, total: 745 };
    mocks.backendRequest.mockResolvedValue({ wrong: [3, 107], skipped: [], scores, usage: {} });
    expect(await readResultsWithAI(images, vi.fn())).toMatchObject({ wrong: [3, 107], scores });
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
  });
  it('does not invent section scores from a total or require scores from older backends', async () => {
    mocks.backendRequest.mockResolvedValueOnce({ wrong: [], skipped: [], scores: { listening: null, reading: null, total: 800 }, usage: {} });
    expect((await readResultsWithAI(images, vi.fn())).scores).toEqual({ listening: null, reading: null, total: 800 });
    mocks.backendRequest.mockResolvedValueOnce({ wrong: [3], skipped: [], usage: {} });
    expect((await readResultsWithAI(images, vi.fn())).scores).toBeUndefined();
  });
  it('rejects out-of-scale source scores without retrying the paid request', async () => {
    mocks.backendRequest.mockResolvedValue({ wrong: [], skipped: [], scores: { listening: 500, reading: 370, total: 870 }, usage: {} });
    await expect(readResultsWithAI(images, vi.fn())).rejects.toThrow('chưa hợp lệ');
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
  });
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: account } });
  mocks.backendRequest.mockResolvedValue({ draft: getDemoSampleInput().result, usage: { remaining: 9, limit: 10, guest: false } });
});

describe('backend AI extraction', () => {
  it('does not send queued explanations through a different account or a guest that has signed in', async () => {
    await expect(explainBatchWithAI('signed-ticket', [], 'other-owner')).rejects.toThrow('Tài khoản đã thay đổi');
    await expect(explainBatchWithAI('signed-ticket', [], null)).rejects.toThrow('Tài khoản đã thay đổi');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
    mocks.getSession.mockResolvedValue({ data: { session: guest } });
    mocks.backendRequest.mockResolvedValue({ items: [], failed: [] });
    await expect(explainBatchWithAI('signed-ticket', [], null)).resolves.toMatchObject({ items: [], failed: [] });
  });
  it('preserves a full page passage and its trailing evidence through reading and ticket explanation', async () => {
    const context = 'x '.repeat(2400) + 'Delivery fee: $19.';
    const draft = { ...getDemoSampleInput().result, part: 7, question: 'What is the delivery fee?', context,
      questionContext: 'What is the delivery fee?\n\n' + context };
    const items = [{ number: 158, draft }];
    mocks.backendRequest.mockResolvedValueOnce({ items, missing: [], explainTicket: 'signed-test-ticket', usage: {} });
    const read = await extractPageWithAI([{ number: 158, part: 7 }], [{ id: 'local', name: 'page.png', dataUrl: 'data:image/png;base64,test' }], vi.fn());
    expect(read.items[0].draft.context).toBe(context);
    const retry = [{ number: 158, status: 'completed', remainingAttempts: 2 }];
    mocks.backendRequest.mockResolvedValueOnce({ items, failed: [], retry });
    const explained = await explainBatchWithAI('signed-test-ticket', [{ number: 158, input: {
      question: draft.question, options: draft.options, context, part: 7,
      userChoiceState: 'UNKNOWN', userChoice: '', sourceAnswer: '', userReason: ''
    } }]);
    expect(explained.items[0].draft.context).toBe(context);
    expect(explained.retry).toEqual(retry);
  });
  it('does not expand ordinary single-question output limits when page passages get longer', async () => {
    const context = 'x'.repeat(4001);
    mocks.backendRequest.mockResolvedValue({ draft: { ...getDemoSampleInput().result, context }, usage: {} });
    await expect(extractMistakeWithAI(getDemoSampleInput().input, vi.fn())).rejects.toThrow('chưa hợp lệ');
  });
  it('keeps compatibility with older explanation responses while exposing per-question retry exhaustion', async () => {
    mocks.backendRequest.mockResolvedValueOnce({ items: [], failed: [158] });
    expect((await explainBatchWithAI('signed-ticket', [])).retry).toEqual([]);
    const retry = [{ number: 158, status: 'exhausted', remainingAttempts: 0 }];
    mocks.backendRequest.mockResolvedValueOnce({ items: [], failed: [158], retry });
    expect((await explainBatchWithAI('signed-ticket', [])).retry).toEqual(retry);
  });
  it('keeps managed approval status and a custom monthly cap from the backend', async () => {
    const usage = { remaining: 23, limit: 27, guest: false, enabled: true, accessStatus: 'active', accessMessage: '', unlimited: false };
    mocks.backendRequest.mockResolvedValue(usage);
    expect(await getAIUsage()).toEqual(usage);
  });
  it('sends freeform paste unchanged in one request with learner metadata separate', async () => {
    const input = { rawText: '**Câu hỏi**\n178\nA mixed copy from the website', question: '', options: [], context: '', part: 7 as const,
      userChoice: 'D' as const, userChoiceState: 'CHOSEN' as const, userReason: 'I chose D.', sourceAnswer: '' as const };
    await extractMistakeWithAI(JSON.stringify(input), vi.fn(), input);
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
    expect(mocks.backendRequest).toHaveBeenCalledWith('/api/v1/ai/extract', 'POST', expect.objectContaining({ input }), 'account-id', expect.any(Function));
  });
  it('sends the learner fields separately without folding their reason into a source answer', async () => {
    const input = { question: 'Reports ____ submitted.', options: ['(A) are', '(B) be'], context: '', part: 5 as const,
      userChoice: '' as const, userChoiceState: 'UNKNOWN' as const, userReason: 'Đáp án chuẩn: A là lời mình ghi lại', sourceAnswer: 'B' as const };
    await extractMistakeWithAI(JSON.stringify(input), vi.fn(), input);
    expect(mocks.backendRequest).toHaveBeenCalledWith('/api/v1/ai/extract', 'POST', expect.objectContaining({ input, consent: true, provider: 'openai' }), 'account-id', expect.any(Function));
    expect(mocks.backendRequest).toHaveBeenCalledTimes(1);
  });
  it('rejects empty or oversized input before creating an identity', async () => {
    await expect(extractMistakeWithAI('', vi.fn())).rejects.toThrow('20 đến');
    await expect(extractMistakeWithAI('a'.repeat(8001), vi.fn())).rejects.toThrow('20 đến');
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it('sends image bytes only, without local filenames/IDs, in the same extraction request', async () => {
    const input = { question: 'What should employees do?', options: ['(A) Call.', '(B) Write.', '(C) Wait.', '(D) Leave.'], context: '', part: 7 as const,
      userChoice: 'A' as const, userChoiceState: 'CHOSEN' as const, userReason: '', sourceAnswer: '' as const };
    const images = [{ id: 'local-only', name: 'private-filename.png', dataUrl: 'data:image/jpeg;base64,example' }];
    await extractMistakeWithAI(JSON.stringify(input), vi.fn(), input, images);
    expect(mocks.backendRequest).toHaveBeenCalledTimes(1);
    expect(mocks.backendRequest).toHaveBeenCalledWith('/api/v1/ai/extract', 'POST', expect.objectContaining({
      input, images: [{ dataUrl: images[0].dataUrl }], consent: true, provider: 'openai'
    }), 'account-id', expect.any(Function));
  });
  it('uses different single-use captcha tokens for anonymous sign-up and extraction', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signInAnonymously.mockResolvedValue({ data: { session: guest } });
    const captcha = vi.fn().mockResolvedValueOnce('sign-up-token').mockResolvedValueOnce('api-token');
    await extractMistakeWithAI(getDemoSampleInput().input, captcha);
    expect(mocks.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'sign-up-token' } });
    expect(mocks.backendRequest).toHaveBeenCalledWith('/api/v1/ai/extract', 'POST', expect.objectContaining({ captcha_token: 'api-token', consent: true }), 'guest-id', expect.any(Function));
    expect(captcha).toHaveBeenCalledTimes(2);
  });
  it('uses the existing permanent account without anonymous sign-up', async () => {
    const captcha = vi.fn();
    const value = await extractMistakeWithAI(getDemoSampleInput().input, captcha);
    expect(value.usage.remaining).toBe(9);
    expect(captcha).not.toHaveBeenCalled();
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });
  it('requires one captcha for an existing guest', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: guest } });
    const captcha = vi.fn().mockResolvedValue('token');
    await extractMistakeWithAI(getDemoSampleInput().input, captcha);
    expect(captcha).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed output and never silently substitutes a sample', async () => {
    mocks.backendRequest.mockResolvedValue({ draft: { part: 9 }, usage: {} });
    await expect(extractMistakeWithAI(getDemoSampleInput().input, vi.fn())).rejects.toThrow('chưa hợp lệ');
  });
  it('does not retry another provider model when quota is exhausted', async () => {
    mocks.backendRequest.mockRejectedValue(new Error('Đã hết lượt'));
    await expect(extractMistakeWithAI(getDemoSampleInput().input, vi.fn())).rejects.toThrow('Đã hết lượt');
    expect(mocks.backendRequest).toHaveBeenCalledTimes(1);
  });
  it('keeps a missing answer empty even if the provider filled an answer', async () => {
    mocks.backendRequest.mockResolvedValue({ draft: { ...getDemoSampleInput().result, answerSource: 'MISSING' }, usage: {} });
    expect((await extractMistakeWithAI(getDemoSampleInput().input, vi.fn())).draft.correctAnswer).toBe('');
  });

  it('preserves multiline translations without changing quiz option text', async () => {
    const demo = getDemoSampleInput();
    mocks.backendRequest.mockResolvedValue({ draft: demo.result, usage: { remaining: 9, limit: 10, guest: false } });
    const { draft } = await extractMistakeWithAI(demo.input, vi.fn());
    expect(draft.trapTip).toBe(demo.result.trapTip);
    expect(draft.trapTip.split('\n\n')).toHaveLength(5);
    expect(draft.options).toEqual(['(A) are', '(B) be', '(C) were', '(D) will be']);
    expect(draft.correctAnswer).toBe('(B) be');
    expect(draft.optionNotes.map(note => `${note.label} (${note.pos})`)).toEqual(['A (v)', 'B (v)', 'C (v)', 'D (v)']);
    expect(draft.explanation?.quickTip).toContain('request that');
  });

  it('accepts drafts from backends without structured fields', async () => {
    const { optionNotes: _notes, explanation: _explanation, userChoice: _choice, ...older } = getDemoSampleInput().result;
    mocks.backendRequest.mockResolvedValue({ draft: older, usage: {} });
    const { draft } = await extractMistakeWithAI(getDemoSampleInput().input, vi.fn());
    expect(draft.optionNotes).toEqual([]);
    expect(draft.explanation).toBeNull();
    expect(draft.userChoice).toBe('');
  });

  it('keeps an explicitly marked AI proposal instead of erasing the answer', async () => {
    mocks.backendRequest.mockResolvedValue({ draft: { ...getDemoSampleInput().result, answerSource: 'AI_PROPOSED' }, usage: {} });
    const { draft } = await extractMistakeWithAI(getDemoSampleInput().input, vi.fn());
    expect(draft.answerSource).toBe('AI_PROPOSED');
    expect(draft.correctAnswer).toBe('(B) be');
  });
});

const session = (id: string) => ({ data: { session: { user: { id } } } });

describe('AI quota lookup', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does not create a guest identity or call the API just to open the modal', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    expect(await getAIUsage()).toBeNull();
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });

  it('displays backend entitlement using the current verified session owner', async () => {
    mocks.getSession.mockResolvedValue(session('alice'));
    const usage = { remaining: null, limit: null, guest: false, unlimited: true };
    mocks.backendRequest.mockResolvedValue(usage);
    expect(await getAIUsage()).toEqual(usage);
    expect(mocks.backendRequest).toHaveBeenCalledWith('/api/v1/ai/usage', 'GET', undefined, 'alice');
  });

  it('discards a quota response when the account changes during the request', async () => {
    mocks.getSession.mockResolvedValueOnce(session('alice')).mockResolvedValueOnce(session('bob'));
    mocks.backendRequest.mockResolvedValue({ remaining: null, limit: null, guest: false, unlimited: true });
    expect(await getAIUsage()).toBeNull();
  });
});

describe('AI recipient configuration', () => {
  beforeEach(() => vi.stubEnv('VITE_API_URL', 'https://api.example'));
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each([
    [false, 'Chức năng phân tích AI đang được tắt.'],
    [true, 'Cấu hình dịch vụ phân tích AI chưa đầy đủ.'],
    [undefined, 'Dịch vụ phân tích AI chưa sẵn sàng.'],
  ])('distinguishes AI disabled from incomplete configuration (%s)', async (enabled, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: false, ai_enabled: enabled }) }));
    await expect(getAIConfiguration()).rejects.toThrow(message);
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });

  it('loads the recipient without creating or authenticating a guest identity', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true, ai_provider: 'openai' }) });
    vi.stubGlobal('fetch', fetch);
    expect(await getAIConfiguration()).toEqual({ provider: 'openai' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    await extractMistakeWithAI(getDemoSampleInput().input, vi.fn());
    expect(mocks.backendRequest).toHaveBeenCalledWith('/api/v1/ai/extract', 'POST', expect.objectContaining({ provider: 'openai' }), 'account-id', expect.any(Function));
  });

  it('does not assume a provider when an older backend omits its identity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true }) }));
    await expect(getAIConfiguration()).rejects.toThrow('Backend cần hỗ trợ OpenAI');
  });

  it('does not permit consent to an unknown provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true, ai_provider: 'unknown' }) }));
    await expect(getAIConfiguration()).rejects.toThrow('chưa hợp lệ');
  });

  it('recovers from a transient fetch failure without calling the paid API', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true, ai_provider: 'openai' }) });
    vi.stubGlobal('fetch', fetch);
    const pending = getAIConfiguration();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toEqual({ provider: 'openai' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => url === 'https://api.example/health')).toBe(true);
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });

  it('bounds retries and replaces raw browser errors with Vietnamese recovery guidance', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    const pending = getAIConfiguration().catch(reason => reason);
    await vi.advanceTimersByTimeAsync(3000);
    const error = await pending;
    expect(error.message).toContain('thử kết nối lại');
    expect(error.message).not.toContain('Failed to fetch');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });

  it('can recover after a deployment returns a temporary 503', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true, ai_provider: 'openai' }) });
    vi.stubGlobal('fetch', fetch);
    const pending = getAIConfiguration();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).provider).toBe('openai');
  });

  it('uses a same-origin public probe only for the configured production website', async () => {
    vi.stubEnv('VITE_API_URL', 'https://toeic-progress-api.onrender.com/');
    vi.stubGlobal('window', { location: { hostname: 'toeictracking.vercel.app' } });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true, ai_provider: 'openai' }) });
    vi.stubGlobal('fetch', fetch);
    await getAIConfiguration();
    expect(fetch).toHaveBeenCalledWith('/api/ai-status', expect.objectContaining({ cache: 'no-store' }));
    const options = fetch.mock.calls[0][1];
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeUndefined();
    expect(mocks.backendRequest).not.toHaveBeenCalled();
    // A staging API on the same frontend hostname must never be silently
    // replaced with the production Render project.
    vi.stubEnv('VITE_API_URL', 'https://api.staging.example');
    await getAIConfiguration();
    expect(fetch).toHaveBeenLastCalledWith('https://api.staging.example/health', expect.anything());
  });

  it('preserves direct health checks for localhost and preview deployments', async () => {
    vi.stubEnv('VITE_API_URL', 'https://toeic-progress-api.onrender.com');
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true, ai_provider: 'openai' }) });
    vi.stubGlobal('fetch', fetch);
    await getAIConfiguration();
    expect(fetch).toHaveBeenCalledWith('https://toeic-progress-api.onrender.com/health', expect.anything());
  });
});


describe('single extraction lifecycle', () => {
  const raw = () => getDemoSampleInput().input;
  it('blocks an owner changed while getSession was pending', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { ...account, user: { ...account.user, id: 'other-account' } } } });
    await expect(extractMistakeWithAI(raw(), vi.fn(), undefined, [], [], account.user.id)).rejects.toThrow('Tài khoản đã thay đổi');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not send after closing while getSession is pending', async () => {
    let current = true;
    mocks.getSession.mockImplementation(async () => { current = false; return { data: { session: account } }; });
    await expect(extractMistakeWithAI(raw(), vi.fn(), undefined, [], [], account.user.id, () => current)).rejects.toThrow('đã đóng');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not replace an account that signs in during guest CAPTCHA', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } }).mockResolvedValueOnce({ data: { session: account } });
    await expect(extractMistakeWithAI(raw(), async () => 'token', undefined, [], [], null)).rejects.toThrow('Tài khoản đã thay đổi');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not create a guest or send after closing during CAPTCHA', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    let current = true;
    await expect(extractMistakeWithAI(raw(), async () => { current = false; return 'token'; }, undefined, [], [], null, () => current)).rejects.toThrow('đã đóng');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('passes the final dispatch guard and drops a late response without retry', async () => {
    let current = true;
    const guard = () => current;
    mocks.backendRequest.mockImplementation(async () => { current = false; return { draft: getDemoSampleInput().result, usage: {} }; });
    await expect(extractMistakeWithAI(raw(), vi.fn(), undefined, [], [], account.user.id, guard)).rejects.toThrow('đã đóng');
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
    expect(mocks.backendRequest.mock.calls[0][4]).toBe(guard);
  });
});

describe('page extraction lifecycle', () => {
  const questions = [{ number: 158, part: 7 }];
  const images = [{ id: 'local', name: 'private.png', dataUrl: 'data:image/png;base64,test' }];
  it('does not send after closing while getSession is pending', async () => {
    let current = true;
    mocks.getSession.mockImplementation(async () => { current = false; return { data: { session: account } }; });
    await expect(extractPageWithAI(questions, images, vi.fn(), account.user.id, () => current)).rejects.toThrow('đã đóng');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not send queued screenshots under a different owner', async () => {
    await expect(extractPageWithAI(questions, images, vi.fn(), 'old-account')).rejects.toThrow('Tài khoản đã thay đổi');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not sign in anonymously after cancellation during CAPTCHA', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    let current = true;
    await expect(extractPageWithAI(questions, images, async () => { current = false; return 'token'; }, null, () => current)).rejects.toThrow('đã đóng');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled(); expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not replace an account that signed in during guest CAPTCHA', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } }).mockResolvedValueOnce({ data: { session: account } });
    await expect(extractPageWithAI(questions, images, async () => 'token', null)).rejects.toThrow('Tài khoản đã thay đổi');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled(); expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('drops a response that arrives after the form closes, with no automatic retry', async () => {
    let current = true;
    mocks.backendRequest.mockImplementation(async () => { current = false; return { items: [], missing: [158], usage: {} }; });
    await expect(extractPageWithAI(questions, images, vi.fn(), account.user.id, () => current)).rejects.toThrow('đã đóng');
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
  });
});

describe('result screenshot lifecycle', () => {
  const images = [{ id: 'result', name: 'result.png', dataUrl: 'data:image/png;base64,test' }];
  it('blocks a changed owner before dispatch', async () => {
    await expect(readResultsWithAI(images, vi.fn(), 'old-account')).rejects.toThrow('Tài khoản đã thay đổi');
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not create a guest after closing during CAPTCHA', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    let current = true;
    await expect(readResultsWithAI(images, async () => { current = false; return 'token'; }, null, () => current)).rejects.toThrow('đã đóng');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('does not replace an account signed in during CAPTCHA', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } }).mockResolvedValueOnce({ data: { session: account } });
    await expect(readResultsWithAI(images, async () => 'token', null)).rejects.toThrow('Tài khoản đã thay đổi');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
  it('passes the dispatch guard and drops a late response without retry', async () => {
    let current = true;
    const guard = () => current;
    mocks.backendRequest.mockImplementation(async () => { current = false; return { wrong: [101], skipped: [], usage: {} }; });
    await expect(readResultsWithAI(images, vi.fn(), account.user.id, guard)).rejects.toThrow('đã đóng');
    expect(mocks.backendRequest).toHaveBeenCalledOnce();
    expect(mocks.backendRequest.mock.calls[0][4]).toBe(guard);
  });
});

describe('managed AI access for guests', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.example');
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true, ai_provider: 'openai', managed_ai_access: true }) }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('invites a guest to sign in instead of solving a captcha for a session the backend would refuse', async () => {
    const asked = vi.fn();
    const appWindow = Object.assign(new EventTarget(), { location: { hostname: 'localhost' } });
    vi.stubGlobal('window', appWindow);
    appWindow.addEventListener('toeic:ai-sign-in', asked);
    const captcha = vi.fn();
    const images = [{ id: 'local', name: 'result.png', dataUrl: 'data:image/jpeg;base64,example' }];
    await expect(readResultsWithAI(images, captcha)).rejects.toThrow('Đăng nhập Google để dùng AI');
    await expect(extractMistakeWithAI(getDemoSampleInput().input, captcha)).rejects.toThrow('Đăng nhập Google để dùng AI');
    expect(asked).toHaveBeenCalledTimes(2);
    expect(captcha).not.toHaveBeenCalled();
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    expect(mocks.backendRequest).not.toHaveBeenCalled();
  });
});
