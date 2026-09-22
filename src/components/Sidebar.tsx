import React, { useMemo, useEffect, useId } from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  BookOpen, 
  Settings,
  FileSpreadsheet,
  X,
  Timer,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen,
  Target,
  Database
} from 'lucide-react';
import { UserProfile, StudySession, NavTabId } from '../types';

interface BrandHeaderEmblemProps {
  id: string;
}

const BrandHeaderEmblem: React.FC<BrandHeaderEmblemProps> = ({ id }) => (
  <div className="relative flex items-center justify-center w-9 h-9 rounded-[10px] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-blue-600 dark:via-blue-700 dark:to-indigo-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_2px_8px_rgba(37,99,235,0.28)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_4px_12px_rgba(0,0,0,0.5)] ring-1 ring-black/5 dark:ring-white/10 shrink-0 overflow-hidden transition-all duration-300 group-hover/brand:scale-105 group-hover/brand:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45),0_4px_16px_rgba(37,99,235,0.45)]">
    {/* Specular Ambient Sheen */}
    <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/25 pointer-events-none" />
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.3),transparent_65%)] pointer-events-none" />
    
    {/* Architectural TP Monogram Vector */}
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5 relative z-10 transition-transform duration-300 group-hover/brand:scale-105"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-grad-t`} x1="4" y1="6.5" x2="10.5" y2="17.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E0E7FF" />
        </linearGradient>
        <linearGradient id={`${id}-grad-p`} x1="13.5" y1="6.5" x2="19.5" y2="17.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67E8F9" />
          <stop offset="0.55" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#A5B4FC" />
        </linearGradient>
      </defs>

      {/* Letter T: Symmetrical Crossbar & Vertical Stem */}
      <path
        d="M4 6.5H10.5M7.25 6.5V17.5"
        stroke={`url(#${id}-grad-t)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Letter P: Architectural Bowl & Parallel Stem */}
      <path
        d="M13.5 17.5V6.5H16.5C18.2 6.5 19.5 7.8 19.5 9.75C19.5 11.7 18.2 13 16.5 13H13.5"
        stroke={`url(#${id}-grad-p)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

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

interface NavItemConfig {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  badge?: number;
  tag?: string;
  onClick?: () => void;
}

interface NavGroupConfig {
  title: string;
  countLabel: string;
  items: NavItemConfig[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  profile,
  pendingMistakesCount,
  hasStudiedToday = false,
  onOpenSettings,
  onLoadDemo,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const baseId = useId();
  const targetScore = profile.targetScore || 990;

  // Trạng thái thu gọn Sidebar (Collapsible) - Ghi nhớ vào localStorage
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem('toeic_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('toeic_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Phím tắt Ctrl + B (hoặc Cmd + B) để mở/thu gọn Sidebar nhanh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lắng nghe phím Escape để đóng mobile drawer
  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMobile?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  // Xử lý tên hiển thị học viên để triệt tiêu hoàn toàn sự lặp chữ "TOEIC" với Topbar Brand
  const rawName = profile.name?.trim() || '';
  const displayName = (rawName === 'TOEIC Legend' || !rawName) 
    ? 'Minh Tuấn' 
    : rawName;

  // Tính ký tự Avatar đại diện (1-2 chữ cái của tên học viên)
  const avatarInitials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (displayName.length > 0) {
      return displayName.slice(0, 2).toUpperCase();
    }
    return 'HV';
  }, [displayName]);

  // 2 Nhóm điều hướng chuyên nghiệp, đồng bộ 100% với Topbar và phân bổ đều 4 mục/nhóm
  /**
   * Chỉ những mục là CHỨC NĂNG THẬT mới nằm trong điều hướng (SPEC mục 3.2).
   * Cài đặt và Sao lưu là tiện ích - chúng nằm ở vùng đáy sidebar, không
   * chiếm một dòng ngang hàng với Tổng Quan.
   */
  const navGroups: NavGroupConfig[] = [
    {
      title: 'Luyện Thi & Tiến Độ',
      countLabel: '3 mục',
      items: [
        {
          id: 'dashboard',
          label: 'Tổng Quan',
          icon: LayoutDashboard,
          description: 'Tiến trình điểm & Thói quen'
        },
        {
          id: 'plan',
          label: 'Kế Hoạch',
          icon: Target,
          description: 'Việc cần làm tuần này'
        },
        {
          id: 'exam-mode',
          label: 'Phòng Thi ETS',
          icon: Timer,
          description: 'Mô phỏng áp lực chuẩn ETS',
          tag: "120'"
        }
      ]
    },
    {
      title: 'Phân Tích & Ôn Tập',
      countLabel: '3 mục',
      items: [
        {
          id: 'analytics',
          label: 'Phân Tích Điểm Số',
          icon: TrendingUp,
          description: 'Đo lường 7 Part & Nguyên nhân sai'
        },
        {
          id: 'mistakes',
          label: 'Sổ Tay Bắt Bẫy',
          icon: BookOpen,
          badge: pendingMistakesCount > 0 ? pendingMistakesCount : undefined,
          description: 'Giải mã câu sai & Ôn lại'
        },
        {
          id: 'resources',
          label: 'Tài Liệu & Quy Đổi',
          icon: GraduationCap,
          description: 'Quy đổi điểm, chiến thuật & S&W'
        }
      ]
    }
  ];

  // Component Nội dung bên trong Sidebar (dùng chung cho cả Desktop và Mobile Drawer)
  const SidebarContent = ({ 
    isMobile = false, 
    isCollapsed = false, 
    brandEmblemId, 
    onToggleCollapse 
  }: { 
    isMobile?: boolean; 
    isCollapsed?: boolean; 
    brandEmblemId: string; 
    onToggleCollapse?: () => void;
  }) => (
    <div className="flex flex-col h-full justify-between select-none overflow-y-auto no-scrollbar">
      
      {/* 1. TOP & NAVIGATION (Top Section) */}
      <div className="flex flex-col min-h-0 space-y-3">
        
        {/* Brand Header */}
        {isCollapsed ? (
          <div className="flex flex-col items-center w-full space-y-2 pt-1 pb-1">
            {/* Monogram Emblem */}
            <button
              onClick={() => {
                setActiveTab('dashboard');
                if (isMobile && onCloseMobile) onCloseMobile();
              }}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform hover:scale-105 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="TOEIC Progress • Về Bảng Chỉ Huy"
              aria-label="TOEIC Progress • Về Bảng Chỉ Huy"
            >
              <BrandHeaderEmblem id={brandEmblemId} />
            </button>

            {/* Expand Toggle Button - Aligned symmetrically */}
            <button
              onClick={onToggleCollapse}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition cursor-pointer"
              title="Mở rộng thanh bên (Ctrl+B)"
              aria-label="Mở rộng thanh bên"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                if (isMobile && onCloseMobile) onCloseMobile();
              }}
              className="group/brand flex-1 flex items-center space-x-2.5 px-2 py-1.5 rounded-xl text-left cursor-pointer transition-all hover:bg-slate-100/70 dark:hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-w-0"
              title="TOEIC Progress • Về Bảng Chỉ Huy"
            >
              <BrandHeaderEmblem id={brandEmblemId} />

              <div className="flex flex-col justify-center min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-slate-900 dark:text-white text-[13.5px] sm:text-sm tracking-tight truncate leading-tight group-hover/brand:text-blue-600 dark:group-hover/brand:text-blue-400 transition-colors">
                    TOEIC Progress
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold font-mono tracking-wider uppercase bg-blue-600/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-300/60 dark:border-blue-500/30 leading-none shrink-0 select-none">
                    PRO
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5 leading-normal tracking-tight group-hover/brand:text-slate-800 dark:group-hover/brand:text-slate-300 transition-colors">
                  Trạm luyện thi cá nhân
                </p>
              </div>
            </button>

            {/* Collapse button for Desktop */}
            {!isMobile && onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition cursor-pointer shrink-0 ml-1"
                title="Thu gọn Sidebar (Ctrl+B)"
                aria-label="Thu gọn thanh điều hướng"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}

            {/* Close button for Mobile Drawer */}
            {isMobile && onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800 transition cursor-pointer shrink-0 ml-1"
                aria-label="Đóng menu"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Grouped Navigation */}
        <div className="space-y-4 sm:space-y-5">
          {navGroups.map((group, groupIdx) => (
            <nav key={groupIdx} className="space-y-1">
              {/* Group Title (Only in Expanded Mode) */}
              {!isCollapsed ? (
                <div className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.title}
                </div>
              ) : (
                groupIdx > 0 && <div className="w-7 h-px bg-slate-200 dark:bg-slate-800 my-2 mx-auto" />
              )}

              {/* Group Items */}
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                if (isCollapsed) {
                  return (
                    <div key={item.id} className="relative group/nav flex justify-center w-full my-0.5">
                      <button
                        onClick={() => {
                          if (item.onClick) {
                            item.onClick();
                          } else {
                            setActiveTab(item.id as NavTabId);
                          }
                          if (isMobile && onCloseMobile) onCloseMobile();
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/60 shadow-2xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                        }`}
                        aria-label={item.label}
                      >
                        <Icon className="w-4 h-4" />

                        {/* Polished numeric badge */}
                        {item.badge !== undefined && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white dark:ring-[#0E1526] shadow-2xs">
                            {item.badge}
                          </span>
                        )}
                      </button>

                      {/* Floating Tooltip */}
                      <div className="absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/nav:opacity-100 translate-x-1 group-hover/nav:translate-x-0 transition-all duration-150 flex items-center space-x-2">
                        <span>{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-amber-500 text-white leading-tight">
                            {item.badge}
                          </span>
                        )}
                        {item.tag && (
                          <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-slate-700 text-slate-200 leading-tight">
                            {item.tag}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.onClick) {
                        item.onClick();
                      } else {
                        setActiveTab(item.id as NavTabId);
                      }
                      if (isMobile && onCloseMobile) onCloseMobile();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-full h-10 flex items-center justify-between px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isActive
                        ? 'bg-blue-50/90 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-200/80 dark:border-blue-800/60 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate min-w-0">
                      <div className={`p-0.5 rounded-md transition-colors shrink-0 ${
                        isActive 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="truncate">{item.label}</span>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0 ml-1.5">
                      {item.badge !== undefined && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/60 shadow-2xs">
                          {item.badge}
                        </span>
                      )}
                      {item.tag && (
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {item.tag}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </nav>
          ))}
        </div>

      </div>

      {/* 2. BOTTOM SECTION: Learner Profile & Utilities */}
      {isCollapsed ? (
        <div className="pt-2 space-y-2 border-t border-slate-200 dark:border-slate-800 flex flex-col items-center w-full">
          {/* Collapsed Learner Avatar */}
          <div className="relative group/profile flex justify-center w-full">
            <button
              onClick={() => {
                onOpenSettings();
                if (isMobile && onCloseMobile) onCloseMobile();
              }}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition cursor-pointer"
              aria-label="Cài đặt hồ sơ học viên"
            >
              <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 via-indigo-100 to-sky-100 dark:from-blue-950 dark:via-indigo-900/60 dark:to-sky-950 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center ring-1 ring-blue-300/80 dark:ring-blue-800/80 shadow-2xs">
                {avatarInitials}
                <span 
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#0E1526] ${
                    hasStudiedToday ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} 
                  title={hasStudiedToday ? "Đã học hôm nay" : "Chưa học hôm nay"}
                />
              </div>
            </button>

            {/* Tooltip for profile */}
            <div className="absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/profile:opacity-100 translate-x-1 group-hover/profile:translate-x-0 transition-all duration-150">
              <span>{displayName} • Học viên</span>
            </div>
          </div>

          {/* Collapsed Demo Button */}
          {onLoadDemo && (
            <div className="relative group/demo flex justify-center w-full">
              <button
                onClick={onLoadDemo}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-slate-100/70 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Nạp lại dữ liệu đề thi mẫu ETS"
                aria-label="Nạp lại dữ liệu đề thi mẫu"
              >
                <FileSpreadsheet className="w-4 h-4" />
              </button>
              <div className="absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover/demo:opacity-100 translate-x-1 group-hover/demo:translate-x-0 transition-all duration-150">
                <span>Dữ liệu mẫu Demo</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="pt-2.5 space-y-2 border-t border-slate-200 dark:border-slate-800">
          {/* Learner Profile Card: Clean Bento Plate */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => {
              onOpenSettings();
              if (isMobile && onCloseMobile) onCloseMobile();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenSettings();
                if (isMobile && onCloseMobile) onCloseMobile();
              }
            }}
            className="group flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-300 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-slate-800 dark:text-white"
            title={`${displayName} • Mục tiêu ${targetScore}đ${profile.motto ? ` • "${profile.motto}"` : ''}`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              {/* Student Monogram Circle with Status Dot */}
              <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 via-indigo-100 to-sky-100 dark:from-blue-950 dark:via-indigo-900/60 dark:to-sky-950 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 ring-1 ring-blue-200/80 dark:ring-blue-800/80 shadow-2xs">
                {avatarInitials}
                <span 
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                    hasStudiedToday ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} 
                  title={hasStudiedToday ? "Đã học hôm nay" : "Chưa học hôm nay"}
                />
              </div>

              {/* Learner Details */}
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {displayName}
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-medium">
                  Học viên · Mục tiêu {targetScore}đ
                </p>
              </div>
            </div>

            {/* Settings Trigger Icon */}
            <div 
              className="p-1 rounded-md text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/60 transition-all shrink-0 ml-1"
              aria-label="Cài đặt hồ sơ"
            >
              <Settings className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform duration-300" />
            </div>
          </div>

          {/* Vùng tiện ích: Cài đặt & Sao lưu KHÔNG phải chức năng nên không
              nằm trong danh sách điều hướng phía trên (SPEC mục 3.2) */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              onClick={() => {
                onOpenSettings();
                if (isMobile && onCloseMobile) onCloseMobile();
              }}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer min-w-0"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Cài đặt</span>
            </button>
            <button
              onClick={() => {
                onOpenSettings();
                if (isMobile && onCloseMobile) onCloseMobile();
              }}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer min-w-0"
            >
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Sao lưu</span>
            </button>
          </div>

          {/* Clean Subtle Footer Info */}
          {onLoadDemo && (
            <div className="flex items-center justify-between px-1.5 pt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              <button
                onClick={onLoadDemo}
                className="flex items-center space-x-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer font-medium"
                title="Nạp lại dữ liệu đề thi mẫu ETS"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                <span>Nạp dữ liệu mẫu</span>
              </button>
              <span className="text-[10px] font-mono text-slate-400/80 dark:text-slate-500">
                v2.4
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );

  return (
    <>
      {/* Desktop Docked Sidebar (Seamlessly attached to window edges) */}
      <aside 
        className={`shrink-0 hidden md:flex flex-col justify-between sticky top-0 h-screen bg-white dark:bg-[#0E1526] border-r border-slate-200 dark:border-slate-800 ${
          isCollapsed ? 'w-[68px] p-2.5' : 'w-64 p-3'
        } z-30 text-slate-800 dark:text-slate-100 transition-all duration-300 ease-in-out select-none`}
      >
        <SidebarContent 
          isMobile={false} 
          isCollapsed={isCollapsed} 
          brandEmblemId={`${baseId}-d`} 
          onToggleCollapse={toggleCollapse} 
        />
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={onCloseMobile} 
          />
          {/* Drawer Container */}
          <div className="relative w-64 max-w-[80vw] bg-white dark:bg-[#0E1526] h-full shadow-2xl z-10 flex flex-col justify-between p-3.5 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 transition-colors overflow-y-auto">
            <SidebarContent 
              isMobile={true} 
              isCollapsed={false} 
              brandEmblemId={`${baseId}-m`} 
            />
          </div>
        </div>
      )}
    </>
  );
};
