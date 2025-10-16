import React from 'react';
import { createPortal } from 'react-dom';
import StoryBar from './StoryBar';

export default function StoryBarLayer() {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0, right: 0,
        top: 'var(--nav-h, 56px)',
        zIndex: 1500,
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
