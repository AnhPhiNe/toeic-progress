import React from 'react';
import { CARD } from '@/shared/ui/surfaces';

interface State {
  failed: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Caught uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ failed: false, error: null });
  };

  private handleGoHome = () => {
    try {
      localStorage.setItem('toeic_active_tab_v1', 'dashboard');
    } catch {
      /* ignore */
    }
    window.location.href = '/';
  };

  private exportLocalData = () => {
    // Export ONLY the active account's (or guest's) own study bundle — never other accounts' bundles or HMAC tickets.
    const activeId = localStorage.getItem('toeic_active_account_v1');
    const bundleKey = activeId ? `toeic_progress_account_${activeId}_v3` : 'toeic_progress_bundle_v3';
    const raw = localStorage.getItem(bundleKey);
    const payload = raw ? { [bundleKey]: raw } : {};
    const file = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'toeic-progress-raw-local-data.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-[#EAEFF5] p-5 text-slate-800 dark:bg-[#0B111E] dark:text-slate-100 flex items-center justify-center">
        <div className={`${CARD} mx-auto max-w-lg w-full space-y-4`} role="alert">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-lg dark:bg-rose-950/60">
              ⚠️
            </span>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white">Không thể mở dữ liệu học tập</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dữ liệu trên máy của bạn vẫn an toàn tuyệt đối</p>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            Ứng dụng chạy offline trên thiết bị của bạn (không yêu cầu máy chủ backend). Đã xảy ra lỗi hiển thị giao diện:
          </p>

          {this.state.error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs font-mono text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              <p className="font-bold">{this.state.error.name}: {this.state.error.message}</p>
              {import.meta.env.DEV && this.state.error.stack && (
                <details className="mt-2 text-[11px] opacity-80 cursor-pointer">
                  <summary className="font-semibold underline">Chi tiết kỹ thuật (Stack trace)</summary>
                  <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 dark:bg-black/30">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer"
            >
              Thử lại ngay
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:border-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              Về Trang chủ
            </button>
            <button
              type="button"
              onClick={this.exportLocalData}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
            >
              Xuất sao lưu
            </button>
          </div>
        </div>
      </div>
    );
  }
}
