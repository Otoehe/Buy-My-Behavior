import React from 'react';
import { createPortal } from 'react-dom';
import StoryBar from './StoryBar';

export default function StoryBarDockFixed({ hidden = false }: { hidden?: boolean }) {
  // Фіксовано під навбаром. Ніколи не розмонтовуємо — лише display:none
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: 'var(--nav-h, 56px)', // під ваш навбар
        zIndex: 5000,              // вище за leaflet/мапу/контроли
        padding: '6px 0 2px',
        display: hidden ? 'none' : 'block',
        pointerEvents: 'none',
      }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        <StoryBar />
      </div>
    </div>,
    document.body
  );
}
