import { useCallback, useEffect, useState } from 'react';
import type { NavTabId } from '@/shared/types';
import { TAB_PATHS, tabFromPath } from '@/app/routing/routes';

export function useRouteTab(): [NavTabId, (tab: NavTabId) => void] {
  const [activeTab, setActiveTab] = useState<NavTabId>(() => tabFromPath(window.location.pathname));
  useEffect(() => {
    const restore = () => setActiveTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const navigate = useCallback((tab: NavTabId) => {
    const path = TAB_PATHS[tab];
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  return [activeTab, navigate];
}
