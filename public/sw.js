// public/sw.js
// ОДНЕ стабільне значення у межах одного деплою.
// Зміниш код → поміняй це значення (або підкладай через білд).
const VERSION = 'bmb-2025-09-08-01';

// Не викликаємо skipWaiting автоматично
self.addEventListener('install', (_event) => {
  // console.log('[SW]', VERSION, 'installed');
});

self.addEventListener('activate', (event) => {
  // Починаємо керувати всіма клієнтами одразу
  event.waitUntil(self.clients.claim());
});

// Дозволяємо форс-активацію лише по явному повідомленню
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Перехоплюємо ТІЛЬКИ HTML-навігацію.
// Ніякого кешування js/css, щоб не ловити MIME/старіння чанків.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;

  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }))
  );
});