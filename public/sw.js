// public/sw.js
const VERSION = 'bmb-2025-09-08c';

self.addEventListener('install', () => {});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

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
