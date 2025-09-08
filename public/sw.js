// public/sw.js
const VERSION = 'bmb-2025-09-08a'; // bump для інвалідації старого SW

// НЕ викликаємо skipWaiting автоматично
self.addEventListener('install', () => {
  // console.log('[SW]', VERSION, 'installed');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Дозволяємо форс-активацію лише за повідомленням від клієнта
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Обробляємо ТІЛЬКИ HTML-навігацію, щоб не ламати js/css
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      // ніякого кешу для HTML — беремо свіжий
      return await fetch(req, { cache: 'no-store' });
    } catch (e) {
      // офлайн фолбек
      const cached = await caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
