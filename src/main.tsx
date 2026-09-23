import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PublicPage, publicPageFromPath } from './components/PublicPage';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './index.css';

const publicPage = publicPageFromPath(window.location.pathname);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publicPage ? <PublicPage kind={publicPage} /> : <AppErrorBoundary><App /></AppErrorBoundary>}
  </React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}
