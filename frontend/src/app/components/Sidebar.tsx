import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Calculator,
  History,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Target,
  Timer,
  TrendingUp
} from 'lucide-react';
import type { NavTabId, StudySession, UserProfile } from '@/shared/types';
import { profileDisplayName, profileInitials } from './profileInitials';

export interface SidebarProps {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  profile: UserProfile;
  pendingMistakesCount: number;
  /** Reading questions of logged tests still waiting for details; shown as a quiet amber dot on Sổ tay. */
  unfinishedDetailsCount?: number;
  sessions?: StudySession[];
  hasStudiedToday?: boolean;
  onOpenSettings: () => void;
  /** Current theme and its toggle; the toggle lives in the profile menu at the foot of the sidebar. */
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

interface NavItem {
  id: NavTabId;
  label: string;
  fullLabel: string;
  icon: React.ElementType;
  badge?: number;
  pending?: number;
}

const navButton =
  'group relative flex min-h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transition-none';

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  profile,
  pendingMistakesCount,
  unfinishedDetailsCount = 0,
  onOpenSettings,
  theme = 'light',
  onToggleTheme
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) { if (event.key === 'Escape') setMenuOpen(false); return; }
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menuOpen]);
  // Phones (<768px) navigate with MobileNav; this sidebar starts at tablet width.
  // Tablet (768–1023px): thanh bên đầy đủ chiếm 1/3 màn hình, nên luôn thu gọn thành cột icon.
  const tabletQuery = '(min-width: 768px) and (max-width: 1023px)';
  const [isTabletViewport, setIsTabletViewport] = useState(() => window.matchMedia(tabletQuery).matches);
  useEffect(() => {
    const query = window.matchMedia(tabletQuery);
    const onChange = () => setIsTabletViewport(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
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
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      toggleCollapse();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCollapse]);

  const displayName = profileDisplayName(profile.name);
  const initials = profileInitials(profile.name);

  const groups: Array<{ title: string; items: NavItem[] }> = [
    {
      title: 'HÀNH TRÌNH',
      items: [
        { id: 'dashboard', label: 'Tổng quan', fullLabel: 'Tổng quan', icon: LayoutDashboard },
        { id: 'plan', label: 'Kế hoạch', fullLabel: 'Kế hoạch', icon: Target },
        { id: 'exam-mode', label: 'Đồng hồ phòng thi', fullLabel: 'Đồng hồ phòng thi', icon: Timer }
      ]
    },
    {
      title: 'ĐO LƯỜNG & CHẨN ĐOÁN',
      items: [
        { id: 'history', label: 'Lịch sử thi', fullLabel: 'Lịch sử thi', icon: History },
        { id: 'analytics', label: 'Phân tích điểm', fullLabel: 'Phân tích điểm', icon: TrendingUp },
        {
          id: 'mistakes',
          label: 'Sổ tay',
          fullLabel: 'Sổ tay',
          icon: BookOpen,
          badge: pendingMistakesCount > 0 ? pendingMistakesCount : undefined,
          pending: unfinishedDetailsCount > 0 ? unfinishedDetailsCount : undefined
        },
        { id: 'vocabulary', label: 'Từ vựng', fullLabel: 'Từ vựng', icon: BookMarked },
        { id: 'resources', label: 'Quy đổi điểm', fullLabel: 'Quy đổi điểm', icon: Calculator }
      ]
    }
  ];

  const compact = isCollapsed || isTabletViewport;

  return (
    <aside className={'sticky top-0 z-30 hidden h-screen shrink-0 border-r-2 border-slate-900 bg-white p-3.5 text-slate-800 transition-[width] duration-200 motion-reduce:transition-none dark:border-slate-700 dark:bg-[#0B132B] dark:text-slate-100 md:block ' + (compact ? 'w-[72px]' : 'w-[264px]')}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
          <div className={'flex items-center ' + (compact ? 'flex-col gap-2 pb-6' : 'gap-2 pb-7')}>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={'flex min-w-0 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ' + (compact ? 'justify-center' : 'flex-1')}
              aria-label="TOEIC Progress · Tổng quan"
              title={compact ? 'TOEIC Progress' : undefined}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-black tracking-tight border-2 border-slate-900 shadow-[2.5px_2.5px_0px_0px_#0f172a]">
                TP
              </span>
              {!compact && <span className="truncate text-[15px] font-black tracking-tight text-slate-900 dark:text-white">TOEIC Progress</span>}
            </button>
            {isTabletViewport ? null : (
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
                        onClick={() => setActiveTab(item.id)}
                        className={
                          navButton +
                          (compact ? ' justify-center !px-0' : '') +
                          (active
                            ? ' bg-indigo-100 dark:bg-indigo-950/80 text-indigo-950 dark:text-indigo-100 font-black border-2 border-slate-900 dark:border-slate-400 shadow-[2.5px_2.5px_0px_0px_#0f172a] dark:shadow-[2.5px_2.5px_0px_0px_#6366f1]'
                            : ' text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-2 hover:border-slate-900/40 dark:hover:border-slate-600 font-bold border-2 border-transparent')
                        }
                        aria-label={item.fullLabel}
                        aria-describedby={item.pending ? `nav-pending-${item.id}` : undefined}
                        aria-current={active ? 'page' : undefined}
                        title={item.pending ? `${item.pending} câu Reading chưa ghi chi tiết` : compact ? item.fullLabel : undefined}
                      >
                        {item.pending !== undefined && <>
                          <span className={'absolute h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#0B132B] ' + (compact ? 'left-1.5 top-1' : 'left-2 top-1.5')} aria-hidden="true" />
                          <span id={`nav-pending-${item.id}`} className="sr-only">{item.pending} câu Reading chưa ghi chi tiết</span>
                        </>}
                        <span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ' + (active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400 group-hover:text-slate-950 dark:group-hover:text-white')}>
                          <Icon size={17} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                        </span>
                        {!compact && <>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge !== undefined && (
                            <span className="flex min-w-5 items-center justify-center rounded-full border border-rose-300 bg-rose-100 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-rose-800 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-200"
                              aria-label={item.badge + ' lỗi cần ôn'}>
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

        <div ref={menuRef} className={'relative shrink-0 border-t-2 border-slate-900 dark:border-slate-700 pt-3 ' + (compact ? 'mt-4' : 'mt-5')}>
          {menuOpen && (
            <div role="menu" aria-label="Menu hồ sơ"
              className="absolute bottom-full left-0 z-40 mb-2 w-[220px] rounded-[14px] border-2 border-slate-900 bg-white p-1.5 shadow-[3px_3px_0_0_#0f172a] dark:border-slate-300 dark:bg-[#0B132B] dark:shadow-[3px_3px_0_0_#cbd5e1]">
              {onToggleTheme && (
                <button type="button" role="menuitem" onClick={() => { onToggleTheme(); setMenuOpen(false); }}
                  className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-bold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800">
                  {theme === 'dark' ? <Sun size={16} className="text-amber-500" aria-hidden="true" /> : <Moon size={16} className="text-slate-600" aria-hidden="true" />}
                  <span className="flex-1">Chế độ tối</span>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{theme === 'dark' ? 'Bật' : 'Tắt'}</span>
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => { onOpenSettings(); setMenuOpen(false); }}
                className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-bold text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800">
                <Settings size={16} className="text-slate-600 dark:text-slate-300" aria-hidden="true" />
                <span className="flex-1">Cài đặt và sao lưu</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={'group flex min-h-12 w-full items-center rounded-xl text-left outline-none transition-all hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-2 border-transparent hover:border-slate-900 dark:hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900 ' + (compact ? 'justify-center' : 'gap-3 px-2.5 py-1.5')}
            aria-label={'Menu hồ sơ ' + displayName}
            title={compact ? 'Menu hồ sơ' : 'Chế độ tối, cài đặt và sao lưu'}
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
    </aside>
  );
};
