import React, { useMemo } from 'react';
import { Brain, Target, TrendingUp, TrendingDown, CheckCircle2, ArrowRight, CalendarDays } from 'lucide-react';
import { StudySession, MistakeEntry, UserProfile } from '../types';
import { buildStudyPlan } from '../utils/studyPlan';
import { getDueMistakes } from '../utils/spacedRepetition';

interface TodayPanelProps {
  profile: UserProfile;
  sessions: StudySession[];
  mistakes: MistakeEntry[];
  onStartReview: () => void;
  onNavigateToPlan: () => void;
  onNavigateToAnalytics: () => void;
  onOpenSettings: () => void;
}

/**
 * Bảng lệnh hôm nay: việc cần làm chiếm vị trí chính, thành tích lùi xuống
 * dải mỏng phía dưới (SPEC mục 4.1).
 *
 * Mỗi dòng là một việc có thể bấm vào làm ngay, không phải con số để ngắm.
 */
export const TodayPanel: React.FC<TodayPanelProps> = ({
  profile,
  sessions,
  mistakes,
  onStartReview,
  onNavigateToPlan,
  onNavigateToAnalytics,
  onOpenSettings
}) => {
  const plan = useMemo(() => buildStudyPlan(profile, sessions, mistakes), [profile, sessions, mistakes]);
  const dueCount = useMemo(() => getDueMistakes(mistakes).length, [mistakes]);

  const rowClass =
    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 min-w-0';

  return (
    <div className="ui-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Hôm nay
        </span>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
          {plan.daysStudiedThisWeek}/7 ngày tuần này
        </span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">

        {/* 1. Thẻ đến hạn ôn */}
        {dueCount > 0 ? (
          <button onClick={onStartReview} className={rowClass}>
            <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 flex-1 min-w-0 truncate">
              <strong className="font-bold">{dueCount} thẻ lỗi</strong> đến hạn ôn
            </span>
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 shrink-0 whitespace-nowrap">
              Ôn ngay <ArrowRight className="w-3 h-3" />
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2.5 px-3 py-2.5 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 min-w-0 truncate">
              Không còn thẻ nào đến hạn ôn
            </span>
          </div>
        )}

        {/* 2. Điểm nghẽn lớn nhất */}
        {plan.bottleneckCause && (
          <button onClick={onNavigateToAnalytics} className={rowClass}>
            <Target className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 flex-1 min-w-0 truncate">
              Điểm nghẽn: <strong className="font-bold">{plan.bottleneckCause.label}</strong>
              <span className="text-slate-500 dark:text-slate-400"> ({plan.bottleneckCause.percent}% số lỗi)</span>
            </span>
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 shrink-0 whitespace-nowrap">
              Xem <ArrowRight className="w-3 h-3" />
            </span>
          </button>
        )}

        {/* 3. Nhịp độ tới ngày thi */}
        {plan.hasExamDate && plan.paceStatus ? (
          <button onClick={onNavigateToPlan} className={rowClass}>
            {plan.paceStatus === 'behind' ? (
              <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 flex-1 min-w-0 truncate">
              Nhịp: cần <strong className="font-bold">{plan.requiredPacePerWeek}đ</strong>/tuần · thực tế{' '}
              <strong className="font-bold">{plan.actualPacePerWeek}đ</strong>
              <span className={
                plan.paceStatus === 'behind'
                  ? 'text-rose-600 dark:text-rose-400 font-semibold'
                  : 'text-emerald-600 dark:text-emerald-400 font-semibold'
              }>
                {plan.paceStatus === 'behind' ? ' — đang chậm' : plan.paceStatus === 'ahead' ? ' — đi trước' : ' — đúng nhịp'}
              </span>
            </span>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0 whitespace-nowrap">
              Kế hoạch <ArrowRight className="w-3 h-3" />
            </span>
          </button>
        ) : (
          <button onClick={plan.hasExamDate ? onNavigateToPlan : onOpenSettings} className={rowClass}>
            <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 flex-1 min-w-0 truncate">
              {plan.hasExamDate
                ? 'Chưa đủ đề Full Test để tính nhịp độ'
                : 'Chưa đặt ngày thi — chưa tính được nhịp cần thiết'}
            </span>
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 shrink-0 whitespace-nowrap">
              {plan.hasExamDate ? 'Kế hoạch' : 'Đặt ngày'} <ArrowRight className="w-3 h-3" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
