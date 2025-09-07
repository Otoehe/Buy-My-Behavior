// public/sw.js
const VERSION = 'bmb-2025-09-07';

// Чи потрібно перезавантажити вкладки після активації (лише при ручному оновленні)
let reloadAfterActivate = false;

// НІЯКОГО auto-skipWaiting у install
self.addEventListener('install', () => {
  // новий SW чекає, поки клієнт надішле команду SKIP_WAITING
});

// Кероване оновлення — приходить з клієнта по кнопці "Оновити"
self.addEventListener('message', (e) => {
  if (e?.data?.type === 'SKIP_WAITING') {
    reloadAfterActivate = true;
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    if (reloadAfterActivate) {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) client.postMessage({ type: 'BMB_RELOAD' });
    }
  })());
});

// Перехоплюємо ТІЛЬКИ HTML-навігацію для SPA (без кешування JS/CSS/чанків)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      // завжди свіжа HTML-сторінка
      return await fetch(req, { cache: 'no-store' });
    } catch {
      const cached = await caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
