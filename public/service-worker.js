// public/service-worker.js
// BMB SW: network-first для сторінок, cache-first для хешованих /assets/*
// ОНОВЛЮЙ ЦЕ ЗНАЧЕННЯ на кожен реліз
const CACHE_VERSION = 'v2025-09-18-3';
const STATIC_CACHE  = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        '/offline.html',
        '/icons/icon-192.png', // логотип у модалці
      ]).catch(() => void 0)
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Допоміжне: чи це vite-хешований asset
const isHashedAsset = (url) =>
  url.origin === location.origin &&
  (url.pathname.startsWith('/assets/') ||
   /\.[a-f0-9]{6,}\.(?:js|css|woff2|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // не чіпаємо сам SW
  if (url.pathname.endsWith('/service-worker.js')) return;

  // 1) Навігації (сторінки): network-first, офлайн -> offline.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // 2) Хешовані Vite-статичні файли: cache-first
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      })
    );
    return;
  }

  // 3) Інші картинки/шрифти/скрипти: м’який runtime cache-first
  if (['image', 'style', 'script', 'font'].includes(req.destination)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const resp = await fetch(req);
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      })
    );
    return;
  }

  // 4) За замовчуванням — мережа
});
