import { useCallback, useEffect, useState } from 'react';
import type { NavTabId } from '@/shared/types';
import { TAB_PATHS, tabFromPath } from '@/app/routing/routes';
import { navigateFromOverlay } from '@/shared/hooks/overlayHistory';

export function useRouteTab(): [NavTabId, (tab: NavTabId) => void] {
  const [activeTab, setActiveTab] = useState<NavTabId>(() => tabFromPath(window.location.pathname));
  // Retired pages (/tu-vung, /ke-hoach) land on Hôm nay and the address bar follows.
  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (tabFromPath(path) === 'dashboard' && path !== '/') window.history.replaceState({}, '', '/');
  }, []);
  useEffect(() => {
    const restore = () => setActiveTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const navigate = useCallback((tab: NavTabId) => {
    const path = TAB_PATHS[tab];
    // Leaving from inside a dialog replaces its history entry, so one Back returns to the page it was opened on.
    if (!navigateFromOverlay(path) && window.location.pathname !== path) window.history.pushState({}, '', path);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  return [activeTab, navigate];
}
