import type { NavTabId } from '@/shared/types';

export const TAB_PATHS: Record<NavTabId, string> = {
  dashboard: '/', 'exam-mode': '/luyen-toc-do',
  history: '/lich-su', analytics: '/phan-tich', mistakes: '/so-tay',
  resources: '/quy-doi', awards: '/thanh-tich', league: '/giai-dau', guide: '/cach-dung'
};

export function tabFromPath(path: string): NavTabId {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/tai-lieu') return 'resources';
  if (normalized === '/phong-thi') return 'exam-mode';
  // Retired pages (Từ vựng, Kế hoạch) land on Hôm nay.
  return (Object.entries(TAB_PATHS).find(([, value]) => value === normalized)?.[0] || 'dashboard') as NavTabId;
}
