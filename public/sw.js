/* eslint-disable no-restricted-globals */

// ---- BMB Service Worker (SPA shell) ----
const VERSION    = 'bmb-2025-10-14-1';
const CACHE_NAME = `spa-shell-${VERSION}`;

// Install: не кешуємо нічого наперед; чекаємо ручного SKIP_WAITING
self.addEventListener('install', (_evt) => {
  // навмисно порожньо
});

// Activate: чистимо старі кеші, одразу беремо контроль
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
    );
    await self.clients.claim();
  })());
});

// Прийом команд від клієнта
//   navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', (event) => {
  if (event?.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// SPA-навігація: пробуємо свіжий index.html (no-store) з мережі;
// на помилку/офлайн — повертаємо останній закешований index.html.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch('/index.html', { cache: 'no-store' });
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/index.html', fresh.clone());
      return fresh;
    } catch {
      const cached = await caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
