// public/sw.js
const VERSION = 'bmb-2025-09-07';
let reloadAfterActivate = false;

self.addEventListener('install', () => { /* без auto-skipWaiting */ });

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

// Лише HTML-навігація, без кешування JS/CSS
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;
  event.respondWith((async () => {
    try { return await fetch(req, { cache: 'no-store' }); }
    catch { return (await caches.match('/index.html')) || Response.error(); }
  })());
});
