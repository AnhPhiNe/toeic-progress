import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signInAnonymously: vi.fn(), backendRequest: vi.fn() }));
vi.mock('@/shared/api/api', () => ({ apiAvailable: true, backendRequest: mocks.backendRequest }));
vi.mock('@/shared/api/supabaseClient', () => ({ cloud: { auth: { getSession: mocks.getSession, signInAnonymously: mocks.signInAnonymously } } }));

import { extractMistakeWithAI, getDemoSampleInput, getAIUsage, getAIConfiguration } from './aiMistakeExtractor';

const guest = { user: { id: 'guest-id', is_anonymous: true }, access_token: 'guest-token' };
const account = { user: { id: 'account-id', is_anonymous: false }, access_token: 'account-token' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: account } });
  mocks.backendRequest.mockResolvedValue({ draft: getDemoSampleInput().result, usage: { remaining: 9, limit: 10, guest: false } });
});

describe('backend AI extraction', () => {
  it('rejects empty or oversized input before creating an identity', async () => {
    await expect(extractMistakeWithAI('', vi.fn())).rejects.toThrow('20 đến');
    await expect(extractMistakeWithAI('a'.repeat(8001), vi.fn())).rejects.toThrow('20 đến');
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it('uses different single-use captcha tokens for anonymous sign-up and extraction', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.signInAnonymously.mockResolvedValue({ data: { session: guest } });
    const captcha = vi.fn().mockResolvedValueOnce('sign-up-token').mockResolvedValueOnce('api-token');
    await extractMistakeWithAI(getDemoSampleInput().input, captcha);
    expect(mocks.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'sign-up-token' } });
    expect(mocks.backendRequest).toHaveBeenCalledWith('/api/v1/ai/extract', 'POST', expect.objectContaining({ captcha_token: 'api-token', consent: true }), 'guest-id');
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
    const { draft } = await extractMistakeWithAI(demo.input, vi.fn(), 'openai');
    expect(draft.trapTip).toBe(demo.result.trapTip);
    expect(draft.trapTip.split('\n\n')).toHaveLength(4);
    expect(draft.options).toEqual(['(A) are', '(B) be', '(C) were', '(D) will be']);
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

  it('loads the recipient without creating or authenticating a guest identity', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true, ai_provider: 'openai' }) });
    vi.stubGlobal('fetch', fetch);
    expect(await getAIConfiguration()).toEqual({ provider: 'openai', requireProviderConsent: true });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
    await extractMistakeWithAI(getDemoSampleInput().input, vi.fn(), 'openai');
    expect(mocks.backendRequest).toHaveBeenCalledWith('/api/v1/ai/extract', 'POST', expect.objectContaining({ provider: 'openai' }), 'account-id');
  });

  it('keeps the legacy Gemini request contract compatible during deployment', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ai_configured: true }) }));
    expect(await getAIConfiguration()).toEqual({ provider: 'gemini', requireProviderConsent: false });
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
    expect(await pending).toEqual({ provider: 'openai', requireProviderConsent: true });
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
