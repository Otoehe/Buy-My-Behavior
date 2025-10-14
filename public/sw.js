// public/sw.js
const VERSION = 'bmb-2025-10-14-2';
const CACHE_PREFIX = 'bmb-sw';
const RUNTIME_CACHE = `${CACHE_PREFIX}-${VERSION}`;

self.addEventListener('install', (event) => {
  // Активуємось без затримок
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Чистимо попередні кеші цього SW
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Дозволяємо вручну перейти в активний стан одразу
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Мінімалістична стратегія: навігацію тягнемо з мережі без кешу.
// Якщо мережа впала — повертаємо помилку (або можна спробувати /index.html з кеша).
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Навігації (переходи по сторінках)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(req, { cache: 'no-store', redirect: 'follow' });
      } catch {
        // Якщо дуже хочеться — можна дістати запасний index.html:
        // const cached = await caches.match('/index.html');
        // return cached || Response.error();
        return Response.error();
      }
    })());
    return;
  }

  // Для всього іншого: просто прозорий прохід (без кешування)
  // Якщо колись знадобиться — тут легко додати кеш-стратегію для статичних файлів.
});
