import React, { useEffect, useState } from 'react';

const SWUpdateToast: React.FC = () => {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let regRef: ServiceWorkerRegistration | undefined;

    const setup = async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      regRef = reg || undefined;

      // якщо вже є waiting — покажемо тост
      if (reg?.waiting) {
        setWaiting(reg.waiting);
        setVisible(true);
      }

      // новий SW знайдено
      reg?.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // встановлено і вже є controller -> значить це оновлення
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            setWaiting(reg.waiting || sw);
            setVisible(true);
          }
        });
      });
    };

    setup();

    // періодична перевірка оновлень
    const iv = window.setInterval(() => regRef?.update(), 30 * 60 * 1000);

    // коли активується новий SW — перезавантажимо сторінку
    const onCtrl = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onCtrl);

    return () => {
      window.clearInterval(iv);
      navigator.serviceWorker.removeEventListener('controllerchange', onCtrl);
    };
  }, []);

  if (!visible) return null;

  const updateNow = () => waiting?.postMessage({ type: 'SKIP_WAITING' });
  const later = () => setVisible(false);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <span>Доступна нова версія</span>
        <div style={styles.actions}>
          <button onClick={updateNow} style={styles.primary}>Оновити</button>
          <button onClick={later} style={styles.ghost}>Пізніше</button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed',
    left: 0, right: 0, bottom: 0,
    display: 'flex', justifyContent: 'center',
    padding: '0 16px calc(env(safe-area-inset-bottom) + 12px)',
    zIndex: 999981, // нижче за модалку навбара
    pointerEvents: 'none',
  },
  card: {
    width: '100%', maxWidth: 420,
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 16,
    boxShadow: '0 10px 25px rgba(0,0,0,.15)',
    padding: 12,
    fontFamily: 'sans-serif',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    pointerEvents: 'auto',
  },
  actions: { display: 'flex', gap: 8 },
  primary: {
    background: '#ffcdd6', border: '1px solid #ffcdd6',
    padding: '8px 12px', borderRadius: 12, cursor: 'pointer', fontWeight: 800
  },
  ghost: {
    background: '#fff', border: '1px solid #ddd',
    padding: '8px 12px', borderRadius: 12, cursor: 'pointer', fontWeight: 800
  },
};

export default SWUpdateToast;
