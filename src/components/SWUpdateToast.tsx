// Тихе оновлення Service Worker без будь-якого UI/модалок.
// Нова версія підхопиться на наступному старті (коли всі вкладки/PWA закриті).

import React, { useEffect } from 'react';

const SWUpdateToast: React.FC = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // 1) Спробувати Vite PWA (якщо підключений)
    //    Це безпечно: якщо плагіну немає — просто підемо у fallback.
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({
          immediate: false,        // не форсимо активацію
          onNeedRefresh() {},      // без тосту
          onOfflineReady() {},     // без тосту
        });
      })
      .catch(() => {
        // 2) Fallback: звичайна реєстрація SW без будь-якого UI
        const swUrl = '/service-worker.js';
        window.addEventListener('load', () => {
          navigator.serviceWorker
            .register(swUrl)
            .then((reg) => {
              // Жодного skipWaiting / reload тут — тихий режим
              reg.onupdatefound = () => {
                const w = reg.installing;
                if (!w) return;
                w.onstatechange = () => {
                  // when w.state === 'installed' — нічого не робимо
                  // новий SW активується на наступному старті
                };
              };
            })
            .catch((err) => console.warn('[SW register] silent error:', err));
        });
      });

    // 3) Запобіжник від випадкових автоперезавантажень
    let didMark = false;
    const onCtrlChange = () => {
      if (didMark) return;
      didMark = true; // не викликаємо location.reload()
    };
    navigator.serviceWorker.addEventListener('controllerchange', onCtrlChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onCtrlChange);
    };
  }, []);

  // Нічого не рендеримо — модалки немає.
  return null;
};

export default SWUpdateToast;
