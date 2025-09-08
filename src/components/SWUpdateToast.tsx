// src/components/SWUpdateToast.tsx
import React, { useEffect, useState } from 'react';
import { applyServiceWorkerUpdate } from '../lib/sw-guard';

export default function SWUpdateToast() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onUpdate = () => setOpen(true);
    window.addEventListener('bmb:sw-update', onUpdate as EventListener);
    return () => window.removeEventListener('bmb:sw-update', onUpdate as EventListener);
  }, []);

  if (!open) return null;

  return (
    <div style={wrap}>
      <div style={card}>
        <span>Доступна нова версія</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnPrimary} onClick={() => applyServiceWorkerUpdate()}>
            Оновити
          </button>
          <button style={btnGhost} onClick={() => setOpen(false)}>
            Пізніше
          </button>
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0,
  display: 'flex', justifyContent: 'center',
  pointerEvents: 'none', zIndex: 9999
};
const card: React.CSSProperties = {
  pointerEvents: 'auto',
  background: '#fff', border: '1px solid #eee',
  boxShadow: '0 12px 28px rgba(0,0,0,.12)',
  borderRadius: 12, padding: '10px 12px',
  margin: 12, display: 'flex', alignItems: 'center', gap: 12
};
const btnPrimary: React.CSSProperties = {
  background: '#ffcdd6', color: '#000', border: '1px solid #ffcdd6',
  borderRadius: 999, padding: '8px 12px', fontWeight: 700, cursor: 'pointer'
};
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#111', border: '1px dashed #ffcdd6',
  borderRadius: 999, padding: '8px 12px', cursor: 'pointer'
};
