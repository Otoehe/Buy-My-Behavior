declare global { interface Window { __bmb_planned_update?: boolean } }

/** Реєстрація SW + виявлення нової версії */
export function registerServiceWorker(swUrl: string) {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl).then((reg) => {
      // одразу перевірити оновлення
      reg.update?.();

      // коли є новий інсталятор — сповіщуємо UI
      const notify = () => {
        window.dispatchEvent(new CustomEvent('bmb:sw-update'));
      };

      reg.addEventListener?.('updatefound', () => {
        const inst = reg.installing;
        inst?.addEventListener?.('statechange', () => {
          if (inst.state === 'installed' && navigator.serviceWorker.controller) {
            notify();
          }
        });
      });

      // якщо вже є waiting — теж сповістити
      if (reg.waiting) notify();

      // контрольований перезапуск сторінки після активації
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!window.__bmb_planned_update) return;
        if (reloading) return;

        const last = Number(sessionStorage.getItem('bmb_sw_reload_ts') || '0');
        const now  = Date.now();
        if (now - last < 5000) return;

        reloading = true;
        sessionStorage.setItem('bmb_sw_reload_ts', String(now));
        location.reload();
      });
    }).catch(e => console.warn('[SW] register failed', e));
  });
}

/** Застосувати оновлення (викликається по кліку «Оновити») */
export async function applyServiceWorkerUpdate() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  window.__bmb_planned_update = true;

  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  const inst = reg.installing;
  if (inst) {
    await new Promise<void>((resolve) => {
      inst.addEventListener('statechange', () => {
        if (inst.state === 'installed' && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          resolve();
        }
      });
    });
  }
}
