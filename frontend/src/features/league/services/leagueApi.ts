import { backendRequest } from '@/shared/api/api';

export type LeagueTier = 'dong' | 'bac' | 'vang' | 'bach-kim' | 'kim-cuong' | 'cao-thu';

/** One learner in the group table: only public fields, never a real name, email or TOEIC score. */
export interface LeagueRow { rank: number; nickname: string; coat: string; stars: number; me: boolean }

export interface LeagueState {
  week: { start: string; endsAt: string; daysLeft: number };
  dailyCap: number;
  /** Stars per action, as the server counts them. */
  starTable: Record<string, number>;
  member: { nickname: string; coat: string; tier: LeagueTier } | null;
  /** none: not joined · table: ranked group · fallback: too few others, compare with last week. */
  mode: 'none' | 'table' | 'fallback';
  me: { stars: number; today: number; rank: number | null; lastWeekStars: number | null } | null;
  group: { tier: LeagueTier; size: number; promote: number; demote: number; rows: LeagueRow[] } | null;
  lastWeek: { rank: number | null; outcome: 'up' | 'stay' | 'down' | null; stars: number; tier: LeagueTier } | null;
}

export const fetchLeague = () => backendRequest<LeagueState>('/api/v1/league');
export const joinLeague = (nickname: string, coat?: string) => backendRequest<LeagueState>('/api/v1/league/join', 'POST', { nickname, coat });
export const leaveLeague = () => backendRequest<LeagueState>('/api/v1/league/leave', 'POST', {});
export const updateLeague = (patch: { nickname?: string; coat?: string }) => backendRequest<LeagueState>('/api/v1/league/me', 'PATCH', patch);
