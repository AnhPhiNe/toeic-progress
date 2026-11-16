import { useState } from 'react';
import { BarChart3, BookOpen, Camera, ChevronRight, Home, Pencil, Plus, Timer, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NavTabId } from '@/shared/types';
import { triggerHaptic } from '@/shared/lib/haptics';
import { PhoneSheet } from './PhoneSheet';
import './phone.css';

interface Props {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  dueMistakesCount: number;
  onRecordSession: () => void;
  onRecordPractice: () => void;
  onRecordMistake: () => void;
  onRecordVocab: () => void;
}

const ITEMS: Array<{ tab: NavTabId; also?: NavTabId[]; label: string; Icon: LucideIcon; color: string }> = [
  { tab: 'dashboard', label: 'Hôm nay', Icon: Home, color: 'var(--rd-green)' },
  { tab: 'history', also: ['analytics'], label: 'Hành trình', Icon: BarChart3, color: 'var(--rd-gold)' },
  { tab: 'exam-mode', label: 'Luyện tập', Icon: Timer, color: 'var(--rd-violet)' },
  { tab: 'mistakes', label: 'Sổ tay', Icon: BookOpen, color: 'var(--rd-pink)' }
];

/** Phone bottom navigation: Hôm nay, Hành trình, raised + Ghi, Luyện tập, Sổ tay. */
export function PhoneNav({ activeTab, setActiveTab, dueMistakesCount, onRecordSession, onRecordPractice, onRecordMistake, onRecordVocab }: Props) {
  const [recordOpen, setRecordOpen] = useState(false);
  const item = (i: (typeof ITEMS)[number]) => {
    const active = activeTab === i.tab || Boolean(i.also?.includes(activeTab));
    const due = i.tab === 'mistakes' ? dueMistakesCount : 0;
    return (
      <button key={i.tab} type="button" className={'ph-nav__it' + (active ? ' is-on' : '')} aria-current={active ? 'page' : undefined}
        aria-label={due > 0 ? `${i.label}, ${due} câu cần ôn` : undefined}
        onClick={() => { triggerHaptic(8); setActiveTab(i.tab); }}>
        <i style={{ background: i.color }}><i.Icon size={18} strokeWidth={2.6} aria-hidden="true" /></i>
        {i.label}
        {due > 0 && <span className="ph-nav__badge" aria-hidden="true">{due > 99 ? '99+' : due}</span>}
      </button>
    );
  };
  const run = (action: () => void) => () => { setRecordOpen(false); action(); };
  return (
    <>
      <nav aria-label="Điều hướng chính" className="rd ph-nav">
        {item(ITEMS[0])}
        {item(ITEMS[1])}
        <button type="button" className="ph-nav__it ph-nav__add" aria-haspopup="dialog" onClick={() => { triggerHaptic(8); setRecordOpen(true); }}>
          <i><Plus size={30} strokeWidth={3} aria-hidden="true" /></i>
          Ghi
        </button>
        {item(ITEMS[2])}
        {item(ITEMS[3])}
      </nav>
      {recordOpen && (
        <PhoneSheet title="Ghi lại gì?" onClose={() => setRecordOpen(false)}>
          <div className="ph-grid3">
            <button type="button" className="ph-big" style={{ background: '#fff7df' }} onClick={run(onRecordSession)}>
              <i style={{ background: '#ffb020' }}><Pencil size={24} aria-hidden="true" /></i>Điểm đề<small>Full test hoặc mini</small>
            </button>
            <button type="button" className="ph-big" style={{ background: '#f3efff' }} onClick={run(onRecordPractice)}>
              <i style={{ background: 'var(--rd-violet)' }}><Timer size={24} aria-hidden="true" /></i>Buổi luyện<small>Part, số phút</small>
            </button>
            <button type="button" className="ph-big" style={{ background: '#ffeef3' }} onClick={run(onRecordMistake)}>
              <i style={{ background: 'var(--rd-pink)' }}><Camera size={24} aria-hidden="true" /></i>Chụp câu sai<small>nhiều câu một lần</small>
            </button>
          </div>
          <button type="button" className="ph-row" onClick={run(onRecordVocab)}>
            <i className="ph-row__sm" style={{ background: 'var(--rd-blue)' }}><Type size={18} aria-hidden="true" /></i>
            <span><b>Thêm từ vựng</b></span>
            <ChevronRight size={20} className="ph-row__ar" aria-hidden="true" />
          </button>
        </PhoneSheet>
      )}
    </>
  );
}
