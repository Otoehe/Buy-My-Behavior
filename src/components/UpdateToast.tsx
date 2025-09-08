// src/components/UpdateToast.tsx
import React, { useEffect, useState } from 'react';
import { applyServiceWorkerUpdate } from '../lib/sw-guard';
import './UpdateToast.css';

export default function UpdateToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onUpdate = () => setShow(true);
    window.addEventListener('bmb:sw-update', onUpdate);
    return () => window.removeEventListener('bmb:sw-update', onUpdate);
  }, []);

  if (!show) return null;

  return (
    <div className="bmb-update-toast" role="status" aria-live="polite">
      <div className="bmb-update-text">Доступна нова версія</div>
      <div className="bmb-update-actions">
        <button className="bmb-btn bmb-btn-primary" onClick={() => applyServiceWorkerUpdate()}>
          Оновити
        </button>
        <button className="bmb-btn bmb-btn-ghost" onClick={() => setShow(false)}>
          Пізніше
        </button>
      </div>
    </div>
  );
}
