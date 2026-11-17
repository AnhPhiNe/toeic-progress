import type { LeagueRow, LeagueState, LeagueTier } from '../services/leagueApi';

export const TIERS: readonly LeagueTier[] = ['dong', 'bac', 'vang', 'kim-cuong'];
export const TIER_NAME: Record<LeagueTier, string> = { dong: 'Đồng', bac: 'Bạc', vang: 'Vàng', 'kim-cuong': 'Kim cương' };
/** Shield colours per tier: [rim, face]. */
export const TIER_COLOR: Record<LeagueTier, [string, string]> = {
  dong: ['#c97b3a', '#eaa66a'], bac: ['#8a9bb8', '#b8c4d6'], vang: ['#e89b00', '#ffd25e'], 'kim-cuong': ['#2f9fd6', '#8fdcf6']
};

export const nextTier = (tier: LeagueTier): LeagueTier | null => TIERS[TIERS.indexOf(tier) + 1] ?? null;
export const lowerTier = (tier: LeagueTier): LeagueTier | null => TIERS[TIERS.indexOf(tier) - 1] ?? null;

/** Star table rows in the order the page lists them. Keys match the server's STARS. */
export const STAR_ACTIONS: readonly { key: string; label: string; icon: string; tint: string }[] = [
  { key: 'full_test', label: 'Ghi điểm một đề full', icon: '📝', tint: '#fff3d1' },
  { key: 'part_practice', label: 'Ghi một buổi luyện Part', icon: '🎯', tint: '#e6f3fd' },
  { key: 'bake', label: 'Nướng xong một mẻ bánh', icon: '🧁', tint: '#f1ecff' },
  { key: 'vocab_day', label: 'Một ngày ghi từ vựng', icon: '📚', tint: '#e7f6ea' },
  { key: 'card_reviewed', label: 'Ôn một thẻ câu sai', icon: '🔁', tint: '#ffe1e9' },
  { key: 'card_added', label: 'Thêm một thẻ câu sai', icon: '✏️', tint: '#fff1e3' }
];

export type RowZone = 'up' | 'down' | null;

export function rowZone(row: Pick<LeagueRow, 'rank'>, group: NonNullable<LeagueState['group']>): RowZone {
  if (row.rank <= group.promote) return 'up';
  if (row.rank > group.size - group.demote) return 'down';
  return null;
}

/** "Còn 13★ là vượt Bắp Rang" — the gap to the learner just above, or null at the top. */
export function gapAbove(state: LeagueState): { stars: number; nickname: string } | null {
  const rows = state.group?.rows ?? [];
  const mine = rows.findIndex(row => row.me);
  if (mine <= 0) return null;
  const above = rows[mine - 1];
  return { stars: above.stars - rows[mine].stars + 1, nickname: above.nickname };
}

/** Small live text under "Giải đấu" in the sidebar. */
export function sidebarLabel(state: LeagueState | null): string {
  if (!state?.member) return 'Tham gia';
  const left = `còn ${state.week.daysLeft} ngày`;
  if (state.mode === 'table' && state.me?.rank) return `Hạng ${state.me.rank} · ${left}`;
  return `${state.me?.stars ?? 0}★ · ${left}`;
}

/** The 🛡 chip on phone Hôm nay: short text plus a full spoken label. */
export function chipLabel(state: LeagueState | null): { text: string; short: string; aria: string } {
  if (!state?.member) return { text: 'Giải đấu', short: '', aria: 'Giải đấu tuần · tham gia' };
  if (state.mode === 'table' && state.me?.rank) return { text: `Hạng ${state.me.rank}`, short: String(state.me.rank), aria: `Giải đấu tuần · hạng ${state.me.rank}, còn ${state.week.daysLeft} ngày` };
  const stars = `${state.me?.stars ?? 0}★`;
  return { text: stars, short: stars, aria: `Giải đấu tuần · ${state.me?.stars ?? 0} sao tuần này` };
}

/** dd/mm – dd/mm for the week starting on ISO date `start`. */
export function weekRange(start: string): string {
  const [y, m, d] = start.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, d));
  const last = new Date(first.getTime() + 6 * 86_400_000);
  const fmt = (value: Date) => `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${fmt(first)} – ${fmt(last)}`;
}

const LETTERS = 'aàảãáạăằẳẵắặâầẩẫấậbcdđeèẻẽéẹêềểễếệfghiìỉĩíịjklmnoòỏõóọôồổỗốộơờởỡớợpqrstuùủũúụưừửữứựvwxyỳỷỹýỵz';
const NICKNAME = new RegExp(`^[0-9 ${LETTERS}${LETTERS.toUpperCase()}]+$`);

/** Same shape rules as the server (which also filters rude words); returns a message or ''. */
export function nicknameProblem(raw: string): string {
  const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 20) return 'Biệt danh cần 2–20 ký tự.';
  if (!NICKNAME.test(name)) return 'Chỉ dùng chữ cái tiếng Việt, số và dấu cách.';
  return '';
}
