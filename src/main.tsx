// ВАЖЛИВО: приберіть усі інші імпорти/виклики реєстрації SW (sw-guard тощо).
// Лишаємо тільки цей єдиний блок реєстрації.

// Якщо у вас є guard для MetaMask — залишаємо:
import './lib/metamaskGuard';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// DEV: повністю вимикаємо SW та чистимо кеші,
// щоб у розробці не було «ефекту білого екрану» від старого бандла.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
  if ('caches' in window) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

// Глобальні ловці помилок — корисно для діагностики
window.addEventListener('error', e =>
  console.error('[GlobalError]', (e as any).error || (e as any).message)
);
window.addEventListener('unhandledrejection', e =>
  console.error('[UnhandledRejection]', (e as any).reason)
);

// Рендер React
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

/* ---------------- SW: єдина безпечна реєстрація без авто-reload ---------------- */

declare global {
  interface Window {
    // опційно: щоб кнопка «Оновити» могла викликати оновлення
    applySWUpdate?: () => Promise<void>;
  }
}

// Експонуємо ручний апдейтер (для вашої плашки «Доступна нова версія»)
window.applySWUpdate = async () => {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
};

// Реєструємо один раз, БЕЗ ?v=Date.now() і БЕЗ controllerchange→reload
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      // тихо перевіряємо оновлення у фоні
      reg.update();

      // Якщо оновлення стало «waiting», кидаємо подію — можете показати банер
      const notifyUpdate = () =>
        window.dispatchEvent(new CustomEvent('bmb:sw-update'));

      // кейс: уже є waiting
      if (reg.waiting && navigator.serviceWorker.controller) {
        notifyUpdate();
      }

      // кейс: щойно знайдено новий SW → коли дійде до "installed" і стане waiting
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && reg.waiting && navigator.serviceWorker.controller) {
            notifyUpdate();
          }
        });
      });

      // НІЯКИХ location.reload() тут немає — оновлення тільки за кліком:
      // десь у вашому UI викликайте window.applySWUpdate?.()
    } catch (e) {
      console.warn('[SW] registration failed', e);
    }
  });
}
