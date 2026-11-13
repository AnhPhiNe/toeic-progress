import type { Badge } from '../lib/badges';

const TIER: Record<Badge['tier'], [string, string, string]> = {
  b: ['#e9a46a', '#c97b3d', '#fff'],
  s: ['#d5dde5', '#9aa8b5', '#3d4a55'],
  g: ['#ffd766', '#e0a400', '#6b4a00']
};
const OFF: [string, string, string] = ['#eef0ee', '#cfd5cf', '#a3aba5'];

/** One badge, drawn by family shape (design/previews/mock-awards-v2.html). */
export function BadgeIcon({ badge, size = 88, hidden = false }: { badge: Badge; size?: number; hidden?: boolean }) {
  const on = badge.earned;
  const [f, d, ink] = on ? TIER[badge.tier] : OFF;
  const mark = hidden ? '?' : badge.mark;
  const s = badge.shape;
  let body;
  if (s === 'round') body = <><circle cx="50" cy="46" r="34" fill={f} stroke={d} strokeWidth="5" /><circle cx="50" cy="46" r="25" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="2 4" opacity=".8" /><path d="M34 74 L28 96 L40 90 L46 100 L50 80Z M66 74 L72 96 L60 90 L54 100 L50 80Z" fill={on ? '#ff7a9c' : '#dfe4df'} /></>;
  else if (s === 'flame') body = <path d="M50 6 C58 26 84 34 84 60 a34 32 0 0 1 -68 0 C16 44 28 36 32 20 C38 30 44 32 50 6Z" fill={f} stroke={d} strokeWidth="5" strokeLinejoin="round" />;
  else if (s === 'star') body = <path d="M50 6 l12 26 28 3 -21 19 6 28 -25 -14 -25 14 6 -28 -21 -19 28 -3Z" fill={f} stroke={d} strokeWidth="5" strokeLinejoin="round" />;
  else if (s === 'hex') body = <path d="M50 6 L88 28 V70 L50 92 L12 70 V28Z" fill={f} stroke={d} strokeWidth="5" strokeLinejoin="round" />;
  else if (s === 'gem') body = <><path d="M22 32 L36 14 H64 L78 32 L50 90Z" fill={on ? '#c9b8fd' : OFF[0]} stroke={on ? '#7c5ce0' : OFF[1]} strokeWidth="5" strokeLinejoin="round" /><path d="M22 32 H78 M36 14 L44 32 L50 90 M64 14 L56 32 L50 90" fill="none" stroke="#fff" strokeWidth="2" opacity=".6" /></>;
  else body = <><path d="M26 14 H74 V36 A24 24 0 0 1 26 36Z" fill={f} stroke={d} strokeWidth="5" /><path d="M26 20 H14 C14 36 22 42 30 42 M74 20 H86 C86 36 78 42 70 42" fill="none" stroke={d} strokeWidth="5" strokeLinecap="round" /><rect x="44" y="58" width="12" height="14" fill={d} /><rect x="30" y="72" width="40" height="12" rx="4" fill={on ? '#2f3a33' : OFF[1]} /></>;
  const ty = s === 'cup' ? 38 : s === 'star' ? 56 : s === 'flame' ? 66 : 50;
  const text = s === 'gem' ? (on ? '#4b2f9e' : OFF[2]) : ink;
  return (
    <svg viewBox="0 0 100 104" width={size} height={size * 1.04} aria-hidden="true" className="aw-ic">
      {body}
      <text x="50" y={ty + (badge.unit ? 0 : 4)} textAnchor="middle" fontWeight="900" fontSize={mark.length > 3 ? 17 : mark.length > 2 ? 20 : 26} fill={text}>{mark}</text>
      {badge.unit && !hidden && <text x="50" y={ty + 14} textAnchor="middle" fontWeight="800" fontSize="10" fill={text}>{badge.unit}</text>}
    </svg>
  );
}
