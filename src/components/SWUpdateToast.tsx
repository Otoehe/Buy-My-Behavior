import React, { useEffect } from 'react';

/**
 * Тихий режим SW:
 *  - без UI/модалок
 *  - без skipWaiting / reload
 *  - не ламає офлайн/кеш
 *  - нова версія підхопиться на наступному "холодному" старті
 */
const SWUpdateToast: React.FC = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Запобіжник від випадкових автоперезавантажень (якщо десь є controllerchange-слухачі)
    let marked = false;
    const onCtrlChange = () => { if (!marked) marked = true; /* без location.reload() */ };
    navigator.serviceWorker.addEventListener('controllerchange', onCtrlChange);

    // Акуратно зареєструвати SW лише якщо файл існує і ще не зареєстрований
    const CANDIDATES = ['/service-worker.js', '/sw.js', '/sw-esm.js'];

    (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration();
        if (existing) return; // вже зареєстровано — нічого не робимо

        for (const url of CANDIDATES) {
          try {
            const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
            if (!head.ok) continue;
            await navigator.serviceWorker.register(url);
            break;
          } catch { /* no-op, пробуємо наступного кандидата */ }
        }
      } catch { /* тихо ігноруємо */ }
    })();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onCtrlChange);
    };
  }, []);

  return null; // модалки немає взагалі
};

export default SWUpdateToast;
