/* Artwork for Xếp hạng and Hồ sơ của Sóc, ported from design/previews/rank-v1 (_common.cjs, _rank.cjs, _profile.cjs).
 * Pure SVG strings from fixed templates: no learner text ever reaches them (nicknames are rendered by React). */
import { socMoodSvg, type SocState } from '@/shared/ui/soc/socSvg';
import type { RankTierKey } from '../services/rankApi';

export interface TierLook { key: RankTierKey; name: string; rim: string; face: string; hi: string; deep: string }
export const RANK_TIERS: readonly TierLook[] = [
  { key: 'dong', name: 'Đồng', rim: '#b8682c', face: '#e9a466', hi: '#ffd2a3', deep: '#8f4d1c' },
  { key: 'bac', name: 'Bạc', rim: '#7e8ea8', face: '#c4cfdf', hi: '#eef3fa', deep: '#5d6b84' },
  { key: 'vang', name: 'Vàng', rim: '#d98c00', face: '#ffcf4a', hi: '#fff1b8', deep: '#a86a00' },
  { key: 'bach-kim', name: 'Bạch kim', rim: '#1f9e93', face: '#7fe0d3', hi: '#d6fbf5', deep: '#127a71' },
  { key: 'kim-cuong', name: 'Kim cương', rim: '#2477d6', face: '#8cc8ff', hi: '#e0f1ff', deep: '#1857a3' },
  { key: 'cao-thu', name: 'Cao thủ', rim: '#7b3fd6', face: '#c09cff', hi: '#f0e6ff', deep: '#56259e' }
];
export const tierLook = (key: RankTierKey): TierLook => RANK_TIERS.find(t => t.key === key) ?? RANK_TIERS[0];
export const tierIndex = (key: RankTierKey) => Math.max(0, RANK_TIERS.findIndex(t => t.key === key));

