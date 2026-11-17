import type { ReactNode } from 'react';
import type { NavTabId } from '@/shared/types';
import { Soc } from '@/shared/ui/soc/Soc';
import type { SocLook } from '@/features/awards/lib/outfit';
import './rd-sidebar.css';

/** Sidebar variant A from the 2026-11 redesign (design/previews/mock-home-cardD.html). */
export interface RdSidebarProps {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  dueMistakesCount: number;
  streak: number;
  /** New badges not shown yet: a pink dot on Thành tích. */
  newBadges?: number;
  /** Level and worn gear for the level card at the bottom. */
  soc: SocLook;
  onOpenSessionLogger: () => void;
  /** Opens Cài đặt (account, sync, backup). */
  onOpenSettings?: () => void;
  /** Live line under Giải đấu, e.g. "Hạng 4 · còn 3 ngày" or "Tham gia". */
  leagueLabel?: string;
  /** Sync state line under the settings row, e.g. "Chỉ lưu trên máy". */
  syncLabel?: string;
}

const W = '#fff';
const ICONS: Record<string, ReactNode> = {
  today: <path d="M3 11 L12 3.5 L21 11 V20 a1.5 1.5 0 0 1 -1.5 1.5 H15 V15 H9 V21.5 H4.5 A1.5 1.5 0 0 1 3 20Z" fill={W} />,
  journey: <><rect x="2.5" y="15" width="5" height="7" rx="1.2" fill={W} /><rect x="9.5" y="10" width="5" height="12" rx="1.2" fill={W} /><rect x="16.5" y="5" width="5" height="17" rx="1.2" fill={W} /></>,
  practice: <><rect x="9" y="1" width="6" height="3" rx="1.5" fill={W} /><circle cx="12" cy="14" r="8.5" fill="none" stroke={W} strokeWidth="3" /><path d="M12 9.5 V14 L15 16" fill="none" stroke={W} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  notebook: <><path d="M3 4.5 C6 3 9.5 3 12 5 C14.5 3 18 3 21 4.5 V20 C18 18.5 14.5 18.5 12 20.5 C9.5 18.5 6 18.5 3 20Z" fill={W} /><path d="M12 5 V20.5" stroke="rgba(0,0,0,.18)" strokeWidth="1.6" /></>,
  convert: <><path d="M4 8 H17 M13.5 4 L17.5 8 L13.5 12" fill="none" stroke={W} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 16 H7 M10.5 12 L6.5 16 L10.5 20" fill="none" stroke={W} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  guide: <><circle cx="12" cy="12" r="9.5" fill="none" stroke={W} strokeWidth="2.6" /><path d="M9.2 9.4 a2.9 2.9 0 1 1 4.1 2.6 c-.9.4 -1.3 1 -1.3 1.9 v.6" fill="none" stroke={W} strokeWidth="2.6" strokeLinecap="round" /><circle cx="12" cy="17.6" r="1.6" fill={W} /></>,
  league: <><path d="M12 1.8 L21 5 V11.4 C21 17.4 16.8 21.2 12 22.6 C7.2 21.2 3 17.4 3 11.4 V5Z" fill={W} /><path d="M12 7 l1.7 3.6 3.9.5-2.9 2.7.8 3.9-3.5-2-3.5 2 .8-3.9-2.9-2.7 3.9-.5Z" fill="rgba(0,0,0,.2)" /></>,
  awards: <><path d="M6 3 H18 V9 A6 6 0 0 1 6 9Z" fill={W} /><path d="M6 5 H3 C3 9 5 10.5 6.5 10.5 M18 5 H21 C21 9 19 10.5 17.5 10.5" fill="none" stroke={W} strokeWidth="2.2" strokeLinecap="round" /><rect x="10.5" y="14" width="3" height="4" fill={W} /><rect x="7" y="18" width="10" height="3.5" rx="1.5" fill={W} /></>
};

interface Item { key: keyof typeof ICONS; label: string; tab?: NavTabId; also?: NavTabId[]; color: string; lip: string; tint: string; badge?: number; sub?: string }

