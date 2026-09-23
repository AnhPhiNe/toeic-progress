import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  Timer,
  TrendingUp,
  X
} from 'lucide-react';
import type { NavTabId, StudySession, UserProfile } from '../types';

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
  'group relative flex min-h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none';

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
      title: 'Học tập',
      items: [
        { id: 'dashboard', label: 'Tổng quan', fullLabel: 'Tổng Quan', icon: LayoutDashboard },
        { id: 'plan', label: 'Kế hoạch', fullLabel: 'Kế Hoạch', icon: Target },
        { id: 'exam-mode', label: 'Phòng thi', fullLabel: 'Phòng Thi ETS', icon: Timer }
      ]
    },
    {
      title: 'Theo dõi',
      items: [
        { id: 'analytics', label: 'Phân tích', fullLabel: 'Phân Tích Điểm Số', icon: TrendingUp },
        {
          id: 'mistakes',
          label: 'Sổ tay lỗi sai',
          fullLabel: 'Sổ Tay Bắt Bẫy',
          icon: BookOpen,
          badge: pendingMistakesCount > 0 ? pendingMistakesCount : undefined
        },
        { id: 'resources', label: 'Tài liệu', fullLabel: 'Tài Liệu & Quy Đổi', icon: GraduationCap }
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
        <div className={'flex items-center ' + (compact ? 'flex-col gap-2 pb-7' : 'gap-2 pb-8')}>
          <button
            type="button"
            onClick={() => navigate('dashboard', mobile)}
            className={'flex min-w-0 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' + (compact ? 'justify-center' : 'flex-1')}
            aria-label="TOEIC Progress · Tổng quan"
            title={compact ? 'TOEIC Progress' : undefined}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#344A83] text-[13px] font-bold tracking-tight text-white shadow-[0_3px_10px_rgba(38,58,111,0.18)] dark:bg-indigo-500 dark:shadow-none">
              TP
            </span>
            {!compact && <span className="truncate text-[14px] font-bold tracking-tight text-slate-900 dark:text-white">TOEIC Progress</span>}
          </button>
          {mobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Đóng menu"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleCollapse}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label={compact ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              title={compact ? 'Mở rộng (Ctrl+B)' : 'Thu gọn (Ctrl+B)'}
            >
              {compact ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
            </button>
          )}
        </div>

        <div className={compact ? 'space-y-5' : 'space-y-7'}>
          {groups.map((group, groupIndex) => (
            <nav key={group.title} aria-label={group.title}>
              {compact
                ? groupIndex > 0 && <div className="mx-auto mb-3 h-px w-7 bg-slate-200 dark:bg-slate-700" />
                : <p className="mb-2 px-3 text-xs font-semibold tracking-[0.05em] text-slate-500 dark:text-slate-400">{group.title}</p>}
              <div className="space-y-1">
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
                          ? ' bg-white text-slate-900 shadow-[0_2px_10px_rgba(31,45,74,0.08)] dark:bg-slate-800 dark:text-white dark:shadow-none'
                          : ' text-slate-600 hover:bg-white/55 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white')
                      }
                      aria-label={item.fullLabel}
                      aria-current={active ? 'page' : undefined}
                      title={compact ? item.fullLabel : undefined}
                    >
                      {active && <span className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-full bg-indigo-500 dark:bg-indigo-400" aria-hidden="true" />}
                      <span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ' + (active ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400')}>
                        <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      {!compact && <>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-200" aria-label={item.badge + ' lỗi cần ôn'}>
                            {item.badge}
                          </span>
                        )}
                      </>}
                      {compact && item.badge !== undefined && (
                        <span className="absolute -right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white dark:bg-indigo-400 dark:text-slate-950">
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

      <div className={'shrink-0 border-t border-slate-300/50 pt-3 dark:border-slate-800 ' + (compact ? 'mt-4' : 'mt-6')}>
        <button
          type="button"
          onClick={() => openSettings(mobile)}
          className={'group flex min-h-12 w-full items-center rounded-xl text-left outline-none transition-colors hover:bg-white/55 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none dark:hover:bg-slate-800 ' + (compact ? 'justify-center' : 'gap-3 px-2')}
          aria-label={'Cài đặt hồ sơ ' + displayName}
          title={compact ? 'Cài đặt và sao lưu' : 'Cài đặt và sao lưu dữ liệu'}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-bold text-slate-700 dark:bg-slate-700 dark:text-white">{initials}</span>
          {!compact && <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-slate-900 dark:text-white">{displayName}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Mục tiêu {profile.targetScore || 990}đ</span>
            </span>
            <Settings size={17} strokeWidth={1.7} className="shrink-0 text-slate-500 group-hover:text-indigo-600 dark:text-slate-400 dark:group-hover:text-indigo-300" aria-hidden="true" />
          </>}
        </button>
      </div>
    </div>
  );

  return <>
    {/* Khung app cùng màu nền trang (#EAEFF5): trắng chỉ dành cho nội dung.
        Sidebar trắng + topbar trắng + footer trắng từng làm cả màn hình thành
        một mảng trắng chói, không phân biệt được khung và nội dung. */}
    <aside className={'sticky top-0 z-30 hidden h-screen shrink-0 bg-[#EAEFF5] p-3.5 text-slate-800 transition-[width] duration-200 motion-reduce:transition-none dark:bg-[#0B111E] dark:text-slate-100 md:block ' + (isCollapsed ? 'w-[72px]' : 'w-[264px]')}>
      {renderContent(false, isCollapsed)}
    </aside>
    {isMobileOpen && (
      <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Điều hướng">
        <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]" onClick={onCloseMobile} aria-label="Đóng menu điều hướng" />
        <div className="relative h-full w-[280px] max-w-[86vw] bg-[#EAEFF5] p-4 shadow-2xl dark:bg-[#0B111E]">
          {renderContent(true, false)}
        </div>
      </div>
    )}
  </>;
};