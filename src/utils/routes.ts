import type { NavTabId } from '../types';

export const TAB_PATHS: Record<NavTabId, string> = {
  dashboard: '/', plan: '/ke-hoach', 'exam-mode': '/phong-thi',
  analytics: '/phan-tich', mistakes: '/so-tay', resources: '/tai-lieu'
};

export function tabFromPath(path: string): NavTabId {
  const normalized = path.replace(/\/+$/, '') || '/';
  return (Object.entries(TAB_PATHS).find(([, value]) => value === normalized)?.[0] || 'dashboard') as NavTabId;
}