export function RdSidebar({ activeTab, setActiveTab, dueMistakesCount, streak, newBadges = 0, soc, onOpenSessionLogger, onOpenSettings, leagueLabel, syncLabel }: RdSidebarProps) {
  // While pages are rebuilt one by one, each item opens the current page that will merge into it.
  const items: Item[] = [
    { key: 'today', label: 'Hôm nay', tab: 'dashboard', color: 'var(--rd-green)', lip: 'var(--rd-green-d)', tint: 'var(--rd-green)' },
    { key: 'journey', label: 'Hành trình điểm', tab: 'history', also: ['analytics'], color: 'var(--rd-gold)', lip: 'var(--rd-gold-d)', tint: 'var(--rd-gold-d)' },
    { key: 'practice', label: 'Luyện tập', tab: 'exam-mode', color: 'var(--rd-violet)', lip: 'var(--rd-violet-d)', tint: 'var(--rd-violet-d)' },
    { key: 'notebook', label: 'Sổ tay', tab: 'mistakes', color: 'var(--rd-pink)', lip: 'var(--rd-pink-d)', tint: 'var(--rd-pink-d)', badge: dueMistakesCount || undefined },
    { key: 'awards', label: 'Thành tích', tab: 'awards', color: 'var(--rd-blue)', lip: 'var(--rd-blue-d)', tint: 'var(--rd-blue-d)', badge: newBadges || undefined },
    // Thành tích blue family, one step deeper so the two items stay apart.
    { key: 'league', label: 'Giải đấu', tab: 'league', color: '#3b7ddd', lip: '#2a5fae', tint: '#2a6bc7', sub: leagueLabel || 'Tham gia' }
  ];
  const tools: Item[] = [
    { key: 'convert', label: 'Quy đổi điểm', tab: 'resources', color: 'var(--rd-teal)', lip: 'var(--rd-teal-d)', tint: 'var(--rd-teal-d)' },
    { key: 'guide', label: 'Cách dùng app', tab: 'guide', color: 'var(--rd-gold)', lip: 'var(--rd-gold-d)', tint: 'var(--rd-gold-d)' }
  ];
  const { progress, worn } = soc;
  const starsLabel = progress.next ? `${progress.stars}/${progress.next.stars} sao` : 'Cấp cao nhất';

  const renderItem = (item: Item) => {
    const on = !!item.tab && (activeTab === item.tab || !!item.also?.includes(activeTab));
    const soon = !item.tab;
    return (
      <button key={item.key} type="button" disabled={soon}
        className={'rd-side__it' + (on ? ' is-on' : '') + (soon ? ' is-soon' : '') + (item.key === 'convert' ? ' is-tool' : '')}
        style={{ ['--it-tint' as string]: item.tint }}
        aria-current={on ? 'page' : undefined}
        title={soon ? 'Sắp có' : item.sub ? `${item.label} · ${item.sub}` : item.label}
        onClick={() => item.tab && setActiveTab(item.tab)}>
        <span className="rd-side__ic" style={{ background: item.color, boxShadow: `0 3px 0 ${item.lip}` }} aria-hidden="true">
          <svg viewBox="0 0 24 24">{ICONS[item.key]}</svg>
        </span>
        {item.sub
          ? <span className="rd-side__lbl rd-side__set"><span>{item.label}</span><small>{item.sub}</small></span>
          : <span className="rd-side__lbl">{item.label}</span>}
        {item.badge ? <em aria-label={item.key === 'awards' ? `${item.badge} huy hiệu mới` : `${item.badge} câu đến hạn`}>{item.badge}</em> : null}
      </button>
    );
  };

  return (
    <aside className="rd rd-side" aria-label="Điều hướng chính">
      <button type="button" className="rd-side__logo" onClick={() => setActiveTab('dashboard')} aria-label="TOEIC Progress · Hôm nay">
        <span className="rd-side__mark" aria-hidden="true"><Soc state="idle" size={46} coat="nau" className="rd-side__logosoc" /></span>
        <b className="rd-side__word">toeic<span>progress</span></b>
      </button>

      <nav className="rd-side__nav">{items.map(renderItem)}</nav>

      <button type="button" className="rd-btn rd-side__cta" onClick={onOpenSessionLogger} aria-label="Ghi điểm" title="Ghi điểm">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4 V20 M4 12 H20" stroke={W} strokeWidth="3.6" strokeLinecap="round" /></svg>
        <span className="rd-side__lbl">Ghi điểm</span>
      </button>

      <p className="rd-side__grp">CÔNG CỤ</p>
      {tools.map(renderItem)}
      {onOpenSettings && (
        <button type="button" className="rd-side__it is-tool" style={{ ['--it-tint' as string]: 'var(--rd-teal-d)' }} onClick={onOpenSettings} aria-haspopup="dialog" aria-label="Tài khoản & cài đặt" title="Tài khoản & cài đặt">
          <span className="rd-side__ic" style={{ background: '#9aa39d', boxShadow: '0 3px 0 #7b857f' }} aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4.2" fill={W} /><path d="M3.5 21 C3.5 15.5 8 14 12 14 S20.5 15.5 20.5 21Z" fill={W} /></svg>
          </span>
          <span className="rd-side__lbl rd-side__set"><span>Tài khoản &amp; cài đặt</span>{syncLabel && <small>{syncLabel}</small>}</span>
        </button>
      )}

      <button type="button" className="rd-side__me" onClick={() => setActiveTab('awards')}
        aria-label={`Cấp ${progress.level.n} · ${progress.level.name}, chuỗi ${streak} ngày · Mở Thành tích`}>
        <Soc state="idle" size={54} gear={worn} className="rd-side__soc" />
        <span className="rd-side__who">
          <b>Cấp {progress.level.n} · {progress.level.name}</b>
          <small>{starsLabel}</small>
          <span className="rd-side__bar" aria-hidden="true"><i style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></span>
        </span>
        <span className="rd-side__fire"><span aria-hidden="true">🔥</span><b>{streak}</b></span>
      </button>
    </aside>
  );
}
