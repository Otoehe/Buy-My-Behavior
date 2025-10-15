// BMB minimal SW — safe navigations, cache static only

const CACHE_NAME = 'bmb-static-v1';
const STATIC_EXT = /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|mp3|wav)$/i;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // очистити старі кеші, якщо ви міняєте ім'я CACHE_NAME
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

// Дуже просте правило:
// - Навігації віддаємо напряму з мережі (щоб не ламати SPA редіректи)
// - Кешуємо лише статику з того ж походження
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Лише наш домен
  const sameOrigin = new URL(req.url).origin === self.location.origin;

  // 1) Навігації — пропускаємо в мережу без жодних manual-redirect
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req));
    return;
  }

  // 2) Для крос-доменних — нічого не робимо
  if (!sameOrigin) return;

  // 3) Кеш-стратегія для статичних файлів (cache-first)
  if (STATIC_EXT.test(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req); // важливо: дозволяємо normal redirects
      if (res && res.ok) {
        cache.put(req, res.clone());
      }
      return res;
    })());
  }
});
