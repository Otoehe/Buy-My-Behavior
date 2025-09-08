// src/components/SWUpdateToast.tsx
import React, { useEffect, useRef, useState } from 'react';

const IN_FLIGHT_KEY = 'bmb_update_in_flight';

export default function SWUpdateToast() {
  const [visible, setVisible] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  // Показуємо банер, коли sw-guard повідомляє про оновлення
  useEffect(() => {
    const onSwUpdate = (e: Event) => setVisible(true);
    window.addEventListener('bmb:sw-update', onSwUpdate);

    // збережемо останню реєстрацію, якщо sw-guard її передає
    const onReg = (e: any) => {
      if (e?.detail?.registration) regRef.current = e.detail.registration;
    };
    window.addEventListener('bmb:sw-registration', onReg);

    return () => {
      window.removeEventListener('bmb:sw-update', onSwUpdate);
      window.removeEventListener('bmb:sw-registration', onReg);
    };
  }, []);

  // БІЛЬШЕ НЕ РОБИМО АВТО-RELOAD НА controllerchange!
  // Якщо все ж прилетить спеціальне повідомлення "BMB_RELOAD" — оновимо лише якщо ми самі ініціювали оновлення
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e?.data?.type === 'BMB_RELOAD' && sessionStorage.getItem(IN_FLIGHT_KEY) === '1') {
        sessionStorage.removeItem(IN_FLIGHT_KEY);
        window.location.reload();
      }
    };
    navigator.serviceWorker?.addEventListener?.('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener?.('message', onMessage);
  }, []);

  // Періодична перевірка оновлень (не перезавантажує сторінку)
  useEffect(() => {
    let iv: any = null;
    (async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.();
        if (reg) regRef.current = reg;
      } catch {}
      iv = window.setInterval(() => regRef.current?.update?.(), 30 * 60 * 1000);
    })();
    return () => window.clearInterval(iv);
  }, []);

  const applyUpdate = () => {
    // нехай sw-guard зробить skipWaiting + безпечний reload
    sessionStorage.setItem(IN_FLIGHT_KEY, '1');
    window.dispatchEvent(new CustomEvent('bmb:apply-queued-update'));
    setVisible(false);
  };

  if (!visible) return null;

  // Банер внизу, як і був
  return (
    <div
      style={{
        position: 'fixed',
        left: 'env(safe-area-inset-left, 0px)',
        right: 'env(safe-area-inset-right, 0px)',
        bottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: '#fff',
        border: '1px solid #fde2ea',
        boxShadow: '0 16px 36px rgba(0,0,0,.12)',
        borderRadius: 14,
        maxWidth: 720,
        margin: '0 auto 12px',
        zIndex: 9999,
      }}
    >
      <div style={{ fontWeight: 700 }}>Доступна нова версія</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={applyUpdate}
          style={{
            padding: '8px 12px',
            borderRadius: 999,
            border: '2px solid #ffcdd6',
            background: '#ffcdd6',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Оновити
        </button>
        <button
          onClick={() => setVisible(false)}
          style={{
            padding: '8px 12px',
            borderRadius: 999,
            border: '1px solid #eee',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Пізніше
        </button>
      </div>
    </div>
  );
}
