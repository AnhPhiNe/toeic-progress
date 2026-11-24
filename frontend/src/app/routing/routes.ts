import type { NavTabId } from '@/shared/types';

export const TAB_PATHS: Record<NavTabId, string> = {
  dashboard: '/', 'exam-mode': '/luyen-toc-do',
  history: '/lich-su', analytics: '/phan-tich', mistakes: '/so-tay',
  resources: '/quy-doi', awards: '/ho-so-soc', league: '/xep-hang', guide: '/cach-dung'
};

export function tabFromPath(path: string): NavTabId {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/tai-lieu') return 'resources';
  if (normalized === '/phong-thi') return 'exam-mode';
  // Renamed pages keep their old links: Thành tích → Hồ sơ của Sóc, Giải đấu → Xếp hạng.
  if (normalized === '/thanh-tich') return 'awards';
  if (normalized === '/giai-dau') return 'league';
  // Retired pages (Từ vựng, Kế hoạch) land on Hôm nay.
  return (Object.entries(TAB_PATHS).find(([, value]) => value === normalized)?.[0] || 'dashboard') as NavTabId;
}

/** Opens the app straight on sign-in (Cài đặt); used by "Đã có tài khoản? Đăng nhập" on the public pages. */
export const SIGN_IN_PATH = '/?dang-nhap';

/** True once when the page was opened with ?dang-nhap; the parameter is removed from the address bar. */
export function takeSignInParam(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('dang-nhap')) return false;
  url.searchParams.delete('dang-nhap');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return true;
}
