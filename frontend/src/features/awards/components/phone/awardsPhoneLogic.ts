import type { NavTabId } from '@/shared/types';
import type { Badge, BadgeFamily } from '../../lib/badges';

/** Shorter chip labels (the full name stays in aria-label). */
export const FAMILY_SHORT: Record<BadgeFamily, string> = { score: 'Điểm số', streak: 'Chuỗi', effort: 'Chăm', part: 'Gỡ Part', speed: 'Tốc độ', secret: 'Bí mật' };

export interface BadgeAction { label: string; tab: NavTabId }

/** Where a locked badge is worked on; null when there is no single place (secrets, unknown ids). */
export function badgeAction(badge: Badge): BadgeAction | null {
  if (badge.earned || badge.family === 'secret') return null;
  const id = badge.id;
  if (id.startsWith('score-') || id.startsWith('effort-tests')) return { label: 'Mở Hành trình', tab: 'history' };
  if (id.startsWith('streak-')) return { label: 'Về Hôm nay', tab: 'dashboard' };
  if (id.startsWith('effort-practice') || id.startsWith('speed-')) return { label: 'Mở Luyện tập', tab: 'exam-mode' };
  if (id.startsWith('effort-review') || id.startsWith('effort-capture') || id.startsWith('part-')) return { label: 'Mở Sổ tay', tab: 'mistakes' };
  return null;
}

/** Progress shown in the badge sheet, as a whole percent. */
export const badgePercent = (badge: Badge): number => Math.round(badge.progress * 100);
