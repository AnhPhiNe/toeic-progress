import { cloud } from '@/shared/api/supabaseClient';
import { requestAISignIn } from '@/shared/lib/aiSignIn';
export const apiAvailable = Boolean(import.meta.env.VITE_API_URL && cloud);

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly requestId?: string, public readonly retryAfter?: number,
    public readonly code?: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function backendRequest<T>(path: string, method = 'GET', body?: unknown, expectedUserId?: string, isCurrent: () => boolean = () => true): Promise<T> {
  if (!apiAvailable || !cloud) throw new Error('Backend chưa được cấu hình. Bạn vẫn có thể dùng chế độ khách.');
  if (!isCurrent()) throw new Error('Tác vụ đã đóng hoặc thay đổi. Chưa gửi yêu cầu.');
  const { data, error } = await cloud.auth.getSession();
  if (!isCurrent()) throw new Error('Tác vụ đã đóng hoặc thay đổi. Chưa gửi yêu cầu.');
  if (error || !data.session) {
    if (path.startsWith('/api/v1/ai/')) {
      requestAISignIn();
      throw new Error('Đăng nhập Google để dùng AI. Bạn vẫn có thể nhập và lưu thủ công.');
    }
    throw new Error('Cần đăng nhập hoặc tạo phiên khách để tiếp tục.');
  }
  if (expectedUserId && data.session.user.id !== expectedUserId) throw new Error('Tài khoản đã thay đổi. Vui lòng thử đồng bộ lại.');
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_URL!.replace(/\/$/, '')}${path}`, {
      method,
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90_000)
    });
  } catch {
    throw new Error('Chưa kết nối được backend. Vui lòng thử lại sau; dữ liệu trên máy vẫn được giữ.');
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const headerId = response.headers.get('X-Request-ID') || '';
    const requestId = /^[a-f0-9-]{36}$/i.test(headerId) ? headerId : undefined;
    const seconds = Number(response.headers.get('Retry-After'));
    const maxDelay = path.startsWith('/api/v1/ai/extract') ? 86400 : 300;
    const retryAfter = Number.isInteger(seconds) && seconds > 0 && seconds <= maxDelay ? seconds : undefined;
    let message = typeof value?.detail === 'string' ? value.detail : 'Máy chủ chưa xử lý được yêu cầu.';
    if (retryAfter) message += ` Thử lại sau ${retryAfter < 60 ? `${retryAfter} giây` : `${Math.ceil(retryAfter / 60)} phút`}.`;
    if (response.status >= 500 && requestId) message += ` Mã hỗ trợ: ${requestId}.`;
    const errorCode = response.headers.get('X-Error-Code') || value?.code;
    const code = typeof errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(errorCode) ? errorCode : undefined;
    if (code === 'AI_LOGIN_REQUIRED') requestAISignIn();
    throw new ApiRequestError(message, response.status, requestId, retryAfter, code);
  }
  return value as T;
}
