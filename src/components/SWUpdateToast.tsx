import React, { useEffect } from 'react';

/**
 * Тихий режим оновлення SW:
 * - жодного UI / модалок
 * - жодних skipWaiting / reload
 * - якщо SW вже встановлений — лишається як є
 * - якщо SW ще не було: робимо безпечну спробу зареєструвати /service-worker.js (ігноруємо помилки)
 */
const SWUpdateToast: React.FC = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Запобіжник від випадкових перезавантажень (якщо десь є controllerchange-слухачі)
    let didMark = false;
    const onCtrlChange = () => { if (!didMark) didMark = true; /* без reload */ };
    navigator.serviceWorker.addEventListener('controllerchange', onCtrlChange);

    // Безпечна реєстрація лише якщо ще нема registration.
    // Якщо файл SW відсутній — просто замовкнемо (помилки ігноруємо).
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) {
        navigator.serviceWorker.register('/service-worker.js').catch(() => {
          /* no-op: у деяких білдах SW-файла нема — це ок */
        });
      }
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onCtrlChange);
    };
  }, []);

  return null; // Нічого не показуємо
};

export default SWUpdateToast;
