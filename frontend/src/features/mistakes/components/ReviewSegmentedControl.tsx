import React from 'react';
import type { NavTabId } from '@/shared/types';
import { triggerHaptic } from '@/shared/lib/haptics';

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
      className="grid grid-cols-2 rounded-2xl border-2 border-slate-900 bg-[#efebe4] p-1.5 gap-1.5 dark:border-slate-300 dark:bg-[#162137]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'mistakes'}
        onClick={() => {
          triggerHaptic(8);
          if (activeTab !== 'mistakes') onNavigateTab('mistakes');
        }}
        className={`flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          activeTab === 'mistakes'
            ? 'border-2 border-slate-900 bg-white text-slate-950 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-white dark:shadow-[2px_2px_0_0_#cbd5e1]'
            : 'border-2 border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">📖</span>
          <span>Câu sai</span>
        </span>
        {count > 0 && (
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-900 px-1.5 text-[10.5px] font-black tabular-nums shadow-[1px_1px_0_0_#0f172a] dark:border-slate-300 dark:shadow-none ${
              dueCount > 0
                ? 'bg-rose-600 text-white'
                : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
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
          triggerHaptic(8);
          if (activeTab !== 'vocabulary') onNavigateTab('vocabulary');
        }}
        className={`flex min-h-[42px] cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          activeTab === 'vocabulary'
            ? 'border-2 border-slate-900 bg-white text-slate-950 shadow-[2px_2px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#111A2C] dark:text-white dark:shadow-[2px_2px_0_0_#cbd5e1]'
            : 'border-2 border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
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
