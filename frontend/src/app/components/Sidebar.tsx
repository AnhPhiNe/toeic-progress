import React, { useCallback, useEffect, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Calculator,
  History,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  Timer,
  TrendingUp,
  X
} from 'lucide-react';
import type { NavTabId, StudySession, UserProfile } from '@/shared/types';

export interface SidebarProps {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  profile: UserProfile;
  pendingMistakesCount: number;
  sessions?: StudySession[];
  hasStudiedToday?: boolean;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
  onOpenSessionLogger: () => void;
  onOpenSettings: () => void;
  onResetData?: () => void;
  onLoadDemo?: () => void;
  onImportSuccess?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: NavTabId;
  label: string;
  fullLabel: string;
  icon: React.ElementType;
  badge?: number;
}

const navButton =
  'group relative flex min-h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transition-none';

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  profile,
  pendingMistakesCount,
  onOpenSettings,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('toeic_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(previous => {
      const next = !previous;
      try {
        localStorage.setItem('toeic_sidebar_collapsed', String(next));
      } catch {
        // Navigation still works if storage is unavailable.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileOpen) onCloseMobile?.();
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      toggleCollapse();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileOpen, onCloseMobile, toggleCollapse]);

  const displayName = profile.name?.trim() || 'Học viên';
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const initials = nameParts.length >= 2
    ? (nameParts[nameParts.length - 2][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
    : displayName.slice(0, 2).toUpperCase();

  const groups: Array<{ title: string; items: NavItem[] }> = [
    {
      title: 'HÀNH TRÌNH',
      items: [
        { id: 'dashboard', label: 'Tổng quan', fullLabel: 'Tổng Quan', icon: LayoutDashboard },
        { id: 'plan', label: 'Kế hoạch', fullLabel: 'Kế Hoạch', icon: Target },
        { id: 'exam-mode', label: 'Đồng hồ phòng thi', fullLabel: 'Đồng Hồ Phòng Thi', icon: Timer }
      ]
    },
    {
      title: 'ĐO LƯỜNG & CHẨN ĐOÁN',
      items: [
        { id: 'history', label: 'Lịch sử thi', fullLabel: 'Lịch Sử Đề Thi', icon: History },
        { id: 'analytics', label: 'Phân tích điểm', fullLabel: 'Phân Tích Điểm Số', icon: TrendingUp },
        {
          id: 'mistakes',
          label: 'Sổ tay bẫy sai',
          fullLabel: 'Sổ Tay Bẫy Sai',
          icon: BookOpen,
          badge: pendingMistakesCount > 0 ? pendingMistakesCount : undefined
        },
        { id: 'vocabulary', label: 'Vốn từ vựng', fullLabel: 'Vốn Từ Vựng TOEIC', icon: BookMarked },
        { id: 'resources', label: 'Quy đổi điểm số', fullLabel: 'Thang Quy Đổi ETS', icon: Calculator }
      ]
    }
  ];

  const navigate = (id: NavTabId, mobile: boolean) => {
    setActiveTab(id);
    if (mobile) onCloseMobile?.();
  };

  const openSettings = (mobile: boolean) => {
    onOpenSettings();
    if (mobile) onCloseMobile?.();
  };

  const renderContent = (mobile: boolean, compact: boolean) => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <div className={'flex items-center ' + (compact ? 'flex-col gap-2 pb-6' : 'gap-2 pb-7')}>
          <button
            type="button"
            onClick={() => navigate('dashboard', mobile)}
            className={'flex min-w-0 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ' + (compact ? 'justify-center' : 'flex-1')}
            aria-label="TOEIC Progress · Tổng quan"
            title={compact ? 'TOEIC Progress' : undefined}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-black tracking-tight border-2 border-slate-900 shadow-[2.5px_2.5px_0px_0px_#0f172a]">
              TP
            </span>
            {!compact && <span className="truncate text-[15px] font-black tracking-tight text-slate-900 dark:text-white">TOEIC Progress</span>}
          </button>
          {mobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] hover:bg-rose-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
              aria-label="Đóng menu"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleCollapse}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-slate-900 bg-white text-slate-900 shadow-[2px_2px_0px_0px_#0f172a] hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
              aria-label={compact ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              title={compact ? 'Mở rộng (Ctrl+B)' : 'Thu gọn (Ctrl+B)'}
            >
              {compact ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
            </button>
          )}
        </div>

        <div className={compact ? 'space-y-4' : 'space-y-6'}>
          {groups.map((group, groupIndex) => (
            <nav key={group.title} aria-label={group.title}>
              {compact
                ? groupIndex > 0 && <div className="mx-auto mb-3 h-0.5 w-7 bg-slate-900 dark:bg-slate-700" />
                : <p className="mb-2 px-3 text-[10px] font-black tracking-[0.1em] uppercase text-slate-600 dark:text-slate-400">{group.title}</p>}
              <div className="space-y-1.5">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.id, mobile)}
                      className={
                        navButton +
                        (compact ? ' justify-center !px-0' : '') +
                        (active
                          ? ' bg-indigo-100 dark:bg-indigo-950/80 text-indigo-950 dark:text-indigo-100 font-black border-2 border-slate-900 dark:border-slate-400 shadow-[2.5px_2.5px_0px_0px_#0f172a] dark:shadow-[2.5px_2.5px_0px_0px_#6366f1]'
                          : ' text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-2 hover:border-slate-900/40 dark:hover:border-slate-600 font-bold border-2 border-transparent')
                      }
                      aria-label={item.fullLabel}
                      aria-current={active ? 'page' : undefined}
                      title={compact ? item.fullLabel : undefined}
                    >
                      <span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ' + (active ? 'bg-indigo-600 text-white border border-slate-900 dark:border-slate-700 shadow-[1px_1px_0px_0px_#0f172a]' : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-950 dark:group-hover:text-white')}>
                        <Icon size={17} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                      </span>
                      {!compact && <>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span className={`flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums border border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] ${
                            active 
                              ? 'bg-rose-300 text-slate-950' 
                              : 'bg-rose-100 text-slate-950'
                          }`} aria-label={item.badge + ' lỗi cần ôn'}>
                            {item.badge}
                          </span>
                        )}
                      </>}
                      {compact && item.badge !== undefined && (
                        <span className="absolute -right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 border border-slate-900 px-1 text-[9px] font-black text-white shadow-xs">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>
          ))}
        </div>
      </div>

      <div className={'shrink-0 border-t-2 border-slate-900 dark:border-slate-700 pt-3 ' + (compact ? 'mt-4' : 'mt-5')}>
        <button
          type="button"
          onClick={() => openSettings(mobile)}
          className={'group flex min-h-12 w-full items-center rounded-xl text-left outline-none transition-all hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-2 border-transparent hover:border-slate-900 dark:hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900 ' + (compact ? 'justify-center' : 'gap-3 px-2.5 py-1.5')}
          aria-label={'Cài đặt hồ sơ ' + displayName}
          title={compact ? 'Cài đặt và sao lưu' : 'Cài đặt và sao lưu dữ liệu'}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#DDD6FE] text-slate-950 font-black border-2 border-slate-900 shadow-[1.5px_1.5px_0px_0px_#0f172a] text-[12px]">{initials}</span>
          {!compact && <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-black text-slate-900 dark:text-white transition-colors">{displayName}</span>
              <span className="block text-[11px] text-slate-600 dark:text-slate-400 font-bold">Mục tiêu {profile.targetScore || 990}đ</span>
            </span>
            <Settings size={17} strokeWidth={2} className="shrink-0 text-slate-600 dark:text-slate-400 group-hover:text-slate-950 dark:group-hover:text-white group-hover:rotate-45 transition-all duration-200" aria-hidden="true" />
          </>}
        </button>
      </div>
    </div>
  );

  return <>
    <aside className={'sticky top-0 z-30 hidden h-screen shrink-0 border-r-2 border-slate-900 bg-white p-3.5 text-slate-800 transition-[width] duration-200 motion-reduce:transition-none dark:border-slate-700 dark:bg-[#0B132B] dark:text-slate-100 md:block ' + (isCollapsed ? 'w-[72px]' : 'w-[264px]')}>
      {renderContent(false, isCollapsed)}
    </aside>
    {isMobileOpen && (
      <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Điều hướng">
        <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onCloseMobile} aria-label="Đóng menu điều hướng" />
        <div className="relative h-full w-[280px] max-w-[86vw] border-r-2 border-slate-900 dark:border-slate-700 bg-white dark:bg-[#0B132B] p-4 shadow-2xl text-slate-800 dark:text-slate-100">
          {renderContent(true, false)}
        </div>
      </div>
    )}
  </>;
};