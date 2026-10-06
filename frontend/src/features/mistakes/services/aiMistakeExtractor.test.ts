import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signInAnonymously: vi.fn(), backendRequest: vi.fn() }));
vi.mock('@/shared/api/api', () => ({ apiAvailable: true, backendRequest: mocks.backendRequest }));
vi.mock('@/shared/api/supabaseClient', () => ({ cloud: { auth: { getSession: mocks.getSession, signInAnonymously: mocks.signInAnonymously } } }));
import { extractMistakeWithAI, getDemoSampleInput } from '@/features/mistakes/services/aiMistakeExtractor';
const guest = { user: { id: 'guest-id', is_anonymous: true }, access_token: 'guest-token' };
const account = { user: { id: 'account-id', is_anonymous: false }, access_token: 'account-token' };

beforeEach(() => {
  vi.clearAllMocks();
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
});
