/* Port of the accessories in design/previews/mock-soc-gear.html. Pure SVG strings, injected at marker comments in socSvg. */
export type BaseGearId = 'scarf' | 'pack' | 'glasses' | 'helmet' | 'cape' | 'crown';
/** Season rewards from Xếp hạng, one per season: e.g. 'ao-choang.m1' (seasonal colour). */
export type RankGearBase = 'frame-bac' | 'frame-vang' | 'khan-ngoc' | 'ao-choang' | 'vuong-mien';
export type SocGearId = BaseGearId | `${RankGearBase}.m${number}`;
/** body items combine; one head item and one frame at a time. */
export type GearSlot = 'body' | 'head' | 'frame';

export interface GearItem {
  id: SocGearId;
  label: string;
  emoji: string;
  /** Level that unlocks it (0 for season rewards, which need to be owned). */
  level: number;
  /** Season rewards: the season and the rank tier that earned it. */
  season?: number;
  rankTier?: 'bac' | 'vang' | 'bach-kim' | 'kim-cuong' | 'cao-thu';
  /** Head items: only one is worn at a time. */
  slot: GearSlot;
}

export const GEAR: readonly GearItem[] = [
  { id: 'scarf', label: 'Khăn quàng', emoji: '🧣', level: 2, slot: 'body' },
  { id: 'pack', label: 'Balo', emoji: '🎒', level: 3, slot: 'body' },
  { id: 'glasses', label: 'Kính tròn', emoji: '👓', level: 4, slot: 'head' },
  { id: 'helmet', label: 'Mũ leo núi', emoji: '⛑️', level: 5, slot: 'head' },
  { id: 'cape', label: 'Áo choàng', emoji: '🧥', level: 6, slot: 'body' },
  { id: 'crown', label: 'Vương miện', emoji: '👑', level: 7, slot: 'head' }
];
const BY_ID = new Map<string, GearItem>(GEAR.map(g => [g.id, g]));

const RANK_GEAR: Record<RankGearBase, { label: string; emoji: string; slot: GearSlot; rankTier: NonNullable<GearItem['rankTier']> }> = {
  'frame-bac': { label: 'Khung Bạc', emoji: '🥈', slot: 'frame', rankTier: 'bac' },
  'frame-vang': { label: 'Khung Vàng', emoji: '🥇', slot: 'frame', rankTier: 'vang' },
  'khan-ngoc': { label: 'Khăn ngọc', emoji: '🧣', slot: 'body', rankTier: 'bach-kim' },
  'ao-choang': { label: 'Áo choàng mùa', emoji: '🧥', slot: 'body', rankTier: 'kim-cuong' },
  'vuong-mien': { label: 'Vương miện mùa', emoji: '👑', slot: 'head', rankTier: 'cao-thu' }
};
export const RANK_GEAR_BASES = Object.keys(RANK_GEAR) as RankGearBase[];
export const rankGearLabel = (base: RankGearBase) => RANK_GEAR[base].label;
const RANK_ID = /^(frame-bac|frame-vang|khan-ngoc|ao-choang|vuong-mien)\.m([1-9][0-9]{0,2})$/;

/** A season reward item from its id ('ao-choang.m2'), or undefined. */
export function rankGearItem(id: string): GearItem | undefined {
  const m = RANK_ID.exec(id);
  if (!m) return undefined;
  const base = RANK_GEAR[m[1] as RankGearBase];
  return { id: id as SocGearId, label: base.label, emoji: base.emoji, level: 0, slot: base.slot, season: Number(m[2]), rankTier: base.rankTier };
}
const lookup = (id: string): GearItem | undefined => BY_ID.get(id) ?? rankGearItem(id);
export const gearItem = (id: string): GearItem | undefined => lookup(id);
export const gearAtLevel = (level: number): GearItem | undefined => GEAR.find(g => g.level === level);
export const unlockedGear = (level: number): GearItem[] => GEAR.filter(g => g.level <= level);
const usable = (item: GearItem, level: number, owned: readonly string[]) => (item.season ? owned.includes(item.id) : item.level <= level);

/** Keep known, unlocked (or owned) ids once each; of head items and frames only the last one survives. */
export function sanitizeGear(ids: readonly string[], level: number, owned: readonly string[] = []): SocGearId[] {
  let out: GearItem[] = [];
  for (const id of ids) {
    const item = lookup(id);
    if (!item || !usable(item, level, owned)) continue;
    out = [...out.filter(o => o.id !== item.id && !(item.slot !== 'body' && o.slot === item.slot)), item];
  }
  return out.map(o => o.id);
}

