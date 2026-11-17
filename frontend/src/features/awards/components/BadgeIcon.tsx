import { useId } from 'react';
import type { Badge, BadgeFamily, BadgeIconKey, BadgeTier } from '../lib/badges';

/** Badge art ported from design/previews/mock-awards-v4.html (badge(fam, tier, icon, label, locked, progress)). */
const RIM: Record<BadgeTier, [string, string, string]> = {
  g: ['#fff3b0', '#ffcf3d', '#d98e00'],
  s: ['#ffffff', '#cfd8e3', '#8796a8'],
  b: ['#ffd9b0', '#e39550', '#a8561f']
};
const FILL: Record<BadgeFamily, [string, string]> = {
  score: ['#ffb347', '#ff7a3d'], streak: ['#ff8a5c', '#ff3d6e'], effort: ['#7be08f', '#2fb36b'],
  part: ['#6fc3ff', '#3d6dff'], speed: ['#5eead4', '#0ea5b7'], secret: ['#c9a3ff', '#7c4dff']
};
const SHAPE: Record<BadgeFamily, string> = {
  score: 'M60 6 L72 16 L88 14 L92 30 L106 40 L100 56 L106 72 L92 82 L88 98 L72 96 L60 106 L48 96 L32 98 L28 82 L14 72 L20 56 L14 40 L28 30 L32 14 L48 16Z',
  streak: 'M60 4 C70 26 104 36 104 70 A44 40 0 0 1 16 70 C16 50 32 40 36 20 C44 34 54 36 60 4Z',
  effort: 'M60 6 L104 30 V82 L60 106 L16 82 V30Z',
  part: 'M60 6 L100 20 V54 C100 82 82 98 60 108 C38 98 20 82 20 54 V20Z',
  speed: 'M12 58 A48 48 0 1 1 108 58 A48 48 0 1 1 12 58Z',
  secret: 'M30 22 L46 8 H74 L90 22 L104 40 L60 108 L16 40Z'
};
const SCALE = 'translate(60 57) scale(.78) translate(-60 -57)';

