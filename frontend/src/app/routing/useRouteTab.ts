import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavTabId } from '@/shared/types';
import { TAB_PATHS, tabFromPath } from '@/app/routing/routes';
import { navigateFromOverlay } from '@/shared/hooks/overlayHistory';

export function useRouteTab(): [NavTabId, (tab: NavTabId) => void, () => void] {
  const [activeTab, setActiveTab] = useState<NavTabId>(() => tabFromPath(window.location.pathname));
  const internalDepth = useRef(0);
  // Retired pages (/tu-vung, /ke-hoach) land on Hôm nay and the address bar follows.
  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (tabFromPath(path) === 'dashboard' && path !== '/') window.history.replaceState({}, '', '/');
    // Renamed pages (/thanh-tich, /giai-dau) redirect to their new address.
    const moved: Record<string, string> = { '/thanh-tich': TAB_PATHS.awards, '/giai-dau': TAB_PATHS.league };
    if (moved[path]) window.history.replaceState({}, '', moved[path]);
  }, []);
  useEffect(() => {
    const restore = () => {
      internalDepth.current = Math.max(0, internalDepth.current - 1);
      setActiveTab(tabFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const navigate = useCallback((tab: NavTabId) => {
    const path = TAB_PATHS[tab];
    // Leaving from inside a dialog replaces its history entry, so one Back returns to the page it was opened on.
    if (!navigateFromOverlay(path) && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      internalDepth.current += 1;
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const goBack = useCallback(() => {
    if (internalDepth.current > 0) window.history.back();
    else navigate('dashboard');
  }, [navigate]);
  return [activeTab, navigate, goBack];
}
