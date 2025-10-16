// src/components/NetworkToast.tsx
import React, { useEffect, useState } from 'react';

const NetworkToast: React.FC = () => {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const on = () => { setOnline(true);  setVisible(true); setTimeout(() => setVisible(false), 2500); };
    const off = () => { setOnline(false); setVisible(true); };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!visible) return null;

  return (
    <div style={styles.wrap}>
      <div style={{...styles.card, ...(online ? styles.ok : styles.bad)}}>
        {online ? 'Зʼявився інтернет' : 'Немає підключення'}
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
    zIndex: 999980, // нижче за модалку навбара (999999)
    pointerEvents: 'none',
  },
  card: {
    pointerEvents: 'auto',
    padding: '10px 14px',
    borderRadius: 12,
    fontFamily: 'sans-serif',
    fontWeight: 700,
    boxShadow: '0 10px 25px rgba(0,0,0,.15)',
    border: '1px solid #ddd',
    background: '#fff',
  },
  ok:  { borderColor: '#c8f7d1', background: '#e9fff0', color: '#0a7d37' },
  bad: { borderColor: '#ffd7d7', background: '#fff0f0', color: '#9b1c1c' },
};

export default NetworkToast;
