// public/sw.js
const VERSION = 'bmb-2025-09-08'; // bump версію лише коли дійсно міняєш sw

// Не примушуємо skipWaiting автоматично
self.addEventListener('install', () => {
  // console.log('[SW]', VERSION, 'installed');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Дозволяємо форс-активацію лише за повідомленням із клієнта
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Перехоплюємо ТІЛЬКИ HTML-навігацію (SPA). JS/CSS/чанки не чіпаємо.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      // завжди свіжа HTML-сторінка
      return await fetch(req, { cache: 'no-store' });
    } catch (e) {
      // офлайн-фолбек (якщо /index.html десь закешований)
      const cached = await caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
