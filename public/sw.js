// public/sw.js
const VERSION = 'bmb-2025-09-06';

// Активуємо одразу
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Прискорене оновлення
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Перехоплюємо ТІЛЬКИ HTML-навігацію для SPA.
// ЖОДНИХ кешів JS/CSS/чанків — щоб не було MIME "text/html" замість "application/javascript".
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      // завжди свіжа HTML-сторінка
      return await fetch(req, { cache: 'no-store' });
    } catch (e) {
      // офлайн-фолбек (якщо додаси /index.html у кеш — тут можна віддати кеш)
      const cached = await caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
