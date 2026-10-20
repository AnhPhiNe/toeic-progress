import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/shared/api/supabaseClient', () => ({ cloud: { auth: { getSession } } }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'https://api.example');
  getSession.mockResolvedValue({ data: { session: { access_token: 'user-token', user: { id: 'u1' } } }, error: null });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('backend request feedback', () => {
  it('distinguishes invalid explanation tickets from temporary permission failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Lượt kèm ảnh không còn hợp lệ.' }), {
      status: 403, headers: { 'X-Error-Code': 'EXPLAIN_TICKET_INVALID' }
    })).mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Tài khoản đang chờ duyệt.' }), { status: 403 })));
    const { backendRequest } = await import('@/shared/api/api');
    await expect(backendRequest('/api/v1/ai/explain-batch', 'POST', {})).rejects.toMatchObject({ status: 403, code: 'EXPLAIN_TICKET_INVALID' });
    await expect(backendRequest('/api/v1/ai/explain-batch', 'POST', {})).rejects.toMatchObject({ status: 403, code: undefined });
  });
  it('keeps the AI failure reason and formats longer provider cooldowns without retrying', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'OpenAI đang giới hạn tốc độ xử lý.' }), {
      status: 429, headers: { 'Retry-After': '3600' }
    }));
    vi.stubGlobal('fetch', fetch);
    const { backendRequest } = await import('@/shared/api/api');
    await expect(backendRequest('/api/v1/ai/extract', 'POST', {})).rejects.toMatchObject({
      message: 'OpenAI đang giới hạn tốc độ xử lý. Thử lại sau 60 phút.', retryAfter: 3600
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('returns a structured throttle error without automatically retrying', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Chờ rồi thử lại.' }), {
      status: 429, headers: { 'Retry-After': '12', 'X-Request-ID': '11111111-1111-4111-8111-111111111111' }
    }));
    vi.stubGlobal('fetch', fetch);
    const { backendRequest, ApiRequestError } = await import('@/shared/api/api');
    try { await backendRequest('/api/v1/sync', 'POST', {}, 'u1'); expect.fail('Expected rate limit'); }
    catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({ status: 429, retryAfter: 12 });
      expect((error as Error).message).toContain('12 giây');
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('includes a support ID for server errors and rejects arbitrary ID headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', {
      status: 503, headers: { 'X-Request-ID': '11111111-1111-4111-8111-111111111111' }
    })));
    const { backendRequest } = await import('@/shared/api/api');
    await expect(backendRequest('/api/v1/sync')).rejects.toThrow('Mã hỗ trợ: 11111111-1111-4111-8111-111111111111');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503, headers: { 'X-Request-ID': 'arbitrary', 'Retry-After': '9999' } })));
    await expect(backendRequest('/api/v1/sync')).rejects.toMatchObject({ requestId: undefined, retryAfter: undefined });
  });

  it('never sends data when the active account changed', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { backendRequest } = await import('@/shared/api/api');
    await expect(backendRequest('/api/v1/sync', 'POST', {}, 'another-owner')).rejects.toThrow('Tài khoản đã thay đổi');
    expect(fetch).not.toHaveBeenCalled();
  });
});
