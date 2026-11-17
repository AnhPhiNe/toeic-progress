import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Soc } from '@/shared/ui/soc/Soc';
import { GEAR, type SocGearId } from '@/shared/ui/soc/socGear';

interface Props {
  /** The "Đổi đồ cho Sóc" button: the panel opens beside it. */
  anchor: HTMLElement;
  level: number;
  worn: SocGearId[];
  onToggle: (id: SocGearId) => void;
  onClose: () => void;
}

/** Floating wardrobe, in the style of the Hôm nay "Thêm việc của mình" panel: Esc or a click outside closes it. */
export function GearPanel({ anchor, level, worn, onToggle, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = box.current?.offsetHeight ?? 420;
      setPos({ left: Math.min(window.innerWidth - 380, a.right + 14), top: Math.max(12, Math.min(window.innerHeight - h - 12, a.top - 8)) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', down);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', down); };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={box} className="rd awd-gp" role="dialog" aria-label="Tủ đồ của Sóc" style={{ left: pos.left, top: pos.top }}>
      <div className="awd-gp-head">
        <Soc state="hi" size={92} gear={worn} />
        <div><h4>Tủ đồ của Sóc</h4><p>Chạm món để Sóc đeo hoặc cởi. Món đội đầu chỉ chọn một.</p></div>
      </div>
      <ul>
        {GEAR.map(g => {
          const owned = g.level <= level, on = worn.includes(g.id);
          return (
            <li key={g.id}>
              {owned
                ? <button type="button" className={'awd-gp-it' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => onToggle(g.id)}>
                    <span>{g.emoji}</span><b>{g.label}</b><i>{on ? 'Đang đeo' : 'Đeo'}</i>
                  </button>
                : <div className="awd-gp-it is-lock"><span>🔒</span><b>{g.label}</b><i>cấp {g.level}</i></div>}
            </li>
          );
        })}
      </ul>
    </div>,
    document.body
  );
}
