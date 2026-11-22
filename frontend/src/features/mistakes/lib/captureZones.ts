/**
 * The two capture zones of a Part 7 group: ① Đoạn văn (optional, sent as context images) and ② Câu hỏi. Part 6 and
 * Part 3/4 groups, like Part 1/2/5, use one tray (all images of the group sent together, in order). One zone is
 * active; every import (paste, drop on the tray, folder watcher, camera) lands there in arrival order.
 * An image changes zone only when the learner moves it.
 */
export type CaptureZone = 'passage' | 'questions';
export type Zoned<T> = Record<CaptureZone, T[]>;

/** Only Part 7 shows the ①/② zones. */
export const hasZones = (part: number) => part === 7;
/** The zone a group opens on. */
export const FIRST_ZONE: CaptureZone = 'passage';
export const otherZone = (zone: CaptureZone): CaptureZone => zone === 'passage' ? 'questions' : 'passage';
/** Desktop keys 1/2 pick a zone. */
export const zoneForKey = (key: string): CaptureZone | null => key === '1' ? 'passage' : key === '2' ? 'questions' : null;

/** Where an import goes: the zone it was dropped on, else the active zone; one-tray Parts have one zone. */
export const importZone = (zoned: boolean, active: CaptureZone | null, explicit?: CaptureZone): CaptureZone =>
  !zoned ? 'questions' : explicit ?? active ?? FIRST_ZONE;

export function addToZone<T>(zones: Zoned<T>, zone: CaptureZone, items: readonly T[]): Zoned<T> {
  return { ...zones, [zone]: [...zones[zone], ...items] };
}

export function removeFromZones<T extends { id: string }>(zones: Zoned<T>, zone: CaptureZone, id: string): Zoned<T> {
  return { ...zones, [zone]: zones[zone].filter(item => item.id !== id) };
}

/** Moves one image a place earlier or later inside its zone. */
export function reorderInZone<T extends { id: string }>(zones: Zoned<T>, zone: CaptureZone, id: string, delta: -1 | 1): Zoned<T> {
  const list = zones[zone], index = list.findIndex(item => item.id === id), target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return zones;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return { ...zones, [zone]: next };
}

/** The learner's "Chuyển sang ②/①": the image goes to the end of the other zone. */
export function switchZone<T extends { id: string }>(zones: Zoned<T>, from: CaptureZone, id: string): Zoned<T> {
  const item = zones[from].find(entry => entry.id === id);
  if (!item) return zones;
  const to = otherZone(from);
  return { ...zones, [from]: zones[from].filter(entry => entry.id !== id), [to]: [...zones[to], item] };
}
