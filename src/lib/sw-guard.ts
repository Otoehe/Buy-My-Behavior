// src/lib/sw-guard.ts
let lastReg: ServiceWorkerRegistration | null = null;

// Подія, по якій ваш тост "Доступна нова версія" має відобразитись
const UPDATE_EVENT = 'bmb:sw-update';

// Реєструємо SW і повідомляємо про наявність оновлення
export function registerServiceWorker(scriptUrl = '/sw.js') {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    const ver = (import.meta as any).env?.VITE_APP_VERSION ?? Date.now();
    const url = `${scriptUrl}?v=${ver}`;

    navigator.serviceWorker.register(url).then((reg) => {
      lastReg = reg;

      // перевіряємо на оновлення на старті
      reg.update().catch(() => {});

      // коли є новий воркер і він встановився, але вже є controller → є оновлення
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            dispatchUpdateEvent(reg);
          }
        });
      });

      // періодично перевіряємо (раз на 30 хв)
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch((e) => {
      console.warn('[BMB SW] registration failed', e);
    });
  });
}

// Викликайте це по кліку на "Оновити"
export async function applyServiceWorkerUpdate(): Promise<void> {
  const reg = lastReg || await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  // Якщо є waiting — просимо активуватись
  if (reg.waiting) {
    await skipWaitingAndReload(reg);
    return;
  }

  // Якщо зараз щось встановлюється — дочекаємось
  if (reg.installing) {
    await whenInstalled(reg);
    if (reg.waiting) {
      await skipWaitingAndReload(reg);
    }
    return;
  }

  // Інакше спробуємо форснути update і подивитись ще раз
  await reg.update().catch(() => {});
  if (reg.waiting) {
    await skipWaitingAndReload(reg);
  }
}

// ——— helpers ———
function dispatchUpdateEvent(reg: ServiceWorkerRegistration) {
  const ev = new CustomEvent(UPDATE_EVENT, { detail: { registration: reg } });
  window.dispatchEvent(ev);
}

/** Чекаємо поки installing стане installed */
function whenInstalled(reg: ServiceWorkerRegistration) {
  return new Promise<void>((resolve) => {
    const nw = reg.installing;
    if (!nw) return resolve();
    const onChange = () => {
      if (nw.state === 'installed') {
        nw.removeEventListener('statechange', onChange);
        resolve();
      }
    };
    nw.addEventListener('statechange', onChange);
  });
}

/** Надсилаємо SKIP_WAITING і робимо один-єдиний reload (із захистом від циклів) */
function skipWaitingAndReload(reg: ServiceWorkerRegistration) {
  return new Promise<void>((resolve) => {
    const guardKey = 'bmb_sw_reload_once';
    if (!sessionStorage.getItem(guardKey)) {
      sessionStorage.setItem(guardKey, String(Date.now()));
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // один раз — і досить
        setTimeout(() => {
          location.reload();
          resolve();
        }, 50);
      }, { once: true });
    } else {
      // якщо вже перезавантажувались у цій сесії — не робимо нічого
      resolve();
    }

    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
}
