import { useEffect } from 'react';

// Безпечний сторож для SW. Нічого не показує, нічого не форсить.
export default function PwaLaunchGuard() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // навмисно порожньо — усе робить SWUpdateToast у тихому режимі
  }, []);
  return null;
}