/** Rank emblem: a crest with an acorn gem; wings from Bạc, laurel from Kim cương, crown for Cao thủ. 200×220 box. */
export function emblem(key: RankTierKey, division: string | null, id: string): string {
  const t = tierLook(key), lvl = tierIndex(key);
  const g = `${id}g`, s = `${id}s`;
  let o = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.hi}"/><stop offset=".55" stop-color="${t.face}"/><stop offset="1" stop-color="${t.rim}"/></linearGradient>`
    + `<linearGradient id="${s}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.face}"/><stop offset="1" stop-color="${t.deep}"/></linearGradient></defs>`;
  o += `<ellipse cx="100" cy="206" rx="${54 + lvl * 4}" ry="9" fill="#5a4030" opacity=".13"/>`;
  if (lvl >= 1) {
    const wing = (sx: number) => `<g transform="translate(100 104) scale(${sx} 1)"><path d="M44 -30 C78 -46 98 -34 104 -18 C88 -20 80 -14 74 -8 C92 -4 98 6 98 16 C82 12 74 14 66 20 C78 26 80 36 78 44 C64 36 52 34 42 34Z" fill="url(#${s})" stroke="${t.deep}" stroke-width="3" stroke-linejoin="round"/><path d="M52 -22 C70 -30 84 -28 92 -20 M56 0 C70 -2 80 2 88 8 M52 22 C62 22 70 26 74 32" stroke="${t.hi}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/></g>`;
    o += lvl >= 2 ? wing(1) + wing(-1) : `<g transform="translate(100 104) scale(.8) translate(-100 -104)">${wing(1) + wing(-1)}</g>`;
  }
  if (lvl >= 4) {
    let leaves = '';
    for (let i = 0; i < 6; i++) {
      const a = (200 - i * 22) * Math.PI / 180, x = 100 + Math.cos(a) * 82, y = 120 + Math.sin(a) * -70;
      leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="12" ry="6" transform="rotate(${(-(200 - i * 22) + 90).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="#7fcf8a" stroke="#3f9a50" stroke-width="2"/>`;
    }
    o += `<g opacity=".95">${leaves}<g transform="translate(200 0) scale(-1 1)">${leaves}</g></g>`;
  }
  o += `<path d="M100 22 L160 46 C162 104 146 150 100 178 C54 150 38 104 40 46Z" fill="${t.deep}"/>`
    + `<path d="M100 16 L160 40 C162 98 146 144 100 172 C54 144 38 98 40 40Z" fill="url(#${g})" stroke="${t.rim}" stroke-width="5" stroke-linejoin="round"/>`
    + `<path d="M100 30 L148 50 C148 98 136 132 100 156 C64 132 52 98 52 50Z" fill="${t.face}" stroke="${t.hi}" stroke-width="3" opacity=".9"/>`
    + `<path d="M58 54 L100 36 L100 96 C82 96 66 82 58 54Z" fill="#fff" opacity=".22"/>`;
  o += `<g transform="translate(100 96)"><path d="M-24 -6 C-24 22 -10 40 0 46 C10 40 24 22 24 -6Z" fill="${lvl >= 3 ? '#fff' : '#fff8ec'}" stroke="${t.deep}" stroke-width="4" stroke-linejoin="round"/>`
    + `<path d="M-12 2 C-12 18 -6 30 0 34" stroke="${t.face}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>`
    + `<path d="M-30 -6 C-30 -22 -16 -30 0 -30 C16 -30 30 -22 30 -6Z" fill="${t.rim}" stroke="${t.deep}" stroke-width="4" stroke-linejoin="round"/>`
    + `<path d="M-22 -12 H22 M-18 -20 H18" stroke="${t.hi}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`
    + `<path d="M0 -30 C0 -38 4 -42 9 -44" stroke="${t.deep}" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
  if (lvl === 5) o += `<g transform="translate(100 18)"><path d="M-34 6 L-30 -24 L-16 -8 L0 -32 L16 -8 L30 -24 L34 6Z" fill="#ffc83d" stroke="#d99a00" stroke-width="4" stroke-linejoin="round"/><circle cx="0" cy="-10" r="5" fill="#ff5c7a"/><circle cx="-20" cy="-4" r="3.5" fill="#46b35a"/><circle cx="20" cy="-4" r="3.5" fill="#1c8fe3"/></g>`;
  if (lvl >= 2 && lvl < 5) o += `<circle cx="100" cy="22" r="7" fill="#fff" stroke="${t.rim}" stroke-width="3"/>`;
  if (division) o += `<g transform="translate(100 176)"><path d="M-50 -14 H50 L42 2 L50 18 H-50 L-42 2Z" fill="${t.deep}"/><rect x="-44" y="-18" width="88" height="32" rx="6" fill="${t.rim}" stroke="${t.deep}" stroke-width="3"/><text y="7" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="24" fill="#fff" letter-spacing="1">${division}</text></g>`;
  return o;
}

export const emblemSvg = (key: RankTierKey, division: string | null, id: string) =>
  `<svg viewBox="0 0 200 220" overflow="visible" aria-hidden="true">${emblem(key, division, id)}</svg>`;

const sparkle = (x: number, y: number, r: number, c = '#fff6c9') =>
  `<path d="M${x} ${y - r} L${x + r * .28} ${y - r * .28} L${x + r} ${y} L${x + r * .28} ${y + r * .28} L${x} ${y + r} L${x - r * .28} ${y + r * .28} L${x - r} ${y} L${x - r * .28} ${y - r * .28}Z" fill="${c}" class="rk-tw"/>`;
const flower = (x: number, y: number, c: string, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 V9" stroke="#4e9e57" stroke-width="1.6"/>${[0, 72, 144, 216, 288].map(a => `<circle cx="${(3.6 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(3.6 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="2.7" fill="${c}"/>`).join('')}<circle r="1.9" fill="#fff3b0"/></g>`;
const FLOWERS = ['#ff9ab4', '#fff', '#ffd04d', '#c7b5ff'];
const meadow = (x: number, y: number, n: number, w: number) => Array.from({ length: n }, (_, i) => flower(x + ((i * 37) % w) - w / 2, y + ((i * 13) % 14) - 7, FLOWERS[i % 4], .8)).join('');
export function bunting(x1: number, y1: number, x2: number, y2: number, n: number, sag = 14): string {
  let o = `<path d="M${x1} ${y1} Q${(x1 + x2) / 2} ${(y1 + y2) / 2 + sag} ${x2} ${y2}" fill="none" stroke="#a07a5a" stroke-width="1.6"/>`;
  const cols = ['#ff7a9c', '#ffc83d', '#46b35a', '#1c8fe3', '#a78bfa'];
  for (let i = 1; i < n; i++) {
    const t = i / n, x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * (x1 + x2) / 2 + t * t * x2, y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ((y1 + y2) / 2 + sag) + t * t * y2;
    o += `<path d="M${(x - 6).toFixed(1)} ${y.toFixed(1)} L${(x + 6).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + 13).toFixed(1)}Z" fill="${cols[i % cols.length]}"/>`;
  }
  return o;
}
const cloud = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity=".95"><ellipse cx="0" cy="0" rx="46" ry="16"/><circle cx="-14" cy="-10" r="16"/><circle cx="12" cy="-14" r="20"/></g>`;
const pine = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -60 L18 -24 H8 L24 4 H-24 L-8 -24 H-18Z" fill="#3f9a50"/><rect x="-3" y="4" width="6" height="10" fill="#8e5a35"/></g>`;
const roundTree = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="2" cy="2" rx="24" ry="5" fill="#2f6b3a" opacity=".15"/><rect x="-4" y="-26" width="8" height="28" rx="3" fill="#8e5a35"/><circle cx="0" cy="-44" r="24" fill="#4fae5e"/><circle cx="-10" cy="-36" r="14" fill="#43a052"/><circle cx="9" cy="-54" r="13" fill="#7fd890"/></g>`;
const pennant = (x: number, y: number, h: number, c: string) => `<g transform="translate(${x} ${y})"><path d="M0 0 V${-h}" stroke="#8e5a35" stroke-width="3"/><path d="M0 ${-h} L26 ${-h + 9} L0 ${-h + 18}Z" fill="${c}"/></g>`;

/** Sóc inside an SVG; (x, y) = between the feet. */
export function socAt(mood: SocState, x: number, y: number, w: number, gear: readonly string[], coat: string, cls = ''): string {
  const h = w * 260 / 240;
  return `<g class="${cls}" style="transform-origin:${x}px ${y}px">` + socMoodSvg(mood, gear, coat).replace('<svg viewBox="0 0 240 260"', `<svg x="${(x - w * .47).toFixed(1)}" y="${(y - h * .95).toFixed(1)}" width="${w}" height="${h.toFixed(1)}" viewBox="0 0 240 260" overflow="visible"`) + '</g>';
}

/** The hero scene behind the learner's rank: sky, bunting, hills, the emblem on a pedestal, Sóc with a pennant. */
export function rankScene(W: number, H: number, phone: boolean, tier: RankTierKey, division: string | null, gear: readonly string[], coat: string): string {
  const e = phone ? { x: W / 2 - 44, y: 16, w: 88 } : { x: 100, y: 14, w: 150 };
  const hillY = H - (phone ? 40 : 52);
  const id = phone ? 'rkp' : 'rkd';
  return `<svg class="rk-scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffdcc2"/><stop offset=".6" stop-color="#fff0dd"/><stop offset="1" stop-color="#fff6e8"/></linearGradient>
