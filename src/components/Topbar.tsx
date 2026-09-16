import React from 'react';
import { 
  Menu, 
  PlusCircle, 
  Calendar, 
  Flame, 
  Sun, 
  Moon, 
  Settings
} from 'lucide-react';
import { UserProfile } from '../types';

interface TopbarProps {
  activeTab: 'dashboard' | 'analytics' | 'mistakes' | 'sw-roadmap';
  setActiveTab: (tab: 'dashboard' | 'analytics' | 'mistakes' | 'sw-roadmap') => void;
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
  setActiveTab: _setActiveTab,
  profile,
  hasStudiedToday,
  theme,
  toggleTheme,
  onOpenSessionLogger,
  onOpenSettings,
  onToggleMobileMenu
}) => {
  // Tính D-Day
  const daysUntilExam = React.useMemo(() => {
    if (!profile.examDate) return null;
    const target = new Date(profile.examDate).getTime();
    const now = new Date().getTime();
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [profile.examDate]);

  const titles = {
    dashboard: 'Bảng Chỉ Huy Luyện Thi',
    analytics: 'Phân Tích & Chẩn Đoán Năng Lực',
    mistakes: 'Sổ Tay Bắt Bẫy Đề Thi',
    'sw-roadmap': 'Lộ Trình Speaking & Writing'
  };

  const subtitles = {
    dashboard: 'Tổng quan tiến độ & mục tiêu 990',
    analytics: 'Đo lường 7 Part & lịch sử làm đề',
    mistakes: 'Giải mã bẫy câu hỏi & củng cố kiến thức',
    'sw-roadmap': 'Lộ trình mở rộng Nói & Viết 400'
  };

  return (
    <header className="sticky top-0 z-20 w-full bg-white/95 dark:bg-[#0B111E]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          
          {/* Left: Mobile hamburger & Page title + subtitle */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                {titles[activeTab]}
              </h1>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:block">
                {subtitles[activeTab]}
              </p>
            </div>
          </div>

          {/* Right: Countdown, Study Status, Theme Toggle, Action Button */}
          <div className="flex items-center space-x-2 sm:space-x-2.5">
            
            {/* Countdown Badge */}
            {daysUntilExam !== null && (
              <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>Thi: <strong className="text-indigo-600 dark:text-indigo-400">D-{daysUntilExam}</strong></span>
              </div>
            )}

            {/* Streak mobile pill */}
            <div className="flex md:hidden items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900 text-xs font-bold shadow-xs">
              <Flame className="w-3.5 h-3.5 fill-current" />
              <span>{profile.currentStreak}</span>
            </div>

            {/* Daily Study Status Pill Badge */}
            {hasStudiedToday !== undefined && (
              <div 
                className={`hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold select-none shadow-xs transition-colors ${
                  hasStudiedToday
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/80 text-amber-800 dark:text-amber-300'
                }`}
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                    hasStudiedToday ? 'bg-emerald-400' : 'bg-amber-400'
                  }`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    hasStudiedToday ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} />
                </span>
                <span>{hasStudiedToday ? 'Đã học hôm nay ✓' : 'Chưa học hôm nay'}</span>
              </div>
            )}

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent hover:border-slate-200/60 dark:hover:border-slate-700/60 transition cursor-pointer"
              title="Đổi giao diện Sáng / Tối"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-500" />
              )}
            </button>

            {/* Primary Action Button: Always full text */}
            <button
              onClick={onOpenSessionLogger}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-sm shadow-indigo-600/25 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nhập Điểm</span>
            </button>

            {/* Settings (Mobile only) */}
            <button
              onClick={onOpenSettings}
              className="md:hidden p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Settings className="w-4 h-4" />
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
