import '@/shared/domain/uuid';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';
import { PublicPage, publicPageFromPath } from '@/features/public-pages/components/PublicPage';
import { AppErrorBoundary } from '@/app/components/AppErrorBoundary';
import { Analytics } from '@vercel/analytics/react';
import '@/index.css';
import '@/shared/ui/rd/rd.css';

const publicPage = publicPageFromPath(window.location.pathname);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publicPage ? <PublicPage kind={publicPage} /> : <AppErrorBoundary><App /></AppErrorBoundary>}
    {/* Vercel Web Analytics: cookie-free page views, production builds only (enable it in the Vercel project). */}
    {import.meta.env.PROD && <Analytics />}
  </React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}