<radialGradient id="${id}glow"><stop offset="0" stop-color="#fff2b0" stop-opacity=".95"/><stop offset="1" stop-color="#fff2b0" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#${id}sky)"/>
<circle cx="${e.x + e.w / 2}" cy="${e.y + e.w * .5}" r="${e.w * .78}" fill="url(#${id}glow)"/>
${cloud(W * .12, 38, phone ? .34 : .45)}${cloud(W * .86, 30, phone ? .3 : .4)}
${phone ? '' : bunting(-10, 6, W + 10, 10, 13, 22)}
<path d="M0 ${hillY - 18} C${W * .2} ${hillY - 40} ${W * .4} ${hillY - 26} ${W * .55} ${hillY - 32} C${W * .7} ${hillY - 40} ${W * .85} ${hillY - 24} ${W} ${hillY - 34} V${H} H0Z" fill="#cfe9c0"/>
${phone ? '' : pine(W * .08, hillY - 22, .5) + pine(W * .13, hillY - 18, .4)}
<path d="M0 ${hillY} C${W * .25} ${hillY - 18} ${W * .55} ${hillY - 14} ${W * .75} ${hillY - 4} C${W * .88} ${hillY + 2} ${W * .95} ${hillY - 2} ${W} ${hillY - 6} V${H} H0Z" fill="#9fd89c"/>
${meadow(W * .3, hillY + 14, phone ? 8 : 14, W * .5)}
<g transform="translate(${e.x + e.w / 2} ${e.y + e.w * 1.02})"><path d="M${-e.w * .36} 4 C${-e.w * .3} -8 ${e.w * .3} -8 ${e.w * .36} 4 L${e.w * .3} 14 H${-e.w * .3}Z" fill="#c9b79c"/><ellipse cx="0" cy="0" rx="${e.w * .36}" ry="${e.w * .06}" fill="#e7dac4"/></g>
<g class="rk-pop" style="transform-origin:${e.x + e.w / 2}px ${e.y + e.w * .6}px"><svg x="${e.x}" y="${e.y}" width="${e.w}" height="${e.w * 1.1}" viewBox="0 0 200 220" overflow="visible">${emblem(tier, division, id + 'e')}</svg></g>
${sparkle(e.x + e.w * .08, e.y + e.w * .2, phone ? 7 : 9, '#fff')}${sparkle(e.x + e.w * .95, e.y + e.w * .12, phone ? 6 : 8, '#fff')}${sparkle(e.x + e.w * 1.02, e.y + e.w * .62, 6, '#ffe28a')}
${phone ? '' : socAt('proud', W - 92, hillY + 8, 92, gear, coat, 'rk-hop') + pennant(W - 40, hillY + 10, 46, '#ffc83d')}
${phone ? '' : roundTree(30, H + 6, .9)}
</svg>`;
}

/** Not joined: the climb from Đồng to Cao thủ, Sóc at the foot. */
export function climbScene(W: number, H: number, phone: boolean, gear: readonly string[], coat: string): string {
  const spots: Array<[RankTierKey, number, number]> = [['dong', .15, .82], ['bac', .46, .75], ['vang', .77, .62], ['bach-kim', .52, .5], ['kim-cuong', .25, .36], ['cao-thu', .55, .17]];
  const w = phone ? 54 : 74;
  const road = spots.map(([, x, y], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(0)} ${(y * H + w * .45).toFixed(0)}`).join(' ');
  return `<svg class="rk-scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><linearGradient id="clsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9c4"/><stop offset="1" stop-color="#fff3e2"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#clsky)"/><circle cx="${W * .82}" cy="${H * .17}" r="${W * .055}" fill="#ffd24d"/>
${cloud(W * .2, H * .12, phone ? .5 : .75)}${cloud(W * .64, H * .3, phone ? .4 : .55)}
<path d="M${W * -.1} ${H} L${W * .55} ${H * .13} L${W * 1.1} ${H}Z" fill="#a8dba0"/><path d="M${W * .2} ${H} C${W * .4} ${H * .72} ${W * .7} ${H * .62} ${W * 1.1} ${H * .8} V${H}Z" fill="#8fd08a"/>
<path d="${road}" fill="none" stroke="#f3dcb5" stroke-width="${phone ? 9 : 13}" stroke-linecap="round" stroke-linejoin="round"/>
${spots.map(([k, x, y], i) => `<svg x="${(x * W - w / 2).toFixed(0)}" y="${(y * H - w * .52).toFixed(0)}" width="${w}" height="${(w * 1.1).toFixed(0)}" viewBox="0 0 200 220" overflow="visible">${emblem(k, null, 'cl' + i)}</svg><text x="${(x * W).toFixed(0)}" y="${(y * H + w * .62).toFixed(0)}" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="${phone ? 11 : 14}" fill="#3d4842" stroke="#fff" stroke-width="3" paint-order="stroke">${tierLook(k).name}</text>`).join('')}
${socAt('hi', W * .3, H * .95, phone ? 56 : 72, gear, coat, 'rk-hop')}
${meadow(W * .5, H * .93, phone ? 8 : 14, W * .8)}${phone ? '' : roundTree(W * .05, H * .86, .8) + roundTree(W * .94, H * 1.0, .9)}
</svg>`;
}

