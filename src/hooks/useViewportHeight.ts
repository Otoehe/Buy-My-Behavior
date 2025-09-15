// src/hooks/useViewportHeight.ts
// Ставить CSS-змінну --app-vh = фактична висота в'юпорту / 100
import { useEffect } from 'react';

export default function useViewportHeight() {
  useEffect(() => {
    const set = () => {
      const vh = (window.visualViewport?.height ?? window.innerHeight) * 0.01;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    };
    set();

    const vv = window.visualViewport;
    const onResize = () => setTimeout(set, 0);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    vv?.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      vv?.removeEventListener('resize', onResize);
    };
  }, []);
}
