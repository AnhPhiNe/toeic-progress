import type { ReactNode } from 'react';
import type { NavTabId, UserProfile } from '@/shared/types';
import { profileDisplayName, profileInitials } from './profileInitials';
import './rd-sidebar.css';

/** Sidebar variant A from the 2026-11 redesign (design/previews/mock-home-cardD.html). */
export interface RdSidebarProps {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  profile: UserProfile;
  dueMistakesCount: number;
  streak: number;
  onOpenSessionLogger: () => void;
  onOpenSettings: () => void;
}

const W = '#fff';
const ICONS: Record<string, ReactNode> = {
  today: <path d="M3 11 L12 3.5 L21 11 V20 a1.5 1.5 0 0 1 -1.5 1.5 H15 V15 H9 V21.5 H4.5 A1.5 1.5 0 0 1 3 20Z" fill={W} />,
  journey: <><rect x="2.5" y="15" width="5" height="7" rx="1.2" fill={W} /><rect x="9.5" y="10" width="5" height="12" rx="1.2" fill={W} /><rect x="16.5" y="5" width="5" height="17" rx="1.2" fill={W} /></>,
  practice: <><rect x="9" y="1" width="6" height="3" rx="1.5" fill={W} /><circle cx="12" cy="14" r="8.5" fill="none" stroke={W} strokeWidth="3" /><path d="M12 9.5 V14 L15 16" fill="none" stroke={W} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></>,
  notebook: <><path d="M3 4.5 C6 3 9.5 3 12 5 C14.5 3 18 3 21 4.5 V20 C18 18.5 14.5 18.5 12 20.5 C9.5 18.5 6 18.5 3 20Z" fill={W} /><path d="M12 5 V20.5" stroke="rgba(0,0,0,.18)" strokeWidth="1.6" /></>,
  awards: <><path d="M6 3 H18 V9 A6 6 0 0 1 6 9Z" fill={W} /><path d="M6 5 H3 C3 9 5 10.5 6.5 10.5 M18 5 H21 C21 9 19 10.5 17.5 10.5" fill="none" stroke={W} strokeWidth="2.2" strokeLinecap="round" /><rect x="10.5" y="14" width="3" height="4" fill={W} /><rect x="7" y="18" width="10" height="3.5" rx="1.5" fill={W} /></>
};

interface Item { key: keyof typeof ICONS; label: string; tab?: NavTabId; also?: NavTabId[]; color: string; lip: string; tint: string; badge?: number }

export function RdSidebar({ activeTab, setActiveTab, profile, dueMistakesCount, streak, onOpenSessionLogger, onOpenSettings }: RdSidebarProps) {
  // While pages are rebuilt one by one, each item opens the current page that will merge into it.
  const items: Item[] = [
    { key: 'today', label: 'Hôm nay', tab: 'dashboard', also: ['plan'], color: 'var(--rd-green)', lip: 'var(--rd-green-d)', tint: 'var(--rd-green)' },
    { key: 'journey', label: 'Hành trình điểm', tab: 'history', also: ['analytics'], color: 'var(--rd-gold)', lip: 'var(--rd-gold-d)', tint: 'var(--rd-gold-d)' },
    { key: 'practice', label: 'Luyện tập', tab: 'exam-mode', color: 'var(--rd-violet)', lip: 'var(--rd-violet-d)', tint: 'var(--rd-violet-d)' },
    { key: 'notebook', label: 'Sổ tay', tab: 'mistakes', also: ['vocabulary'], color: 'var(--rd-pink)', lip: 'var(--rd-pink-d)', tint: 'var(--rd-pink-d)', badge: dueMistakesCount || undefined },
    { key: 'awards', label: 'Thành tích', color: 'var(--rd-blue)', lip: 'var(--rd-blue-d)', tint: 'var(--rd-blue-d)' }
  ];
  const name = profileDisplayName(profile.name);

  return (
    <aside className="rd rd-side" aria-label="Điều hướng chính">
      <button type="button" className="rd-side__logo" onClick={() => setActiveTab('dashboard')} aria-label="TOEIC Progress · Hôm nay">
        <span className="rd-side__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="15" width="5" height="6" rx="1" fill={W} /><rect x="9.5" y="10" width="5" height="11" rx="1" fill={W} /><rect x="16" y="5" width="5" height="16" rx="1" fill={W} opacity=".85" /><path d="M18.5 1.5 l1 2 2.2 .3 -1.6 1.5 .4 2.2 -2 -1.1 -2 1.1 .4 -2.2 -1.6 -1.5 2.2 -.3Z" fill="#ffe58f" /></svg>
        </span>
        <b className="rd-side__word">toeic<span>progress</span></b>
      </button>

      <nav className="rd-side__nav">
        {items.map(item => {
          const on = !!item.tab && (activeTab === item.tab || !!item.also?.includes(activeTab));
          const soon = !item.tab;
          return (
            <button key={item.key} type="button" disabled={soon}
              className={'rd-side__it' + (on ? ' is-on' : '') + (soon ? ' is-soon' : '')}
              style={{ ['--it-tint' as string]: item.tint }}
              aria-current={on ? 'page' : undefined}
              title={soon ? 'Sắp có' : item.label}
              onClick={() => item.tab && setActiveTab(item.tab)}>
              <span className="rd-side__ic" style={{ background: item.color, boxShadow: `0 3px 0 ${item.lip}` }} aria-hidden="true">
                <svg viewBox="0 0 24 24">{ICONS[item.key]}</svg>
              </span>
              <span className="rd-side__lbl">{item.label}</span>
              {item.badge ? <em aria-label={`${item.badge} câu đến hạn`}>{item.badge}</em> : null}
            </button>
          );
        })}
      </nav>

      <button type="button" className="rd-btn rd-side__cta" onClick={onOpenSessionLogger}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4 V20 M4 12 H20" stroke={W} strokeWidth="3.6" strokeLinecap="round" /></svg>
        <span className="rd-side__lbl">Ghi điểm</span>
      </button>

      <p className="rd-side__grp">CÔNG CỤ</p>
      <button type="button" className={'rd-side__tl' + (activeTab === 'resources' ? ' is-on' : '')} onClick={() => setActiveTab('resources')} title="Quy đổi điểm">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2.4" /><rect x="7" y="5" width="10" height="4" rx="1" fill="currentColor" /><g fill="currentColor"><circle cx="8.5" cy="13" r="1.4" /><circle cx="12" cy="13" r="1.4" /><circle cx="15.5" cy="13" r="1.4" /><circle cx="8.5" cy="17.5" r="1.4" /><circle cx="12" cy="17.5" r="1.4" /><circle cx="15.5" cy="17.5" r="1.4" /></g></svg>
        <span className="rd-side__lbl">Quy đổi điểm</span>
      </button>

      <button type="button" className="rd-side__me" onClick={onOpenSettings} aria-label={`${name} · Mở cài đặt`}>
        <span className="rd-side__av">{profileInitials(profile.name)}</span>
        <span className="rd-side__who"><b>{name}</b><small>Mục tiêu {profile.targetScore}</small></span>
        <span className="rd-side__fire" aria-label={`Chuỗi ${streak} ngày`}><span aria-hidden="true">🔥</span><b>{streak}</b></span>
      </button>
    </aside>
  );
}
