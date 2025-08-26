// src/lib/useViewportVH.ts
import { useEffect } from 'react';

export default function useViewportVH() {
  useEffect(() => {
    const set = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    };
    set();
    window.addEventListener('resize', set);
    window.addEventListener('orientationchange', set);
    document.addEventListener('visibilitychange', set);
    return () => {
      window.removeEventListener('resize', set);
      window.removeEventListener('orientationchange', set);
      document.removeEventListener('visibilitychange', set);
    };
  }, []);
}
