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
window.addEventListener('error', e => console.error('[GlobalError]', (e as any).error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[UnhandledRejection]', (e as any).reason));

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

// PROD: реєструємо SW з анти-старінням і авто-рефрешем (лише HTML-навігація, без кешу чанків)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const ver = (import.meta.env as any).VITE_APP_VERSION ?? Date.now();
    const swUrl = `/sw.js?v=${ver}`;

    navigator.serviceWorker.register(swUrl).then(reg => {
      // одразу просимо оновлення
      reg.update();

      // якщо з’явився новий SW — активувати без очікування
      const activateNow = () => reg.waiting?.postMessage({ type: 'SKIP_WAITING' });

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            activateNow();
          }
        });
      });

      // авто-рефреш, коли контролер змінився (щоб підхопити новий бандл)
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    }).catch(e => console.warn('[BMB SW] registration failed', e));
  });
}
