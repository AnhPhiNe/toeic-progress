import React, { useMemo } from 'react';
import { 
  Menu, 
  PlusCircle, 
  Calendar, 
  Sun, 
  Moon, 
  Settings,
  LayoutDashboard, 
  TrendingUp, 
  BookOpen, 
  Target, 
  Timer,
  GraduationCap
} from 'lucide-react';
import { UserProfile, NavTabId } from '../types';

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

  const tabConfig: Record<NavTabId, { title: string; icon: React.ElementType }> = {
    dashboard: {
      title: 'Tổng Quan',
      icon: LayoutDashboard
    },
    analytics: {
      title: 'Phân Tích Điểm Số',
      icon: TrendingUp
    },
    'exam-mode': {
      title: 'Phòng Thi ETS',
      icon: Timer
    },
    mistakes: {
      title: 'Sổ Tay Bắt Bẫy',
      icon: BookOpen
    },
    resources: {
      title: 'Tài Liệu & Quy Đổi',
      icon: GraduationCap
    },
    plan: {
      title: 'Kế Hoạch Ôn Thi',
      icon: Target
    }
  };

  const currentTab = tabConfig[activeTab] || tabConfig.dashboard;
  const TabIcon = currentTab.icon;

  const isExamUrgent = daysUntilExam !== null && daysUntilExam <= 14;

  return (
    // Cùng màu nền trang, không viền, không bóng: topbar là một phần của khung,
    // không phải một thanh trắng thứ ba. Mờ nền để nội dung cuộn qua vẫn đọc được.
    <header className="sticky top-0 z-20 w-full bg-[#EAEFF5]/85 dark:bg-[#0B111E]/85 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-15 gap-2 sm:gap-3">
          
          {/* 1. Left: Mobile menu toggle & Single-line Clean Page Title */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800 transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Mở menu điều hướng"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                <TabIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </div>

              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-none truncate">
                {currentTab.title}
              </h1>
            </div>
          </div>

          {/* 2. Right: D-Day Countdown, Primary Action & Utilities */}
          <div className="flex items-center space-x-2 sm:space-x-2.5 shrink-0">
            
            {/* D-Day Countdown Chip */}
            <button
              onClick={onOpenSettings}
              className={`h-9 flex items-center space-x-1.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer group shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isExamUrgent
                  ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 animate-pulse'
                  : 'bg-white/60 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-800/80 border-transparent text-slate-700 dark:text-slate-200'
              }`}
              title="Đếm ngược ngày thi chính thức (Bấm để đổi ngày thi trong Cài đặt)"
              aria-label={daysUntilExam !== null ? `Đếm ngược ngày thi: D-${daysUntilExam}. Bấm để cài đặt.` : "Chưa đặt ngày thi. Bấm để cài đặt."}
            >
              <Calendar className={`w-4 h-4 ${isExamUrgent ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}`} />
              <span className="text-slate-600 dark:text-slate-300 font-bold hidden sm:inline text-xs">Thi:</span>
              <span className={`font-black ${isExamUrgent ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}`}>
                {daysUntilExam !== null ? `D-${daysUntilExam}` : 'Chưa đặt'}
              </span>
            </button>

            {/* Global Primary Action CTA: Solid Royal Blue */}
            <button
              onClick={onOpenSessionLogger}
              className="h-9 flex items-center space-x-1.5 px-3.5 sm:px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-xs shadow-blue-600/25 transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Ghi nhận điểm thi mới (Phím tắt: N)"
              aria-label="Nhập kết quả đề thi mới, phím tắt N"
            >
              <PlusCircle className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
              <span className="hidden sm:inline">Nhập Điểm</span>
              <span className="sm:hidden">Nhập</span>
              <kbd className="hidden lg:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-black bg-white/20 rounded text-white leading-none ml-0.5">
                N
              </kbd>
            </button>

            {/* Theme Toggle Button: Boxed Squircle Plate */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title={theme === 'dark' ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
              aria-label={theme === 'dark' ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform duration-300" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300 hover:-rotate-12 transition-transform duration-300" />
              )}
            </button>

            {/* Settings Trigger: Boxed Squircle Plate */}
            <button
              onClick={onOpenSettings}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-800 transition cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Cài đặt hệ thống & Quản lý dữ liệu"
              aria-label="Cài đặt hệ thống & Quản lý dữ liệu"
            >
              <Settings className="w-4 h-4 group-hover:rotate-45 transition-transform duration-300" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
