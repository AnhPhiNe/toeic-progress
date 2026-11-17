import type { NavTabId } from '@/shared/types';

export const TAB_PATHS: Record<NavTabId, string> = {
  dashboard: '/', plan: '/ke-hoach', 'exam-mode': '/luyen-toc-do',
  history: '/lich-su', analytics: '/phan-tich', mistakes: '/so-tay',
  vocabulary: '/tu-vung', resources: '/quy-doi', awards: '/thanh-tich'
};

export function tabFromPath(path: string): NavTabId {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/tai-lieu') return 'resources';
  if (normalized === '/phong-thi') return 'exam-mode';
  return (Object.entries(TAB_PATHS).find(([, value]) => value === normalized)?.[0] || 'dashboard') as NavTabId;
}
