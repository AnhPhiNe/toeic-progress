import React from 'react';
import { BookOpen, Languages } from 'lucide-react';
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
      className="grid grid-cols-2 rounded-2xl border-2 border-slate-900 bg-slate-100/90 p-1.5 gap-2 dark:border-slate-300 dark:bg-[#162137] shadow-[2px_2px_0_0_#0f172a] dark:shadow-[2px_2px_0_0_#cbd5e1]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'mistakes'}
        onClick={() => {
          triggerHaptic(8);
          if (activeTab !== 'mistakes') onNavigateTab('mistakes');
        }}
        className={`flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-black whitespace-nowrap transition-all duration-150 outline-none ${
          activeTab === 'mistakes'
            ? 'bg-white text-slate-950 shadow-xs border border-slate-200/90 dark:border-slate-700 dark:bg-[#111A2C] dark:text-white'
            : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/50'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-4 w-4 stroke-[2.2]" aria-hidden="true" />
          <span>Câu sai</span>
        </span>
        {count > 0 && (
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-2 text-[11px] font-black tabular-nums transition-colors ${
              dueCount > 0
                ? 'bg-rose-500 text-white'
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
          triggerHaptic(8);
          if (activeTab !== 'vocabulary') onNavigateTab('vocabulary');
        }}
        className={`flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-black whitespace-nowrap transition-all duration-150 outline-none ${
          activeTab === 'vocabulary'
            ? 'bg-white text-slate-950 shadow-xs border border-slate-200/90 dark:border-slate-700 dark:bg-[#111A2C] dark:text-white'
            : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/50'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Languages className="h-4 w-4 stroke-[2.2]" aria-hidden="true" />
          <span>Từ vựng</span>
        </span>
      </button>
    </div>
  );
};
