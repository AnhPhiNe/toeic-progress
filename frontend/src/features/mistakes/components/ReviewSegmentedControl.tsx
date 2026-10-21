import React from 'react';
import type { NavTabId } from '@/shared/types';

interface ReviewSegmentedControlProps {
  activeTab: 'mistakes' | 'vocabulary';
  onNavigateTab: (tab: NavTabId) => void;
  dueCount?: number;
  totalCount?: number;
}

export const ReviewSegmentedControl: React.FC<ReviewSegmentedControlProps> = ({
  activeTab,
  onNavigateTab,
  dueCount = 0,
  totalCount = 0
}) => {
  const count = dueCount > 0 ? dueCount : totalCount > 0 ? totalCount : 0;

  return (
    <div
      role="tablist"
      aria-label="Trung tâm ôn tập"
      className="grid grid-cols-2 rounded-2xl border-[1.5px] border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900/90"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'mistakes'}
        onClick={() => {
          if (activeTab !== 'mistakes') onNavigateTab('mistakes');
        }}
        className={`flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          activeTab === 'mistakes'
            ? 'border-[1.5px] border-slate-200/90 bg-white text-slate-950 shadow-xs dark:border-slate-700 dark:bg-[#111A2C] dark:text-white dark:shadow-none'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">📖</span>
          <span>Câu sai</span>
        </span>
        {count > 0 && (
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black tabular-nums ${
              dueCount > 0
                ? 'bg-rose-600 text-white'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {count}
          </span>
        )}
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'vocabulary'}
        onClick={() => {
          if (activeTab !== 'vocabulary') onNavigateTab('vocabulary');
        }}
        className={`flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          activeTab === 'vocabulary'
            ? 'border-[1.5px] border-slate-200/90 bg-white text-slate-950 shadow-xs dark:border-slate-700 dark:bg-[#111A2C] dark:text-white dark:shadow-none'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">🔤</span>
          <span>Từ vựng</span>
        </span>
      </button>
    </div>
  );
};
