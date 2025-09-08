// public/sw.js
const VERSION = 'bmb-2025-09-07b'; // ↑ bump версії, щоб згоріло кешування

// Не викликаємо skipWaiting автоматично!
self.addEventListener('install', (event) => {
  // опційно: console.log('[SW]', VERSION, 'installed');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Дозволяємо форс-активацію лише по повідомленню з клієнта
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Перехоплюємо ТІЛЬКИ HTML-навігацію (щоб не чіпати js/css і не ловити MIME-баґи)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      return await fetch(req, { cache: 'no-store' });
    } catch (e) {
      const cached = await caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
