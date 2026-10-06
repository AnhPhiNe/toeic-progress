import React, { useMemo } from 'react';
import { 
  Menu, 
  PlusCircle, 
  Calendar, 
  Sun, 
  Moon, 
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
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onOpenSessionLogger: () => void;
  onOpenSettings: () => void;
  onToggleMobileMenu: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  activeTab,
  profile,
  hasStudiedToday: _hasStudiedToday = false,
  theme,
  toggleTheme,
  onOpenSessionLogger,
  onOpenSettings,
  onToggleMobileMenu
}) => {
  // Tính D-Day ngày thi
  const daysUntilExam = useMemo(() => {
    if (!profile.examDate) return null;
    const target = new Date(profile.examDate).getTime();
    const now = new Date().getTime();
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : null;
  }, [profile.examDate]);

  const tabConfig: Record<NavTabId, { title: string; category: string; icon: React.ElementType }> = {
    dashboard: {
      title: 'Tổng Quan',
      category: 'Hành trình',
      icon: LayoutDashboard
    },
    plan: {
      title: 'Kế Hoạch Ôn Thi',
      category: 'Hành trình',
      icon: Target
    },
    'exam-mode': {
      title: 'Đồng Hồ Phòng Thi',
      category: 'Hành trình',
      icon: Timer
    },
    history: {
      title: 'Lịch Sử Đề Thi',
      category: 'Đo lường & Chẩn đoán',
      icon: History
    },
    analytics: {
      title: 'Phân Tích Điểm Số',
      category: 'Đo lường & Chẩn đoán',
      icon: TrendingUp
    },
    mistakes: {
      title: 'Sổ Tay Bẫy Sai',
      category: 'Đo lường & Chẩn đoán',
      icon: BookOpen
    },
    vocabulary: {
      title: 'Vốn Từ Vựng',
      category: 'Đo lường & Chẩn đoán',
      icon: BookMarked
    },
    resources: {
      title: 'Quy Đổi Điểm Số',
      category: 'Đo lường & Chẩn đoán',
      icon: Calculator
    }
  };

  const currentTab = tabConfig[activeTab] || tabConfig.dashboard;
  const TabIcon = currentTab.icon;

  const isExamUrgent = daysUntilExam !== null && daysUntilExam <= 14;

  return (
    <header className="sticky top-0 z-20 w-full bg-white dark:bg-[#0B132B] border-b-2 border-slate-900 dark:border-slate-700 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-15 gap-2 sm:gap-3">
          
          {/* 1. Left: Mobile menu toggle & Single-line Clean Page Title */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-2 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              aria-label="Mở menu điều hướng"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-black border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] flex items-center justify-center shrink-0">
                <TabIcon className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="flex items-center space-x-1.5 min-w-0 text-sm">
                <span className="text-slate-500 dark:text-slate-400 font-bold hidden sm:inline">{currentTab.category}</span>
                <span className="text-slate-400 dark:text-slate-600 font-bold hidden sm:inline">/</span>
                <span className="font-black text-slate-950 dark:text-white truncate tracking-tight">
                  {currentTab.title}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Right: D-Day Countdown, Primary Action & Utilities */}
          <div className="flex items-center space-x-2 sm:space-x-2.5 shrink-0">
            
            {/* D-Day Countdown Chip - Neo Brutalism */}
            <button
              onClick={onOpenSettings}
              className={`h-9 flex items-center space-x-1.5 px-3 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0px_0px_#0f172a] text-xs font-bold transition-all cursor-pointer group active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                isExamUrgent
                  ? 'bg-[#FECDD3] text-slate-950 animate-pulse'
                  : 'bg-[#BAE6FD] text-slate-950 hover:bg-[#7dd3fc]'
              }`}
              title="Đếm ngược ngày thi chính thức (Bấm để đổi ngày thi trong Cài đặt)"
              aria-label={daysUntilExam !== null ? `Đếm ngược ngày thi: D-${daysUntilExam}. Bấm để cài đặt.` : "Chưa đặt ngày thi. Bấm để cài đặt."}
            >
              <Calendar className="w-4 h-4 text-slate-950" />
              <span className="text-slate-950 font-bold hidden sm:inline text-xs">Thi:</span>
              <span className="font-black text-slate-950">
                {daysUntilExam !== null ? `D-${daysUntilExam}` : 'Chưa đặt'}
              </span>
            </button>

            {/* Global Primary Action CTA: High Contrast Neo-Brutalist Slate - Clean & Non-glaring */}
            <button
              onClick={onOpenSessionLogger}
              className="h-9 flex items-center space-x-1.5 px-3.5 sm:px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950 font-black text-xs border-2 border-slate-900 dark:border-white shadow-[2.5px_2.5px_0px_0px_#0f172a] dark:shadow-[2.5px_2.5px_0px_0px_#cbd5e1] active:translate-x-[1.5px] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              title="Ghi nhận điểm thi mới (Phím tắt: N)"
              aria-label="Nhập kết quả đề thi mới, phím tắt N"
            >
              <PlusCircle className="w-4 h-4 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
              <span className="hidden sm:inline">Nhập Điểm</span>
              <span className="sm:hidden">Nhập</span>
              <kbd className="hidden lg:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-black bg-slate-800 text-slate-200 dark:bg-slate-200 dark:text-slate-900 rounded border border-slate-700 dark:border-slate-300 leading-none ml-0.5">
                N
              </kbd>
            </button>

            {/* Theme Toggle Button: Neo-Brutalist Box */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-2 border-slate-900 dark:border-slate-200 text-slate-900 dark:text-slate-100 shadow-[2px_2px_0px_0px_#0f172a] dark:shadow-[2px_2px_0px_0px_#cbd5e1] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              title={theme === 'dark' ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
              aria-label={theme === 'dark' ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform duration-300" />
              ) : (
                <Moon className="w-4 h-4 text-slate-900 hover:-rotate-12 transition-transform duration-300" />
              )}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
