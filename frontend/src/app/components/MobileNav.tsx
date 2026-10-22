import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  BookmarkPlus,
  Calculator,
  ChevronRight,
  FileCheck2,
  History,
  Languages,
  LayoutDashboard,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  Target,
  Timer,
  TrendingUp,
  X
} from 'lucide-react';
import type { NavTabId } from '@/shared/types';
import { useModalA11y } from '@/shared/hooks/useModalA11y';

interface MobileNavProps {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  dueMistakesCount: number;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onOpenSettings: () => void;
  onRecordSession: () => void;
  onRecordMistake: () => void;
  onRecordVocab: () => void;
}

type SheetId = 'record' | 'more' | null;

const MORE_PAGES: Array<{ id: NavTabId; label: string; icon: React.ElementType }> = [
  { id: 'plan', label: 'Kế hoạch học', icon: Target },
  { id: 'exam-mode', label: 'Đồng hồ Pacing', icon: Timer },
  { id: 'vocabulary', label: 'Sổ từ vựng', icon: BookOpen },
  { id: 'history', label: 'Lịch sử đề thi', icon: History },
  { id: 'resources', label: 'Quy đổi điểm', icon: Calculator }
];

/** Phone-only navigation: four destinations and one "+" that gathers every way to record study. */
export function MobileNav({ activeTab, setActiveTab, dueMistakesCount, theme, toggleTheme, onOpenSettings, onRecordSession, onRecordMistake, onRecordVocab }: MobileNavProps) {
  const [sheet, setSheet] = useState<SheetId>(null);
  const close = () => setSheet(null);

  // Rotating a tablet past 768px swaps this bar for the sidebar; drop any open sheet with it.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const onChange = () => { if (query.matches) setSheet(null); };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const go = (tab: NavTabId) => { setActiveTab(tab); close(); };
  const run = (action: () => void) => { close(); action(); };
  const moreActive = MORE_PAGES.some(page => page.id === activeTab);

  const navItem = (label: string, Icon: React.ElementType, active: boolean, onClick: () => void, extra?: React.ReactNode, props?: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} aria-current={active && !props?.['aria-haspopup'] ? 'page' : undefined} {...props}
      className={'relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 cursor-pointer ' + (active ? 'text-slate-950 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
      <span className={'flex h-8 w-12 items-center justify-center rounded-xl transition-colors ' + (active ? 'bg-indigo-100 dark:bg-indigo-950' : '')}>
        <Icon size={21} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
      </span>
      {label}
      {extra}
    </button>
  );

  return <>
    <nav aria-label="Điều hướng chính" className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-slate-900 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-700 dark:bg-[#0B132B] md:hidden">
      <div className="grid h-16 grid-cols-5">
        {navItem('Tổng quan', LayoutDashboard, activeTab === 'dashboard', () => go('dashboard'))}
        {navItem('Ôn tập', BookOpen, activeTab === 'mistakes' || activeTab === 'vocabulary', () => go('mistakes'),
          dueMistakesCount > 0 && <span className="absolute left-1/2 top-1.5 ml-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white tabular-nums" aria-hidden="true">{dueMistakesCount}</span>,
          dueMistakesCount > 0 ? { 'aria-label': `Ôn tập, ${dueMistakesCount} câu cần ôn` } : undefined)}
        <div className="flex items-center justify-center">
          <button type="button" onClick={() => setSheet('record')} aria-label="Ghi lại kết quả học" aria-haspopup="dialog"
            className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-900 bg-blue-600 text-white shadow-[2px_2px_0_0_#0f172a] outline-none active:translate-x-px active:translate-y-px active:shadow-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:border-slate-200 dark:shadow-none cursor-pointer">
            <Plus size={26} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
        {navItem('Phân tích', TrendingUp, activeTab === 'analytics', () => go('analytics'))}
        {navItem('Thêm', Menu, moreActive, () => setSheet('more'), undefined, { 'aria-haspopup': 'dialog', 'aria-label': 'Thêm trang và cài đặt' })}
      </div>
    </nav>

    {sheet === 'record' && (
      <Sheet title="Ghi lại" onClose={close}>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {[
            { label: 'Điểm đề thi', hint: 'Full Test hoặc luyện Part', icon: FileCheck2, tone: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200', action: onRecordSession },
            { label: 'Câu sai', hint: 'Dán câu hỏi và ghi lại bẫy', icon: BookmarkPlus, tone: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200', action: onRecordMistake },
            { label: 'Từ vựng hôm nay', hint: 'Số từ đã học', icon: Languages, tone: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200', action: onRecordVocab }
          ].map(item => (
            <button key={item.label} type="button" onClick={() => run(item.action)}
              className="flex min-h-[68px] w-full items-center gap-3.5 px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl cursor-pointer">
              <span className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-slate-900 dark:border-slate-600 ' + item.tone}>
                <item.icon size={21} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-black text-slate-950 dark:text-white">{item.label}</span>
                <span className="block text-[13px] font-medium text-slate-500 dark:text-slate-400">{item.hint}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          ))}
        </div>
      </Sheet>
    )}

    {sheet === 'more' && (
      <Sheet title="Thêm" onClose={close}>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Học tập & Luyện đề
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {MORE_PAGES.map(page => {
                const active = activeTab === page.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => go(page.id)}
                    aria-current={active ? 'page' : undefined}
                    className={'flex min-h-[58px] items-center gap-3 rounded-2xl border-[1.5px] p-3 text-left text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ' + (active
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 dark:border-indigo-400 dark:bg-indigo-950/60 dark:text-indigo-200'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-850')}
                  >
                    <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (active ? 'bg-indigo-600 text-white dark:bg-indigo-500' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300')}>
                      <page.icon size={19} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">{page.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Hệ thống
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => run(onOpenSettings)}
                className="flex min-h-[58px] items-center gap-3 rounded-2xl border-[1.5px] border-slate-200 bg-white p-3 text-left text-[13px] font-bold text-slate-800 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-850"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Settings size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">Cài đặt</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                className="flex min-h-[58px] items-center gap-3 rounded-2xl border-[1.5px] border-slate-200 bg-white p-3 text-left text-[13px] font-bold text-slate-800 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-850"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 leading-tight">{theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}</span>
              </button>
            </div>
          </div>
        </div>
      </Sheet>
    )}
  </>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useModalA11y(true, onClose);
  // Portal to <body> so a sheet opened from the sticky top bar still covers the bottom bar.
  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" tabIndex={-1} aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-950/50 cursor-default" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t-2 border-slate-900 bg-[#FDFBF7] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2.5 text-slate-900 outline-none dark:border-slate-700 dark:bg-[#0B132B] dark:text-slate-100">
        <div className="relative mb-2 flex items-center justify-between">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
          <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-slate-200/70 text-slate-600 hover:bg-slate-300 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mb-2 text-lg font-black tracking-tight">{title}</h2>
        {children}
      </div>
    </div>,
    document.body
  );
}
