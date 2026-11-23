import { backendRequest } from '@/shared/api/api';
import type { LeagueState } from './leagueApi';

export type RankTierKey = 'dong' | 'bac' | 'vang' | 'bach-kim' | 'kim-cuong' | 'cao-thu';
export type BoardKey = 'stars' | 'listening' | 'reading' | 'minutes' | 'streak' | 'reviews';

/** A rank as the server describes it ("Vàng II"; Cao thủ has no division). */
export interface RankName { level: number; tier: RankTierKey; tierName: string; division: string | null; name: string }

/** One learner on a board: public fields only, values are never raw TOEIC scores. */
export interface BoardRow {
  rank: number;
  nickname: string;
  coat: string;
  /** null = nothing yet (e.g. no test for Tiến bộ). */
  value: number | null;
  me: boolean;
  /** Latest season reward from Bạc up: frame colour and, from Vàng, the name tag. */
  award: { tier: RankTierKey; season: number } | null;
}

export interface WeekChange { stars: number; base: number; bonus: number; penalty: number; delta: number }

export interface RankState extends LeagueState {
  season: { number: number; start: string | null; end: string | null; daysLeft: number | null };
  rules: { pointsPerDivision: number; starsPerPoint: number; maxStarPoints: number; topBonus: number; bottomPenalty: number; zeroPenalty: number; demoteLandsAt: number; seasonWeeks: number };
  rank: (RankName & { points: number; toNext: number | null; next: RankName | null; best: RankName | null; shield: boolean; shieldUsedWeek: string | null }) | null;
  boards: Record<BoardKey, BoardRow[]> | null;
  zones: { up: number; down: number; size: number } | null;
  /** This week's change so far by the finalise rules (shield not counted). */
  preview: WeekChange | null;
  rankWeek: { weekStart: string; stars: number; rank: number; delta: number; shield: boolean; before: RankName & { points: number }; after: RankName & { points: number } } | null;
  rewards: Array<{ season: number; best: RankName; cosmetics: string[]; aiBonus: number; aiMonth: string | null }>;
}

export const fetchRank = () => backendRequest<RankState>('/api/v1/rank');
export const joinRank = (nickname: string, coat?: string) => backendRequest<RankState>('/api/v1/rank/join', 'POST', { nickname, coat });
export const leaveRank = () => backendRequest<RankState>('/api/v1/rank/leave', 'POST', {});
export const updateRank = (patch: { nickname?: string; coat?: string }) => backendRequest<RankState>('/api/v1/rank/me', 'PATCH', patch);
