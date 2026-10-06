import React from 'react';
import { CARD } from '@/shared/ui/surfaces';

interface State { failed: boolean }

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  private exportLocalData = () => {
    const saved = Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('toeic_')));
    const file = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'toeic-progress-raw-local-data.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="min-h-screen bg-[#EAEFF5] p-5 text-slate-800 dark:bg-[#0B111E] dark:text-slate-100">
      <div className={`${CARD} mx-auto mt-16 max-w-lg space-y-4`} role="alert">
        <h1 className="text-xl font-bold">Không thể mở dữ liệu học tập</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Dữ liệu trên máy được giữ nguyên. Hãy xuất bản thô trước khi thử tải lại hoặc liên hệ hỗ trợ.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={this.exportLocalData} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Xuất dữ liệu trên máy</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Tải lại</button>
        </div>
      </div>
    </div>;
  }
}
