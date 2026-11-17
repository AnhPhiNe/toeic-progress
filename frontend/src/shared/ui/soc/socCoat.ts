/* Coat colours from design/previews/mock-soc-variety.html: a palette swap of the fur only (eyes, nose, cheeks and gear stay). */
export type SocCoatId = 'nau' | 'xam' | 'kem' | 'soco' | 'dau';

export interface SocCoat {
  id: SocCoatId;
  label: string;
  /** Main fur, darker fur (tail, paws, tuft), feet, cream belly and face, tail stripe, inner ear. */
  fur: string;
  dark: string;
  feet: string;
  cream: string;
  stripe: string;
  ear: string;
}

export const SOC_COATS: readonly SocCoat[] = [
  { id: 'nau', label: 'Nâu cam', fur: '#f4a261', dark: '#e58a45', feet: '#d9773a', cream: '#fff1dc', stripe: '#ffe3c2', ear: '#ffb5a7' },
  { id: 'xam', label: 'Xám tro', fur: '#a9b2bf', dark: '#8a94a3', feet: '#7b8594', cream: '#f3f5f8', stripe: '#e4e8ee', ear: '#f6c7cf' },
  { id: 'kem', label: 'Kem sữa', fur: '#f2d6aa', dark: '#dfbd88', feet: '#d1ab73', cream: '#fffaf0', stripe: '#fff3dd', ear: '#ffc2b4' },
  { id: 'soco', label: 'Sô-cô-la', fur: '#9b6a4c', dark: '#7d5137', feet: '#6b442d', cream: '#f3e2d1', stripe: '#d9b896', ear: '#e8a99a' },
  { id: 'dau', label: 'Hồng dâu', fur: '#f3a7b6', dark: '#e3869a', feet: '#d77689', cream: '#fff2f4', stripe: '#ffe1e7', ear: '#ff9eb2' }
];

export const DEFAULT_COAT: SocCoatId = 'nau';
const BY_ID = new Map<string, SocCoat>(SOC_COATS.map(c => [c.id, c]));
const BASE = BY_ID.get(DEFAULT_COAT)!;

export const isSocCoat = (value: unknown): value is SocCoatId => typeof value === 'string' && BY_ID.has(value);
/** The coat for an id; anything unknown (missing, old or a future coat) is Nâu cam. */
export const socCoat = (id?: string | null): SocCoat => (id && BY_ID.get(id)) || BASE;

const KEYS = ['fur', 'dark', 'feet', 'cream', 'stripe', 'ear'] as const;

/** Swap the Nâu cam fur colours of a Sóc SVG for another coat (a no-op for Nâu cam). */
export function applyCoat(svg: string, id?: string | null): string {
  const coat = socCoat(id);
  if (coat === BASE) return svg;
  let out = svg;
  for (const k of KEYS) out = out.split(BASE[k]).join(coat[k]);
  return out;
}

/** Small round swatch: cream face patch over the fur, as in the sketch. */
export const coatSwatch = (coat: SocCoat): string => `radial-gradient(circle at 35% 35%, ${coat.cream} 0 28%, ${coat.fur} 30%)`;
