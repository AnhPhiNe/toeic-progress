import type { NavTabId } from '../types';

export const TAB_PATHS: Record<NavTabId, string> = {
  dashboard: '/', plan: '/ke-hoach', 'exam-mode': '/phong-thi',
  history: '/lich-su', analytics: '/phan-tich', mistakes: '/so-tay',
  vocabulary: '/tu-vung', resources: '/quy-doi'
};

export function tabFromPath(path: string): NavTabId {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/tai-lieu') return 'resources';
  return (Object.entries(TAB_PATHS).find(([, value]) => value === normalized)?.[0] || 'dashboard') as NavTabId;
}