/** What Sóc wears: the saved outfit, or (never chosen) just the newest unlocked item. */
export function wornGear(saved: readonly string[] | undefined, level: number, owned: readonly string[] = []): SocGearId[] {
  if (saved) return sanitizeGear(saved, level, owned);
  const latest = unlockedGear(level).slice(-1)[0];
  return latest ? [latest.id] : [];
}

/** Put an item on (head items and frames replace each other) or take it off; returns the new outfit. */
export function toggleGear(current: readonly string[], id: SocGearId, level: number, owned: readonly string[] = []): SocGearId[] {
  const item = lookup(id);
  if (!item || !usable(item, level, owned)) return sanitizeGear(current, level, owned);
  if (current.includes(id)) return sanitizeGear(current.filter(g => g !== id), level, owned);
  return sanitizeGear([...current, id], level, owned);
}

/** Seasonal colours for season rewards: [main, light, deep]. */
const SEASON_COLORS: readonly [string, string, string][] = [
  ['#7b3fd6', '#c09cff', '#56259e'], ['#1f9e93', '#7fe0d3', '#127a71'], ['#e0475f', '#ff9db0', '#b02a42'], ['#2477d6', '#8cc8ff', '#1857a3']
];
export const seasonColor = (season: number) => SEASON_COLORS[(Math.max(1, season) - 1) % SEASON_COLORS.length];

function rankLayers(item: GearItem): { back: string; front: string; head: string } {
  const [main, light, deep] = seasonColor(item.season ?? 1);
  const base = item.id.split('.')[0] as RankGearBase;
  if (base === 'frame-bac' || base === 'frame-vang') {
    const [rim, hi] = base === 'frame-vang' ? ['#d99a00', '#ffd04d'] : ['#7e8ea8', '#d6dfeb'];
    return { back: `<circle cx="110" cy="138" r="112" fill="${hi}" opacity=".35"/><circle cx="110" cy="138" r="112" fill="none" stroke="${rim}" stroke-width="9"/><circle cx="110" cy="138" r="103" fill="none" stroke="${hi}" stroke-width="4"/><circle cx="110" cy="26" r="9" fill="${hi}" stroke="${rim}" stroke-width="4"/>`, front: '', head: '' };
  }
  if (base === 'khan-ngoc') {
    return { back: '', head: '', front: `<path d="M72 158 C90 172 130 172 148 158 L150 172 C130 186 90 186 70 172Z" fill="#2bb5a0"/><path d="M80 164 v10 M96 168 v10 M112 169 v10 M128 168 v10 M142 164 v10" stroke="#d6fbf5" stroke-width="3" opacity=".8"/><path d="M128 174 L136 214 L150 210 L142 172Z" fill="#1f9e93"/><circle cx="110" cy="176" r="6" fill="#d6fbf5" stroke="#127a71" stroke-width="2"/>` };
  }
  if (base === 'ao-choang') {
    return { head: '', back: `<path d="M72 168 C60 200 52 232 60 246 L160 246 C168 232 160 200 148 168Z" fill="${main}"/><path d="M76 176 C70 204 66 228 70 244" stroke="${deep}" stroke-width="4" fill="none"/>`,
      front: `<path d="M70 160 Q110 182 150 160 L156 172 Q110 196 64 172Z" fill="${light}"/><circle cx="110" cy="178" r="7" fill="#ffc83d"/>` };
  }
  return { back: '', front: '', head: `<path d="M74 52 L80 14 L96 34 L110 6 L124 34 L140 14 L146 52Z" fill="${light}" stroke="${deep}" stroke-width="3" stroke-linejoin="round"/><rect x="72" y="48" width="76" height="12" rx="4" fill="${main}"/><circle cx="110" cy="34" r="6" fill="#ffc83d"/><circle cx="88" cy="40" r="4" fill="#fff"/><circle cx="132" cy="40" r="4" fill="#fff"/>` };
}

