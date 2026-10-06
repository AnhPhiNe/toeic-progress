import { useCallback, useEffect, useRef } from 'react';

interface TurnstileAPI {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  execute(id: string): void;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileAPI } }
let loading: Promise<TurnstileAPI> | undefined;
function loadTurnstile(): Promise<TurnstileAPI> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Chưa tải được xác minh.'));
    script.onerror = () => { script.remove(); loading = undefined; reject(new Error('Chưa tải được xác minh. Vui lòng kiểm tra mạng.')); };
    document.head.appendChild(script);
  });
  return loading;
}

export function useTurnstile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const pending = useRef<{ resolve: (token: string) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const mounted = useRef(true);
  const fail = useCallback((message: string) => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    pending.current.reject(new Error(message));
    pending.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fail('Đã đóng cửa sổ xác minh.');
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [fail]);

  const getToken = useCallback(async () => {
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!sitekey) throw new Error('Xác minh khách chưa được cấu hình. Bạn có thể nhập thủ công.');
    const api = await loadTurnstile();
    if (!mounted.current || !containerRef.current) throw new Error('Đã đóng cửa sổ xác minh.');
    if (pending.current) throw new Error('Đang xác minh yêu cầu trước.');
    if (!widget.current) widget.current = api.render(containerRef.current, {
      sitekey, action: 'toeic-ai', execution: 'execute', appearance: 'interaction-only', size: 'flexible',
      callback: (token: string) => {
        if (!pending.current) return;
        clearTimeout(pending.current.timer);
        pending.current.resolve(token);
        pending.current = null;
      },
      'error-callback': () => { fail('Xác minh chưa thành công. Vui lòng thử lại.'); return true; },
      'expired-callback': () => fail('Xác minh đã hết hạn. Vui lòng thử lại.')
    });
    api.reset(widget.current);
    return new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject, timer: setTimeout(() => fail('Xác minh quá lâu. Vui lòng thử lại.'), 60_000) };
      api.execute(widget.current!);
    });
  }, [fail]);
  const remove = useCallback(() => {
    fail('Đã đóng cửa sổ xác minh.');
    if (widget.current) window.turnstile?.remove(widget.current);
    widget.current = null;
  }, [fail]);
  return { containerRef, getToken, remove };
}
