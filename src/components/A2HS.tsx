import React, { useEffect } from 'react';

declare global {
  interface Window { __bmbA2HS?: BeforeInstallPromptEvent | null; }
  interface WindowEventMap {
    beforeinstallprompt: Event;
    appinstalled: Event;
    'bmb:a2hs-available': CustomEvent<undefined>;
    'bmb:a2hs-installed': CustomEvent<undefined>;
  }
}
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
function isStandalone(): boolean {
  const mm = (window as any).matchMedia;
  if (mm && mm('(display-mode: standalone)').matches) return true;
  // @ts-ignore iOS legacy
  if (typeof navigator !== 'undefined' && (navigator as any).standalone === true) return true;
  return false;
}

export default function A2HS() {
  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      window.__bmbA2HS = ev;
      try { window.dispatchEvent(new CustomEvent('bmb:a2hs-available')); } catch {}
    };
    const onInstalled = () => {
      window.__bmbA2HS = null;
      try { window.dispatchEvent(new CustomEvent('bmb:a2hs-installed')); } catch {}
    };

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    if (isStandalone()) {
      try { window.dispatchEvent(new CustomEvent('bmb:a2hs-installed')); } catch {}
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return null;
}
