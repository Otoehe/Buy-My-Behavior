// public/sw.js
const VERSION    = 'bmb-2025-10-14-1';          // міняй при кожному релізі
const CACHE_NAME = `spa-shell-${VERSION}`;

// Встановлення SW (нічого не кешуємо наперед)
self.addEventListener('install', (event) => {
  // залишаємо порожнім; активуватимемось за повідомленням SKIP_WAITING
});

// Активуємось: прибираємо старі кеші та беремо контроль над клієнтами
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
    );
    await self.clients.claim();
  })());
});

// Дозволяємо ручне оновлення через повідомлення з клієнта
//   navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
self.addEventListener('message', (event) => {
  if (event?.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Для SPA: перехоплюємо тільки навігаційні запити (перехід сторінками)
// Тягнемо свіжий /index.html (no-store); якщо мережа недоступна — віддаємо кеш
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return; // усе інше нехай йде напряму в мережу

  event.respondWith((async () => {
    try {
      // свіжа версія shell'а
      const fresh = await fetch('/index.html', { cache: 'no-store' });
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/index.html', fresh.clone());
      return fresh;
    } catch {
      // офлайн/помилка — повертаємо останню збережену версію
      const cached = await caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