function starPath(cx: number, cy: number, outer: number, inner: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer, a = -Math.PI / 2 + i * Math.PI / 5;
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  }
  return d + 'Z';
}
const rays = (n: number, r1: number, r2: number) => Array.from({ length: n }, (_, k) => {
  const a = k * Math.PI * 2 / n;
  return `<path d="M${60 + Math.cos(a) * r1} ${58 + Math.sin(a) * r1} L${60 + Math.cos(a) * r2} ${58 + Math.sin(a) * r2}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
}).join('');

const ICON = (key: BadgeIconKey, accent: string): string => ({
  trophy: '<path d="M44 40 H76 V52 A16 16 0 0 1 44 52Z" fill="#fff"/><path d="M44 44 H36 C36 54 40 58 46 58 M76 44 H84 C84 54 80 58 74 58" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/><rect x="56" y="66" width="8" height="8" fill="#fff"/><rect x="48" y="73" width="24" height="6" rx="3" fill="#fff"/>',
  rocket: '<path d="M60 32 C72 40 74 56 70 68 H50 C46 56 48 40 60 32Z" fill="#fff"/><circle cx="60" cy="50" r="5" fill="#ff7a3d"/><path d="M50 62 L42 72 L50 70 M70 62 L78 72 L70 70" fill="#fff"/><path d="M54 70 Q60 84 66 70" fill="#ffe58f"/>',
  chart: '<path d="M38 74 L52 58 L62 66 L80 44" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M70 42 H82 V54" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  flag: '<path d="M46 34 V80" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M48 36 Q64 30 78 40 Q64 50 48 46Z" fill="#fff"/><path d="M36 80 L50 62 L60 70 L72 56 L84 80Z" fill="rgba(255,255,255,.55)"/>',
  flame: '<path d="M60 32 C64 44 78 48 78 62 A18 17 0 0 1 42 62 C42 54 48 50 50 42 C54 48 58 46 60 32Z" fill="#fff"/><path d="M60 52 C63 58 69 60 69 66 A9 8 0 0 1 51 66 C51 61 56 60 60 52Z" fill="#ffd25e"/>',
  book: `<path d="M60 44 C52 38 42 38 34 40 V74 C42 72 52 72 60 78 C68 72 78 72 86 74 V40 C78 38 68 38 60 44Z" fill="#fff"/><path d="M60 44 V78" stroke="${accent}" stroke-width="3"/><path d="M40 48 H54 M40 56 H54 M66 48 H80 M66 56 H80" stroke="#bfe8ca" stroke-width="3" stroke-linecap="round"/>`,
  pencil: `<path d="M42 76 L46 62 L72 36 L82 46 L56 72Z" fill="#fff"/><path d="M42 76 L46 62 L56 72Z" fill="#ffe58f"/><path d="M68 40 L78 50" stroke="${accent}" stroke-width="3"/>`,
  cards: `<rect x="40" y="40" width="32" height="40" rx="6" fill="rgba(255,255,255,.55)" transform="rotate(-12 56 60)"/><rect x="48" y="36" width="32" height="40" rx="6" fill="#fff"/><path d="M56 56 l5 5 9 -11" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  owl: '<ellipse cx="60" cy="58" rx="22" ry="24" fill="#fff"/><circle cx="51" cy="54" r="7" fill="#7c4dff"/><circle cx="69" cy="54" r="7" fill="#7c4dff"/><circle cx="52" cy="53" r="2.5" fill="#fff"/><circle cx="70" cy="53" r="2.5" fill="#fff"/><path d="M56 64 L60 70 L64 64Z" fill="#ffc83d"/><path d="M40 38 L48 46 M80 38 L72 46" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  back: '<path d="M78 58 A18 18 0 1 1 72 44" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M66 36 L76 44 L66 50" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  up50: '<path d="M60 34 L78 56 H66 V78 H54 V56 H42Z" fill="#fff"/>',
  sun: `<circle cx="60" cy="58" r="11" fill="#fff"/>${rays(8, 16, 23)}`,
  star: `<path d="${starPath(60, 58, 26, 11)}" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`,
  headphones: '<path d="M40 66 V58 A20 20 0 0 1 80 58 V66" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><rect x="35" y="62" width="12" height="20" rx="5" fill="#fff"/><rect x="73" y="62" width="12" height="20" rx="5" fill="#fff"/>',
  eye: `<path d="M32 58 Q60 32 88 58 Q60 84 32 58Z" fill="#fff"/><circle cx="60" cy="58" r="11" fill="${accent}"/><circle cx="64" cy="54" r="4" fill="#fff"/>`,
  calendar: `<rect x="37" y="40" width="46" height="42" rx="8" fill="#fff"/><path d="M37 48 a8 8 0 0 1 8 -8 h30 a8 8 0 0 1 8 8 v4 h-46Z" fill="#ffd25e"/><path d="M47 66 l8 8 17 -17" fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  stopwatch: `<circle cx="60" cy="62" r="21" fill="#fff"/><rect x="53" y="34" width="14" height="7" rx="3.5" fill="#fff"/><path d="M60 62 V49 M60 62 L71 68" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`,
  bolt: '<path d="M67 32 L44 64 H58 L52 86 L78 53 H63Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>',
  camera: `<rect x="35" y="46" width="50" height="35" rx="8" fill="#fff"/><path d="M50 47 L54 38 H66 L70 47Z" fill="#fff"/><circle cx="60" cy="63" r="11" fill="${accent}"/><circle cx="60" cy="63" r="5" fill="#fff"/>`,
  sparkle: '<path d="M58 34 L65 53 L84 60 L65 67 L58 86 L51 67 L32 60 L51 53Z" fill="#fff"/><path d="M82 36 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3Z" fill="#ffe58f"/>',
  sunrise: '<path d="M38 70 A22 22 0 0 1 82 70Z" fill="#fff"/><path d="M30 76 H90" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M60 34 V42 M40 44 L45 50 M80 44 L75 50" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  hourglass: `<path d="M44 36 H76 M44 84 H76" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M48 39 H72 C72 52 60 55 60 60 C60 65 72 68 72 81 H48 C48 68 60 65 60 60 C60 55 48 52 48 39Z" fill="#fff"/><path d="M54 79 H66 L60 69Z" fill="${accent}"/>`,
  part: ''
}[key]);

interface Props {
  badge: Badge;
  /** Width in px; omit to fill the parent. */
  size?: number;
  className?: string;
  /** Seconds before the shine sweep starts, so a shelf does not flash all at once. */
  shineDelay?: number;
}

