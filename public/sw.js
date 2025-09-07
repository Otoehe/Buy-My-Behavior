// public/sw.js
const VERSION = 'bmb-2025-09-07';

// Не робимо skipWaiting під час install — сторінка вирішує коли оновлюватись
self.addEventListener('install', () => {
  // prep work here if needed
});

// Приймаємо контроль після активації (не спричиняє reload само по собі)
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Кероване оновлення: сторінка надсилає APPLY_UPDATE
self.addEventListener('message', (e) => {
  const t = e?.data?.type;
  if (t === 'APPLY_UPDATE' || t === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Перехоплюємо тільки HTML-навігацію (SPA), без кешування JS/CSS
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith((async () => {
    try {
      return await fetch(req, { cache: 'no-store' });
    } catch {
      const cached = await caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
