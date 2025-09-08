// ВАЖЛИВО: якщо у тебе є цей файл — хай буде першим (не критично).
// Якщо його немає — просто видали цей імпорт.
// import './lib/metamaskGuard';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Глобальні ловці помилок (діагностика)
window.addEventListener('error', (e) =>
  console.error('[GlobalError]', (e as any).error || e.message)
);
window.addEventListener('unhandledrejection', (e) =>
  console.error('[UnhandledRejection]', (e as any).reason)
);

console.log('BMB boot', import.meta.env.MODE);

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

/* =========================
   Service Worker
   ========================= */

// DEV: повністю вимикаємо SW + чистимо кеші (щоб не ловити старі бандли)
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
  if ('caches' in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
}

// PROD: реєструємо SW з ОДНІЄЮ СТАБІЛЬНОЮ ВЕРСІЄЮ на білд
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // ❗️Задай стабільний build-id (або прокинь VITE_APP_VERSION під час білда)
    const SW_BUILD_ID =
      (import.meta.env as any).VITE_APP_VERSION || '2025-09-08-01';

    const swUrl = `/sw.js?v=${SW_BUILD_ID}`;

    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // Разова перевірка оновлень — НЕ створює петлю
        reg.update?.();

        // Коли знайдено новий SW і він встановився — активуємо без очікування
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Авто-рефреш лише ОДИН раз у вкладці після зміни контролера
        let reloaded = sessionStorage.getItem('sw_reloaded') === '1';
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          sessionStorage.setItem('sw_reloaded', '1');
          window.location.reload();
        });
      })
      .catch((e) => console.warn('[SW] registration failed', e));
  });
}
