// src/components/PwaLaunchGuard.tsx
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function isStandalone(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true; // Android/Chrome/Edge
  // iOS Safari
  // @ts-ignore
  if (typeof (navigator as any).standalone === 'boolean' && (navigator as any).standalone) return true;
  return false;
}

export default function PwaLaunchGuard() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isStandalone()) return;

    // редірект лише один раз за сесію і лише якщо стартуємо з кореня
    const already = sessionStorage.getItem('bmb.pwa.redirected') === '1';
    const path = pathname.replace(/\/+$/, '');
    const isRoot = path === '' || path === '/';

    if (!already && isRoot) {
      sessionStorage.setItem('bmb.pwa.redirected', '1');
      navigate('/map', { replace: true });
    }
  }, [pathname, navigate]);

  return null;
}
