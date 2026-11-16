

export interface Level { n: number; name: string; /** Total stars needed. */ stars: number }
export const LEVELS: readonly Level[] = [
  { n: 1, name: 'Người mới', stars: 0 },
  { n: 2, name: 'Tập sự', stars: 5 },
  { n: 3, name: 'Chăm chỉ', stars: 12 },
  { n: 4, name: 'Thợ săn điểm', stars: 20 },
  { n: 5, name: 'Leo núi', stars: 36 },
  { n: 6, name: 'Chinh phục', stars: 55 },
  { n: 7, name: 'Huyền thoại TOEIC', stars: 80 }
];

export function levelForStars(stars: number): Level {
  let current = LEVELS[0];
  for (const level of LEVELS) if (stars >= level.stars) current = level;
  return current;
}

export interface LevelProgress {
  level: Level;
  next: Level | null;
  stars: number;
  /** Stars still missing for the next level (0 at the top). */
  toNext: number;
  /** Ring fill: stars so far over the next level's total (1 at the top). */
  ratio: number;
}

export function levelProgress(stars: number): LevelProgress {
  const total = Math.max(0, Math.floor(stars));
  const level = levelForStars(total);
  const next = LEVELS.find(l => l.n === level.n + 1) ?? null;
  return { level, next, stars: total, toNext: next ? next.stars - total : 0, ratio: next ? Math.min(1, total / next.stars) : 1 };
}

/** Levels reached since the learner last saw the page, oldest first (never level 1). */
export function levelsGained(seenLevel: number, nowLevel: number): number[] {
  const out: number[] = [];
  for (let n = Math.max(2, seenLevel + 1); n <= nowLevel; n++) out.push(n);
  return out;
}

const seenKey = (owner: string | null) => `rd_level_seen_v1:${owner ?? 'guest'}`;

/**
 * Levels the learner has not been shown yet. The very first call only records the current
 * level (nothing to celebrate for people who already had stars), like the badge reveal.
 */
export function pendingLevelUps(nowLevel: number, owner: string | null): number[] {
  try {
    const raw = localStorage.getItem(seenKey(owner));
    if (raw === null) { localStorage.setItem(seenKey(owner), String(nowLevel)); return []; }
    const seen = Number(raw);
    return Number.isFinite(seen) ? levelsGained(seen, nowLevel) : [];
  } catch { return []; }
}
export function markLevelSeen(level: number, owner: string | null): void {
  try {
    const seen = Number(localStorage.getItem(seenKey(owner)));
    if (!(seen >= level)) localStorage.setItem(seenKey(owner), String(level));
  } catch { /* The gift may show again next visit. */ }
}
