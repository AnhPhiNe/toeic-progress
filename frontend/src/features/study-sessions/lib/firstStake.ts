import type { StudySession } from '@/shared/types';

/** True when the learner has exactly one (non-deleted) full test: the one just saved is their first stake. */
export function isFirstFullTest(sessions: readonly StudySession[]): boolean {
  return sessions.filter(s => !s.deletedAt && s.sessionType === 'FULL_TEST').length === 1;
}

/** "Bậc x/8 · còn N điểm tới cúp T. ..." line of the first-stake card. */
export function firstStakeLine(stair: { index: number; total: number } | null, remaining: number | null, target?: number): string {
  const parts: string[] = [];
  if (stair) parts.push(`Bậc ${stair.index}/${stair.total}`);
  if (target && remaining !== null) parts.push(remaining > 0 ? `còn ${remaining} điểm tới cúp ${target}.` : `đã chạm cúp ${target}!`);
  const head = parts.join(' · ');
  return `${head}${head && !head.endsWith('.') && !head.endsWith('!') ? '.' : ''} Huy hiệu “Đề đầu tiên” đã mở.`.trim();
}
