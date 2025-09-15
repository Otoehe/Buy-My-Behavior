import React from 'react';
import { createPortal } from 'react-dom';
import StoryBar from './StoryBar';

export default function StoryBarLayer() {
  return createPortal(
    <div
      className="bmb-storybar-fixed"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: 64,           // піджени під висоту твого навбару
        zIndex: 4000,
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