/** Hồ sơ room: bunting, a round window, a shelf, the rug and Sóc wearing the selection. */
export function roomScene(W: number, H: number, sw: number, phone: boolean, gear: readonly string[], coat: string): string {
  const floorY = phone ? H * .74 : H - 150;
  const id = phone ? 'rmp' : 'rmd', r = phone ? 32 : 43;
  return `<svg class="rk-room" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs><pattern id="${id}dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2" fill="#ffd7b5"/><circle cx="16" cy="16" r="2" fill="#ffe3c9"/></pattern>
<linearGradient id="${id}win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe6ff"/><stop offset="1" stop-color="#fff0dd"/></linearGradient>
<radialGradient id="${id}lamp"><stop offset="0" stop-color="#fff6d0" stop-opacity=".95"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="#ffecd8"/><rect width="${W}" height="${floorY}" fill="url(#${id}dots)"/>
${bunting(-6, phone ? 8 : 14, W + 6, phone ? 10 : 16, phone ? 9 : 10, phone ? 14 : 22)}
<g transform="translate(${W * (phone ? .2 : .78)} ${H * (phone ? .36 : .26)})"><circle r="${r + 6}" fill="#c98e5a"/><circle r="${r}" fill="url(#${id}win)"/><path d="M${-r} ${r * .4} C-10 ${r * .1} 10 ${r * .2} ${r} ${r * .15} A${r} ${r} 0 0 1 ${-r} ${r * .4}Z" fill="#9fd89c"/><path d="M0 ${-r} V${r} M${-r} 0 H${r}" stroke="#c98e5a" stroke-width="4"/></g>
<g transform="translate(${W * (phone ? .8 : .17)} ${H * (phone ? .34 : .5)})"><rect x="-44" y="0" width="88" height="7" rx="3" fill="#b77b47"/>
<g transform="translate(-28 0)"><path d="M-8 -2 C-8 -14 8 -14 8 -2Z" fill="#a8723f"/><path d="M-7 -4 C-7 6 7 6 7 -4" fill="#e9b47a"/></g>
<g><path d="M-9 -20 H9 V-12 A9 9 0 0 1 -9 -12Z" fill="#ffc83d"/><rect x="-2" y="-8" width="4" height="5" fill="#d99a00"/><rect x="-7" y="-4" width="14" height="4" rx="1.5" fill="#d99a00"/></g>
<g transform="translate(28 0)"><rect x="-10" y="-22" width="6" height="22" rx="1" fill="#ff7a9c"/><rect x="-4" y="-18" width="6" height="18" rx="1" fill="#1c8fe3"/><rect x="2" y="-24" width="6" height="24" rx="1" fill="#46b35a"/></g></g>
<circle cx="${W / 2}" cy="${floorY - H * .2}" r="${H * .4}" fill="url(#${id}lamp)"/>
<rect y="${floorY}" width="${W}" height="${H - floorY}" fill="#e9c69c"/>${[1, 2, 3].map(k => `<path d="M0 ${floorY + (H - floorY) * k / 4} H${W}" stroke="#dcb488" stroke-width="2"/>`).join('')}
<ellipse cx="${W / 2}" cy="${phone ? floorY + (H - floorY) * .42 : floorY + 22}" rx="${sw * .95}" ry="${phone ? (H - floorY) * .28 : 18}" fill="#ff9ab4"/><ellipse cx="${W / 2}" cy="${phone ? floorY + (H - floorY) * .42 : floorY + 22}" rx="${sw * .75}" ry="${phone ? (H - floorY) * .19 : 12}" fill="#ffc0d0"/>
<g transform="translate(${W * (phone ? .9 : .86)} ${floorY + 6})"><path d="M-14 0 L-10 22 H10 L14 0Z" fill="#e07a4f"/><path d="M0 0 C-4 -20 -18 -26 -22 -36 C-6 -32 0 -18 0 0 C2 -22 10 -34 22 -38 C18 -24 6 -16 0 0" fill="#46b35a"/></g>
${socAt('proud', W / 2, phone ? floorY + (H - floorY) * .46 : floorY + 26, sw, gear, coat, 'rk-hop')}
${sparkle(W / 2 + sw * .55, floorY - sw, phone ? 8 : 10, '#ffd04d')}${sparkle(W / 2 - sw * .55, floorY - sw * .75, phone ? 6 : 8, '#fff')}
</svg>`;
}

