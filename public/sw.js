// public/sw.js
const VERSION = 'bmb-2025-10-14-1';

// Встановлюємось миттєво
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Очищуємо ВСІ старі кеші й забираємо контроль
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Повідомлення на випадок ручного skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Для навігації: мережа з примусовим обходом кешу
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return; // не чіпаємо статичні/апі

  event.respondWith(
    fetch(req, { cache: 'reload' })
      .catch(() =>
        // офлайн-фолбек (за бажанням можна прибрати або вказати /index.html)
        new Response('Offline', { status: 503, statusText: 'Offline' })
      )
  );
});
