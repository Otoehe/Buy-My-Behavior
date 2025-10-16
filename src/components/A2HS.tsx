// src/components/A2HS.tsx
import React, { useEffect } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function A2HS() {
  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      try { localStorage.setItem('bmb.a2hs.supported', '1'); } catch {}
      (window as any).__bmbA2HS = ev;
      // повідомляємо всі компоненти (InstallPWAButton/Profile)
      window.dispatchEvent(new CustomEvent('bmb:a2hs-available'));
    };

    const onInstalled = () => {
      try { localStorage.setItem('bmb.a2hs.done', '1'); } catch {}
    };

    window.addEventListener('beforeinstallprompt', onBIP as any);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP as any);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return null;
}
