// src/components/AddToHomeProfileCard.tsx
import React, { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const INSTALL_SEEN_KEY = 'bmb_a2hs_seen_count';
const DISMISS_UNTIL_KEY = 'bmb_a2hs_dismiss_until';

export default function AddToHomeProfileCard() {
  // ХУКИ — завжди зверху, без умов
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  const seenCount = useMemo(() => Number(localStorage.getItem(INSTALL_SEEN_KEY) || 0), []);
  const dismissUntil = useMemo(() => Number(localStorage.getItem(DISMISS_UNTIL_KEY) || 0), []);

  const isStandalone = useMemo(() => {
    try {
      return (
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (navigator as any).standalone === true
      );
    } catch { return false; }
  }, []);

  useEffect(() => {
    if (isStandalone) return;
    const now = Date.now();
    if (dismissUntil && now < dismissUntil) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault?.();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);

    window.addEventListener('beforeinstallprompt', onBeforeInstall as any);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as any);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [dismissUntil, isStandalone]);

  const onInstall = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        localStorage.setItem(INSTALL_SEEN_KEY, String(seenCount + 1));
        setVisible(false);
        setDeferred(null);
      }
    } catch (e) {
      console.warn('A2HS prompt error', e);
    }
  };

  const onDismiss = (ms = 2 * 24 * 60 * 60 * 1000) => {
    const until = Date.now() + ms;
    localStorage.setItem(DISMISS_UNTIL_KEY, String(until));
    localStorage.setItem(INSTALL_SEEN_KEY, String(seenCount + 1));
    setVisible(false);
  };

  if (isStandalone || !visible || !deferred) return null;

  return (
    <div style={{ margin: '16px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 12, border: '1px solid #e5e7eb', borderRadius: 16, background: '#f9fafb'
      }}>
        <img src="/icons/bmb-192.png" alt="BMB" width={40} height={40} style={{ borderRadius: 10 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Додайте іконку BMB на головний екран</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Запускатиметься без адресного рядка</div>
        </div>
        <button onClick={onInstall} style={{ padding: '8px 12px', borderRadius: 12, border: '1px solid #ddd' }}>
          Встановити
        </button>
        <button onClick={() => onDismiss()} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#6b7280' }}>
          Пізніше
        </button>
      </div>
    </div>
  );
}
