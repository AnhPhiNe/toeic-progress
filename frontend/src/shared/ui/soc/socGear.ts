/* Port of the accessories in design/previews/mock-soc-gear.html. Pure SVG strings, injected at marker comments in socSvg. */
export type SocGearId = 'scarf' | 'pack' | 'glasses' | 'helmet' | 'cape' | 'crown';
export type GearSlot = 'body' | 'head';

export interface GearItem {
  id: SocGearId;
  label: string;
  emoji: string;
  /** Level that unlocks it. */
  level: number;
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
export const gearItem = (id: string): GearItem | undefined => BY_ID.get(id);
export const gearAtLevel = (level: number): GearItem | undefined => GEAR.find(g => g.level === level);
export const unlockedGear = (level: number): GearItem[] => GEAR.filter(g => g.level <= level);

/** Keep known, unlocked ids once each; of the head items only the last one survives. */
export function sanitizeGear(ids: readonly string[], level: number): SocGearId[] {
  let out: GearItem[] = [];
  for (const id of ids) {
    const item = BY_ID.get(id);
    if (!item || item.level > level) continue;
    out = [...out.filter(o => o.id !== item.id && !(item.slot === 'head' && o.slot === 'head')), item];
  }
  return out.map(o => o.id);
}

/** What Sóc wears: the saved outfit, or (never chosen) just the newest unlocked item. */
export function wornGear(saved: readonly string[] | undefined, level: number): SocGearId[] {
  if (saved) return sanitizeGear(saved, level);
  const latest = unlockedGear(level).slice(-1)[0];
  return latest ? [latest.id] : [];
}

/** Put an item on (head items replace each other) or take it off; returns the new outfit. */
export function toggleGear(current: readonly string[], id: SocGearId, level: number): SocGearId[] {
  const item = BY_ID.get(id);
  if (!item || item.level > level) return sanitizeGear(current, level);
  if (current.includes(id)) return sanitizeGear(current.filter(g => g !== id), level);
  return sanitizeGear([...current, id], level);
}

const BACK: Partial<Record<SocGearId, string>> = {
  pack: `<g transform="translate(130 168)"><rect x="0" y="0" width="44" height="54" rx="14" fill="#46b35a"/><rect x="6" y="20" width="32" height="22" rx="8" fill="#3a9a4d"/><rect x="16" y="-6" width="12" height="10" rx="4" fill="#2f8a42"/></g>`,
  cape: `<path d="M72 168 C60 200 52 232 60 246 L160 246 C168 232 160 200 148 168Z" fill="#e0475f"/><path d="M76 176 C70 204 66 228 70 244" stroke="#c23650" stroke-width="4" fill="none"/>`
};
const FRONT: Partial<Record<SocGearId, string>> = {
  scarf: `<path d="M72 158 C90 172 130 172 148 158 L150 172 C130 186 90 186 70 172Z" fill="#ff5c7a"/><path d="M80 164 v10 M96 168 v10 M112 169 v10 M128 168 v10 M142 164 v10" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M128 174 L136 214 L150 210 L142 172Z" fill="#ff5c7a"/><path d="M136 214 l4 6 M142 212 l4 6 M148 210 l4 6" stroke="#ff5c7a" stroke-width="3" stroke-linecap="round"/>`,
  pack: `<path d="M84 168 C80 190 82 214 88 226" stroke="#2f8a42" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M136 168 C140 190 138 214 132 226" stroke="#2f8a42" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  cape: `<path d="M70 160 Q110 182 150 160 L156 172 Q110 196 64 172Z" fill="#ff6b80"/><circle cx="110" cy="178" r="7" fill="#ffc83d"/>`
};
const HEAD: Partial<Record<SocGearId, string>> = {
  glasses: `<g fill="rgba(180,220,255,.25)" stroke="#2f3a33" stroke-width="5"><circle cx="82" cy="113" r="20"/><circle cx="138" cy="113" r="20"/></g><path d="M102 112 Q110 106 118 112" stroke="#2f3a33" stroke-width="5" fill="none"/><path d="M62 108 L44 100 M158 108 L176 100" stroke="#2f3a33" stroke-width="5" stroke-linecap="round"/><path d="M72 104 l8 -6" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`,
  helmet: `<path d="M64 62 C64 26 156 26 156 62 Z" fill="#ffc83d"/><path d="M56 64 H164 Q166 72 158 74 H62 Q54 72 56 64Z" fill="#e8a516"/><path d="M90 34 Q110 24 130 34" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/><rect x="100" y="38" width="20" height="16" rx="5" fill="#2f3a33"/><circle cx="110" cy="46" r="5" fill="#fff6c8"/>`,
  crown: `<path d="M74 52 L80 14 L96 34 L110 6 L124 34 L140 14 L146 52Z" fill="#ffc83d" stroke="#e0a400" stroke-width="3" stroke-linejoin="round"/><rect x="72" y="48" width="76" height="12" rx="4" fill="#e0a400"/><circle cx="110" cy="34" r="6" fill="#ff5c7a"/><circle cx="88" cy="40" r="4" fill="#1c8fe3"/><circle cx="132" cy="40" r="4" fill="#46b35a"/><path d="M96 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#fff"/>`
};

export const GEAR_MARK = { back: '<!--g:back-->', front: '<!--g:front-->', head: '<!--g:head-->' } as const;

const layer = (map: Partial<Record<SocGearId, string>>, ids: readonly string[]) =>
  GEAR.filter(g => ids.includes(g.id)).map(g => map[g.id] ?? '').join('');

/** Replace the marker comments in a Sóc SVG with the worn accessories (markers are always removed). */
export function applyGear(svg: string, ids: readonly string[] = []): string {
  return svg
    .replace(GEAR_MARK.back, layer(BACK, ids))
    .replace(GEAR_MARK.front, layer(FRONT, ids))
    .replace(GEAR_MARK.head, layer(HEAD, ids));
}