/* ---- badge medals ---- */
const MEDAL_ICON: Record<string, string> = {
  repeat: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5"/>',
  broom: '<path d="M14 3l-4 9M7 12h7l2 9H5z"/><path d="M9 16v5M12 16v5"/>',
  cardok: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  pencil: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  calok: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4M9 15l2 2 4-4"/>',
  up: '<path d="M4 17l6-6 4 4 6-7M14 8h6v6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  ear: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM12 14v4M8 20h8M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  flame: '<path d="M12 21c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 2-5 5-5 8 0 4 3 7 7 7z"/>',
  door: '<path d="M6 21V4h9v17M3 21h18M15 4l4 2v15"/><circle cx="12" cy="13" r="1" fill="currentColor"/>',
  week: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18"/><path d="M6 14h2M10 14h2M14 14h2M6 17h2M10 17h2M14 17h2"/>',
  seven: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 8h6l-4 8"/>',
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19l8-8"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  timer: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M10 3h4"/>',
  read: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>'
};
const MEDAL_TIER = [
  { rim: '#c9cec9', face: '#eef0ec', hi: '#fafbf9' },
  { rim: '#b8682c', face: '#f0ab70', hi: '#ffd8b0' },
  { rim: '#7e8ea8', face: '#d6dfeb', hi: '#f4f7fb' },
  { rim: '#d99a00', face: '#ffd04d', hi: '#fff3bf' }
];

