import React, { useMemo } from 'react';
import { 
  PlusCircle, 
  LayoutDashboard, 
  TrendingUp, 
  BookOpen, 
  Target, 
  Timer, 
  History, 
  Calculator,
  BookMarked
} from 'lucide-react';
import { UserProfile, NavTabId } from '@/shared/types';

export interface TopbarProps {
  activeTab: NavTabId;
  setActiveTab?: (tab: NavTabId) => void;
  profile: UserProfile;
  hasStudiedToday?: boolean;
  /** Theme now lives in the sidebar's profile menu; kept optional so existing callers still compile. */
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
  onOpenSessionLogger: () => void;
  onOpenSettings: () => void;
  syncIndicator?: React.ReactNode;
  /** Phone-only avatar that opens settings and carries the sync status dot. */
  accountButton?: React.ReactNode;
  /** Phone-only streak flame shown before the exam countdown. */
  streakButton?: React.ReactNode;
}

export const Topbar: React.FC<TopbarProps> = ({
  activeTab,
  profile,
  hasStudiedToday: _hasStudiedToday = false,
  onOpenSessionLogger,
  onOpenSettings,
  syncIndicator,
  accountButton,
  streakButton
}) => {
  // Tính D-Day ngày thi
  const daysUntilExam = useMemo(() => {
    if (!profile.examDate) return null;
    const target = new Date(profile.examDate).getTime();
    const now = new Date().getTime();
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : null;
  }, [profile.examDate]);

  const tabConfig: Record<NavTabId, { title: string; short: string; category: string; icon: React.ElementType }> = {
    dashboard: {
      title: 'Tổng quan',
      short: 'Tổng quan',
      category: 'Hành trình',
      icon: LayoutDashboard
    },
    plan: {
      title: 'Kế hoạch',
      short: 'Kế hoạch',
      category: 'Hành trình',
      icon: Target
    },
    'exam-mode': {
      title: 'Đồng hồ phòng thi',
      short: 'Đồng hồ',
      category: 'Hành trình',
      icon: Timer
    },
    history: {
      title: 'Lịch sử thi',
      short: 'Lịch sử',
      category: 'Đo lường & chẩn đoán',
      icon: History
    },
    analytics: {
      title: 'Phân tích điểm',
      short: 'Phân tích',
      category: 'Đo lường & chẩn đoán',
      icon: TrendingUp
    },
    mistakes: {
      title: 'Sổ tay',
      short: 'Sổ tay',
      category: 'Đo lường & chẩn đoán',
      icon: BookOpen
    },
    vocabulary: {
      title: 'Từ vựng',
      short: 'Từ vựng',
      category: 'Đo lường & chẩn đoán',
      icon: BookMarked
    },
    resources: {
      title: 'Quy đổi điểm',
      short: 'Quy đổi',
      category: 'Đo lường & chẩn đoán',
      icon: Calculator
    }
  };

  const currentTab = tabConfig[activeTab] || tabConfig.dashboard;

  const isExamUrgent = daysUntilExam !== null && daysUntilExam <= 14;

  return (
    <header className="sticky top-0 z-20 w-full bg-white dark:bg-[#0B132B] border-b-2 border-slate-900 dark:border-slate-700 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 sm:gap-x-3">
          
          {/* 1. Left: Single-line page title (phones show it large; navigation lives in the bottom bar) */}
          <div className="flex min-h-14 items-center space-x-2.5 sm:min-h-15 sm:space-x-3 min-w-0">
            <div className="flex items-center min-w-0">
              {/* Chỉ tên trang: nhóm điều hướng đã có ở thanh bên nên không lặp lại ở đây */}
              <span className="min-w-0 truncate whitespace-nowrap font-black tracking-tight text-slate-950 dark:text-white">
                <span className="md:hidden text-[22px] leading-none">{currentTab.short}</span>
                <span className="hidden md:inline text-[20px] leading-none">{currentTab.title}</span>
              </span>
            </div>
          </div>

          {/* 2. Right: D-Day Countdown, Primary Action & Utilities */}
          <div className="flex items-center space-x-2 sm:space-x-2.5 shrink-0">
            
            {streakButton && <div className="md:hidden">{streakButton}</div>}

            {/* Đếm ngược ngày thi: chữ thường (vẫn bấm được để đổi ngày), không khung như nút */}
            <button
              onClick={onOpenSettings}
              className={`h-9 rounded-lg px-2 text-[13px] font-bold transition-colors cursor-pointer whitespace-nowrap hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                isExamUrgent ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-200'
              }`}
              title="Đếm ngược ngày thi chính thức (Bấm để đổi ngày thi trong Cài đặt)"
              aria-label={daysUntilExam !== null ? `Còn ${daysUntilExam} ngày thi. Bấm để cài đặt.` : "Chưa đặt ngày thi. Bấm để cài đặt."}
            >
              {daysUntilExam !== null
                ? <>Còn <span className="font-black text-slate-950 dark:text-white">{daysUntilExam} ngày</span> thi</>
                : 'Chưa đặt ngày thi'}
            </button>

            {/* Global Primary Action CTA: High Contrast Neo-Brutalist Slate - Clean & Non-glaring */}
            <button
              onClick={onOpenSessionLogger}
              className="h-9 hidden md:flex items-center space-x-1.5 px-3.5 sm:px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs border-2 border-slate-900 dark:border-slate-200 shadow-[2.5px_2.5px_0px_0px_#0f172a] dark:shadow-[2.5px_2.5px_0px_0px_#cbd5e1] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              title="Ghi điểm (phím tắt N)"
              aria-label="Ghi điểm, phím tắt N"
            >
              <PlusCircle className="w-4 h-4 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
              <span>Ghi điểm</span>
            </button>
            {accountButton && <div className="md:hidden">{accountButton}</div>}
          </div>

          {syncIndicator && <div className="hidden min-h-8 items-center justify-end md:flex">{syncIndicator}</div>}
        </div>
      </div>
    </header>
  );
};
