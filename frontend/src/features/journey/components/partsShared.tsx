import type { ReactNode } from 'react';
import type { PartNumber } from '@/shared/domain/questionNumbers';
import { PCT_COLOUR, PCT_LEGEND, weatherIconKind } from '../lib/islandLook';
import type { IslandState } from '../lib/islands';

/** "Ghé Part 7 rồi Part 3 trước": what the stat card says about the chests still closed. */
export function partsHeadline(total: number, numbered: PartNumber[]): ReactNode {
  const names = numbered.map(p => <em key={p}>Part {p}</em>);
  if (total === 0) return 'Đề này không sai câu nào!';
  if (names.length === 2) return <>Ghé {names[0]} rồi {names[1]} trước</>;
  if (names.length === 1) return <>Ghé {names[0]} trước</>;
  return 'Bạn đã gỡ hết câu sai của đề này, giỏi lắm!';
}

/** Sun, sun behind a cloud, or rain cloud: the weather of the island in the tag. */
export function WeatherIcon({ state, cleared = false }: { state: IslandState; cleared?: boolean }) {
  const kind = weatherIconKind(state, cleared);
  return (
    <svg className="jr-wx" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {kind === 'sun' && <><circle cx="12" cy="12" r="5" fill="#ffc83d" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="#ffc83d" strokeWidth="2" strokeLinecap="round" /></>}
      {kind === 'partly' && <><circle cx="9" cy="9" r="4.5" fill="#ffc83d" /><path d="M8 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.5 1A3 3 0 0 0 8 19z" fill="#fff" stroke="#d9a520" strokeWidth="1.6" /></>}
      {kind === 'rain' && <><path d="M7 14h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.5 1A3 3 0 0 0 7 14z" fill="#a3aec0" /><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3" stroke="#7fa6cf" strokeWidth="2" strokeLinecap="round" /></>}
    </svg>
  );
}

/** Small treasure chest, with the visiting order on it (0 = no number, e.g. an emptied chest). */
export function ChestIcon({ n, open = false, size = 40 }: { n: number; open?: boolean; size?: number }) {
  return (
    <svg className="jr-chi" viewBox="-22 -33 50 50" width={size} height={size} aria-hidden="true">
      {open
        ? <><path d="M-15 -8 L-11 -26 H11 L15 -8Z" fill="#d18f4e" /><rect x="-17" y="-8" width="34" height="22" rx="4" fill="#b8763e" /><rect x="-14" y="-8" width="28" height="6" rx="3" fill="#5a3a22" /><rect x="-17" y="-8" width="34" height="4" fill="#ffc83d" opacity=".7" /></>
        : <><rect x="-17" y="-6" width="34" height="20" rx="4" fill="#b8763e" /><path d="M-17 -6 Q0 -24 17 -6Z" fill="#d18f4e" /><rect x="-17" y="-8" width="34" height="5" fill="#ffc83d" /><rect x="-4" y="-4" width="8" height="9" rx="2" fill="#ffc83d" /></>}
      {!open && n > 0 && <g transform="translate(12 -19)"><circle r="11" fill="#ff7a9c" stroke="#fff" strokeWidth="2.5" /><text y="4.6" fontWeight="900" fontSize="13" fill="#fff" textAnchor="middle">{n}</text></g>}
    </svg>
  );
}

/** "% đúng · ≥85 · 75–84 · dưới 75" (the Vững/Ổn thresholds, one colour per band). */
export function PctLegend({ className = '', withTitle = true }: { className?: string; withTitle?: boolean }) {
  return (
    <div className={'jr-legend ' + className} role="group" aria-label="Màu phần trăm đúng">
      {withTitle && <span>% đúng</span>}
      {PCT_LEGEND.map(l => <span key={l.state} className="jr-pl"><i style={{ background: PCT_COLOUR[l.state].fill }} />{l.label}</span>)}
    </div>
  );
}