/** Medal: ribbon tails + coin with the badge icon; tier 0 = not earned yet (grey). */
export function medalSvg(icon: string, tier: number, color: string): string {
  const t = MEDAL_TIER[tier] ?? MEDAL_TIER[0];
  const ribbon = tier ? color : '#cfd4cf';
  return `<svg viewBox="0 0 100 100" overflow="visible" aria-hidden="true"><path d="M30 4 L44 4 L54 40 L40 40Z" fill="${ribbon}" opacity=".85"/><path d="M70 4 L56 4 L46 40 L60 40Z" fill="${ribbon}"/>`
    + `<circle cx="50" cy="60" r="36" fill="${t.rim}"/><circle cx="50" cy="58" r="36" fill="${t.face}"/><circle cx="50" cy="58" r="28" fill="${tier ? '#fff' : '#f7f8f6'}" stroke="${t.hi}" stroke-width="4"/>`
    + `<path d="M24 46 A30 30 0 0 1 50 26" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".55"/>`
    + `<g transform="translate(34 42) scale(1.34)" fill="none" stroke="${tier ? color : '#aab1ab'}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${MEDAL_ICON[icon] ?? ''}</g>`
    + (tier === 3 ? sparkle(86, 30, 8, '#ffd04d') + sparkle(14, 74, 6, '#ffd04d') : '') + '</svg>';
}
