// src/lib/sw-guard.ts
// Єдиний клієнт для реєстрації SW без авто-reload.
// Показує подію "bmb:sw-update" — ти вже можеш на ній відкривати свою плашку
// "Доступна нова версія". Перезавантаження робимо ТІЛЬКИ по кліку "Оновити".

const RELOAD_KEY = 'bmb_sw_reload_ts';
const RELOAD_GAP_MS = 5000;

function safeReload() {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
  const now = Date.now();
  if (now - last < RELOAD_GAP_MS) return;      // анти-цикли
  sessionStorage.setItem(RELOAD_KEY, String(now));
  window.location.reload();
}

/** Реєстрація service worker без авто-reload */
export function registerServiceWorker(path = '/sw.js') {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(path, { scope: '/' });

      // Коли з’явилась нова версія
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            // Є активна стара версія -> нова готова, але НЕ перезавантажуємо
            (window as any).__bmb_sw_pending__ = reg;
            window.dispatchEvent(new CustomEvent('bmb:sw-update', { detail: { reg } }));
          }
        });
      });

      // Повідомлення від SW (опційно)
      navigator.serviceWorker.addEventListener('message', (evt) => {
        const t = evt?.data?.type;
        if (t === 'BMB_RELOAD') safeReload();  // залишено для сумісності, але ми це не шлемо
      });
    } catch (e) {
      console.warn('SW register failed', e);
    }
  });
}

/** Викликати при натисканні "Оновити" у твоїй плашці */
export async function applyServiceWorkerUpdate() {
  const reg: ServiceWorkerRegistration | undefined = (window as any).__bmb_sw_pending__;
  if (!reg) return;

  // Переводимо waiting → активну
  if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  else await reg.update().catch(() => {});

  // Дочікуємось перемикання контролера і перезавантажуємось 1 раз
  await new Promise<void>((resolve) => {
    const onChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });

  safeReload();
}
