import React from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import './app-error.css';

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
      <div className="rd pp-crash">
        <div className="pp-crash__card" role="alert">
          <div className="pp-crash__head">
            <Soc state="sad" size={64} coat="nau" />
            <div>
              <h1>Không thể mở dữ liệu học tập</h1>
              <p>Dữ liệu trên máy của bạn vẫn an toàn tuyệt đối</p>
            </div>
          </div>

          <p className="pp-crash__text">
            Ứng dụng chạy offline trên thiết bị của bạn (không yêu cầu máy chủ backend). Đã xảy ra lỗi hiển thị giao diện:
          </p>

          {this.state.error && (
            <div className="pp-crash__error">
              <p className="font-bold">{this.state.error.name}: {this.state.error.message}</p>
              {import.meta.env.DEV && this.state.error.stack && (
                <details className="mt-2 text-[11px] opacity-80 cursor-pointer">
                  <summary className="font-semibold underline">Chi tiết kỹ thuật (Stack trace)</summary>
                  <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          )}

          <div className="pp-crash__actions">
            <button type="button" onClick={this.handleReset} className="rd-btn">Thử lại ngay</button>
            <button type="button" onClick={this.handleGoHome} className="rd-btn rd-btn--white">Về Trang chủ</button>
            <button type="button" onClick={this.exportLocalData} className="pp-crash__link">Xuất sao lưu</button>
          </div>
        </div>
      </div>
    );
  }
}
