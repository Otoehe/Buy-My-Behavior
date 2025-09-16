import React from 'react';
import { createPortal } from 'react-dom';
import StoryBar from './StoryBar';

export default function StoryBarDockFixed({ hidden = false }: { hidden?: boolean }) {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0, right: 0,
        top: 'var(--nav-h, 56px)',  // під навбар
        zIndex: 1500,               // нижче backdrop/drawer
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