const BACK: Partial<Record<BaseGearId, string>> = {
  pack: `<g transform="translate(130 168)"><rect x="0" y="0" width="44" height="54" rx="14" fill="#46b35a"/><rect x="6" y="20" width="32" height="22" rx="8" fill="#3a9a4d"/><rect x="16" y="-6" width="12" height="10" rx="4" fill="#2f8a42"/></g>`,
  cape: `<path d="M72 168 C60 200 52 232 60 246 L160 246 C168 232 160 200 148 168Z" fill="#e0475f"/><path d="M76 176 C70 204 66 228 70 244" stroke="#c23650" stroke-width="4" fill="none"/>`
};
const FRONT: Partial<Record<BaseGearId, string>> = {
  scarf: `<path d="M72 158 C90 172 130 172 148 158 L150 172 C130 186 90 186 70 172Z" fill="#ff5c7a"/><path d="M80 164 v10 M96 168 v10 M112 169 v10 M128 168 v10 M142 164 v10" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M128 174 L136 214 L150 210 L142 172Z" fill="#ff5c7a"/><path d="M136 214 l4 6 M142 212 l4 6 M148 210 l4 6" stroke="#ff5c7a" stroke-width="3" stroke-linecap="round"/>`,
  pack: `<path d="M84 168 C80 190 82 214 88 226" stroke="#2f8a42" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M136 168 C140 190 138 214 132 226" stroke="#2f8a42" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  cape: `<path d="M70 160 Q110 182 150 160 L156 172 Q110 196 64 172Z" fill="#ff6b80"/><circle cx="110" cy="178" r="7" fill="#ffc83d"/>`
};
const HEAD: Partial<Record<BaseGearId, string>> = {
  glasses: `<g fill="rgba(180,220,255,.25)" stroke="#2f3a33" stroke-width="5"><circle cx="82" cy="113" r="20"/><circle cx="138" cy="113" r="20"/></g><path d="M102 112 Q110 106 118 112" stroke="#2f3a33" stroke-width="5" fill="none"/><path d="M62 108 L44 100 M158 108 L176 100" stroke="#2f3a33" stroke-width="5" stroke-linecap="round"/><path d="M72 104 l8 -6" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`,
  helmet: `<path d="M64 62 C64 26 156 26 156 62 Z" fill="#ffc83d"/><path d="M56 64 H164 Q166 72 158 74 H62 Q54 72 56 64Z" fill="#e8a516"/><path d="M90 34 Q110 24 130 34" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/><rect x="100" y="38" width="20" height="16" rx="5" fill="#2f3a33"/><circle cx="110" cy="46" r="5" fill="#fff6c8"/>`,
  crown: `<path d="M74 52 L80 14 L96 34 L110 6 L124 34 L140 14 L146 52Z" fill="#ffc83d" stroke="#e0a400" stroke-width="3" stroke-linejoin="round"/><rect x="72" y="48" width="76" height="12" rx="4" fill="#e0a400"/><circle cx="110" cy="34" r="6" fill="#ff5c7a"/><circle cx="88" cy="40" r="4" fill="#1c8fe3"/><circle cx="132" cy="40" r="4" fill="#46b35a"/><path d="M96 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#fff"/>`
};

export const GEAR_MARK = { back: '<!--g:back-->', front: '<!--g:front-->', head: '<!--g:head-->' } as const;

type Layer = 'back' | 'front' | 'head';
const layer = (which: Layer, ids: readonly string[]) => {
  const map = which === 'back' ? BACK : which === 'front' ? FRONT : HEAD;
  return GEAR.filter(g => ids.includes(g.id)).map(g => map[g.id as BaseGearId] ?? '').join('')
    + ids.map(id => rankGearItem(id)).filter((g): g is GearItem => Boolean(g)).map(g => rankLayers(g)[which]).join('');
};

/** Replace the marker comments in a Sóc SVG with the worn accessories (markers are always removed). */
export function applyGear(svg: string, ids: readonly string[] = []): string {
  return svg
    .replace(GEAR_MARK.back, layer('back', ids))
    .replace(GEAR_MARK.front, layer('front', ids))
    .replace(GEAR_MARK.head, layer('head', ids));
}

/** All drawing of one item (back, front and head layers together), for animations that drop the item onto Sóc. */
export function gearFragment(id: SocGearId): string {
  const rank = rankGearItem(id);
  if (rank) { const l = rankLayers(rank); return l.back + l.front + l.head; }
  const key = id as BaseGearId;
  return (BACK[key] ?? '') + (FRONT[key] ?? '') + (HEAD[key] ?? '');
}
