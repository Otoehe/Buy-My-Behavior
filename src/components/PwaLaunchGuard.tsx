// src/components/PwaLaunchGuard.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function isStandalone() {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // @ts-ignore
  if (typeof (navigator as any).standalone === 'boolean' && (navigator as any).standalone) return true;
  return false;
}

export default function PwaLaunchGuard() {
  const nav = useNavigate();

  useEffect(() => {
    // одноразово для конкретної сесії
    const key = 'bmb.pwa.routed.thisSession';
    if (isStandalone() && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      nav('/map', { replace: true });
    }
  }, [nav]);

  return null;
}
