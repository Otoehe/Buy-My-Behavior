// src/lib/sw-guard.ts
export function setupSwUpdateGuard() {
  if (!('serviceWorker' in navigator)) return;

  // Показуємо банер тільки коли це справді оновлення
  navigator.serviceWorker.ready.then((reg) => {
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          localStorage.setItem('bmb_sw_update_ready', '1');
          window.dispatchEvent(new Event('bmb:sw-update-ready'));
        }
      });
    });

    // Кнопка "Оновити" → активуємо новий SW
    (window as any).bmbApplySwUpdate = () => {
      const w = reg.waiting;
      if (w) w.postMessage({ type: 'SKIP_WAITING' });
      else setTimeout(() => reg.waiting?.postMessage({ type: 'SKIP_WAITING' }), 800);
    };
  });

  // Перезавантаження тільки по сигналу від SW
  let reloaded = false;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'BMB_RELOAD' && !reloaded) {
      reloaded = true;
      const last = Number(sessionStorage.getItem('bmb_sw_reload_ts') || '0');
      if (Date.now() - last < 3000) return;         // антипетля
      sessionStorage.setItem('bmb_sw_reload_ts', String(Date.now()));
      window.location.reload();
    }
  });
}
