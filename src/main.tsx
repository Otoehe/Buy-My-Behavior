// ВАЖЛИВО: ставимо першим, щоб пропатчити MetaMask до будь-яких інших імпортів
import './lib/metamaskGuard';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// DEV: повністю вимикаємо SW + чистимо кеш (щоб не ловити «білий екран» від старого бандла)
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if ('caches' in window) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

// Глобальні ловці помилок для прозорої діагностики
window.addEventListener('error', e => console.error('[GlobalError]', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[UnhandledRejection]', e.reason));

console.log('BMB boot dev');

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('Root element #root not found in index.html');
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

// PROD: реєструємо SW (у DEV вимкнено)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = '/sw.js';
    navigator.serviceWorker
      .register(swUrl)
      .then(reg => {
        console.log('[BMB SW] registered', reg.scope);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                console.log('[BMB SW] new content available (next reload)');
              } else {
                console.log('[BMB SW] content cached for offline use');
              }
            }
          });
        });
      })
      .catch(e => console.warn('[BMB SW] registration failed', e));
  });
}
