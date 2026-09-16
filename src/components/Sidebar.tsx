import React from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  BookOpen, 
  Mic, 
  PlusCircle, 
  Settings
} from 'lucide-react';
import { UserProfile } from '../types';

interface SidebarProps {
  activeTab: 'dashboard' | 'analytics' | 'mistakes' | 'sw-roadmap';
  setActiveTab: (tab: 'dashboard' | 'analytics' | 'mistakes' | 'sw-roadmap') => void;
  profile: UserProfile;
  pendingMistakesCount: number;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
  onOpenSessionLogger: () => void;
  onOpenSettings: () => void;
  onResetData?: () => void;
  onLoadDemo?: () => void;
  onImportSuccess?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  profile,
  pendingMistakesCount,
  onOpenSessionLogger,
  onOpenSettings
}) => {

  const navItems = [
    {
      id: 'dashboard' as const,
      label: 'Bảng Chỉ Huy',
      icon: LayoutDashboard,
      description: 'Tổng quan & Kỷ luật'
    },
    {
      id: 'analytics' as const,
      label: 'Phân Tích Chuyên Sâu',
      icon: TrendingUp,
      description: 'Đo lường 7 Part & Lịch sử'
    },
    {
      id: 'mistakes' as const,
      label: 'Sổ Tay Bắt Bẫy',
      icon: BookOpen,
      badge: pendingMistakesCount > 0 ? pendingMistakesCount : undefined,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      description: 'Giải mã câu sai & từ vựng'
    },
    {
      id: 'sw-roadmap' as const,
      label: 'Lộ Trình S&W (400)',
      icon: Mic,
      description: 'Mở rộng Nói & Viết',
      tag: 'Roadmap'
    }
  ];

  return (
    <aside className="w-64 shrink-0 hidden md:flex flex-col justify-between h-screen sticky top-0 bg-[#F8FAFC] dark:bg-[#0E1524] border-r border-slate-200 dark:border-slate-800 p-4 select-none z-30 transition-colors">
      
      {/* Top Part: Logo & Navigation */}
      <div className="space-y-6">
        
        {/* Brand Header */}
        <div className="flex items-center space-x-3 px-2 py-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 text-white font-black text-sm shadow-md shadow-indigo-500/20">
            990
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-slate-900 dark:text-white text-base tracking-tight">TOEIC Progress</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Trạm luyện thi cá nhân</p>
          </div>
        </div>

        {/* Quick Action Button: Log Session */}
        <div>
          <button
            onClick={onOpenSessionLogger}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition active:scale-98 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nhập Kết Quả Đề Thi</span>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Menu Chính
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold shadow-xs border border-slate-200/80 dark:border-indigo-900/50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  {item.badge !== undefined && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  )}
                  {item.tag && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                      {item.tag}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

      </div>

      {/* Bottom Part: User Profile & Quick Settings */}
      <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80">
        <div 
          onClick={onOpenSettings}
          className="group flex items-center justify-between p-2.5 rounded-xl bg-white/80 hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 transition cursor-pointer shadow-xs"
          title="Mở Cài đặt mục tiêu & Quản lý dữ liệu"
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-200/60 dark:border-indigo-800/60">
              {profile.name ? profile.name.trim().charAt(0).toUpperCase() : '990'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {profile.name || 'Học viên'}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                Mục tiêu: <span className="font-bold text-indigo-600 dark:text-indigo-400">{profile.targetScore}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 group-hover:bg-slate-200/60 dark:group-hover:bg-slate-700/60 transition cursor-pointer"
            aria-label="Cài đặt"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

    </aside>
  );
};
