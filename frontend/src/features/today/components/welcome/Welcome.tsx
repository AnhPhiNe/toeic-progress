import type { CSSProperties, ReactNode } from 'react';
import { Soc } from '@/shared/ui/soc/Soc';
import './welcome.css';

/** Speech bubble with a tail; `tail` says where the tail points. */
export function SocBubble({ children, tail = 'down', className, style }: { children: ReactNode; tail?: 'down' | 'up'; className?: string; style?: CSSProperties }) {
  return <p className={`wl-bubble is-${tail}${className ? ' ' + className : ''}`} style={style} role="status">{children}</p>;
}

/** Sóc runs in from the left (idle pose only) and greets with a bubble. */
export function GreetSoc({ size, style, className }: { size: number; style?: CSSProperties; className?: string }) {
  return (
    <div className={'wl-greet' + (className ? ' ' + className : '')} style={style}>
      <SocBubble tail="down" className="wl-greet-b">Cùng mình dựng <b>cầu thang lên cúp</b> nhé. Chỉ cần chọn mục tiêu trước!</SocBubble>
      <div className="wl-run"><div className="wl-hop"><Soc state="idle" size={size} /></div></div>
    </div>
  );
}

const COLORS = ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa', '#ff9a4d'];
/** Small confetti burst (CSS, ~1.2 s) thrown from the middle of its parent. */
export function Confetti({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={'wl-conf' + (className ? ' ' + className : '')} style={style} aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.2, d = 90 + (i % 5) * 34;
        return <i key={i} style={{ background: COLORS[i % COLORS.length], '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d * 0.8 - 40}px`, '--r': `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`, animationDelay: `${(i % 4) * 0.03}s` } as CSSProperties} />;
      })}
    </div>
  );
}