export function BadgeIcon({ badge, size, className, shineDelay = 0 }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { family, tier } = badge;
  const locked = !badge.earned;
  const secretLocked = locked && family === 'secret';
  const [r1, r2, r3] = RIM[tier], [c1, c2] = FILL[family], d = SHAPE[family];
  const ribbon = family !== 'part' && badge.label && !secretLocked;
  const ribbonFont = badge.label.length > 8 ? 8.6 : badge.label.length > 6 ? 10 : 11.5;
  const lip = locked ? ['#b8c1d1', '#cbd2de'] : tier === 'g' ? ['#ff5c7a', '#ff7a9c'] : tier === 'b' ? ['#c86a2a', '#e08a45'] : ['#5b6b80', '#7a8aa0'];
  const inner = family === 'part'
    ? `<text x="60" y="68" text-anchor="middle" font-weight="900" font-size="${badge.label.length > 3 ? 21 : 30}" fill="#fff" opacity="${locked ? 0.85 : 1}">${badge.label}</text>`
    : secretLocked ? '<text x="60" y="70" text-anchor="middle" font-weight="900" font-size="34" fill="rgba(255,255,255,.9)">?</text>' : ICON(badge.icon, c2);
  // The markup only mixes fixed templates with the badge's own short label (never user text), so it is safe to inline.
  const svg = `<defs>
    <linearGradient id="${uid}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${locked ? '#f4f6fa' : r1}"/><stop offset=".5" stop-color="${locked ? '#dde3ec' : r2}"/><stop offset="1" stop-color="${locked ? '#c3ccda' : r3}"/></linearGradient>
    <linearGradient id="${uid}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <clipPath id="${uid}c"><path d="${d}" transform="${SCALE}"/></clipPath></defs>`
    + (locked ? '' : '<ellipse cx="60" cy="122" rx="34" ry="6" fill="rgba(0,0,0,.12)"/>')
    + `<path d="${d}" fill="url(#${uid}r)" ${locked ? '' : 'filter="drop-shadow(0 3px 0 rgba(0,0,0,.15))"'}/>`
    + `<path d="${d}" transform="${SCALE}" fill="${locked ? '#fff' : `url(#${uid}f)`}"/>`
    + (locked ? `<path d="${d}" transform="${SCALE}" fill="url(#${uid}f)" opacity=".32"/>` : '')
    + `<g clip-path="url(#${uid}c)"><path d="M0 0 L120 0 L0 70Z" fill="#fff" opacity="${locked ? 0.04 : 0.16}"/>`
    + (locked ? '' : `<g transform="rotate(25 60 60)"><rect class="awd-shine" style="animation-delay:${shineDelay}s" x="-40" y="-20" width="16" height="160" fill="#fff" opacity=".26"/></g>`) + '</g>'
    + `<g opacity="${locked ? 0.85 : 1}">${inner}</g>`
    + (ribbon ? `<path d="M22 100 H98 L92 110 L98 120 H22 L28 110Z" fill="${lip[0]}"/><path d="M28 100 H92 V118 H28Z" fill="${lip[1]}"/><text x="60" y="113.5" text-anchor="middle" font-weight="900" font-size="${ribbonFont}" fill="#fff" letter-spacing=".4">${badge.label}</text>` : '')
    + (locked
      ? '<g transform="translate(92 22)"><circle r="13" fill="#8e99ad" stroke="#fff" stroke-width="3"/><rect x="-6" y="-2" width="12" height="9" rx="2" fill="#fff"/><path d="M-4 -2 V-5 A4 4 0 0 1 4 -5 V-2" fill="none" stroke="#fff" stroke-width="2.4"/></g>'
        + (secretLocked ? '' : `<rect x="30" y="128" width="60" height="6" rx="3" fill="#e3e7ee"/><rect x="30" y="128" width="${Math.max(badge.progress > 0 ? 4 : 0, 60 * badge.progress)}" height="6" rx="3" fill="${c2}"/>`)
      : '<g fill="#fff"><path d="M14 18 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5Z"/><path d="M104 86 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2Z"/></g>');
  return (
    <svg viewBox="0 0 120 136" width={size} height={size ? size * 136 / 120 : undefined} aria-hidden="true"
      className={'aw-ic' + (className ? ' ' + className : '')} style={size ? undefined : { width: '100%', height: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
