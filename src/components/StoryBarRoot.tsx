import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import StoryBar from './StoryBar';

/**
 * ЄДИНИЙ глобальний hosting-слой для StoryBar під навбаром.
 * Монтується один раз у App, ніколи не розмонтовується — лише display:none.
 */
export default function StoryBarRoot({ hidden = false }: { hidden?: boolean }) {
  const [host] = useState(() => {
    const el = document.createElement('div');
    el.className = 'bmb-storybar-fixed';
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.right = '0';
    el.style.top = 'var(--nav-h, 56px)';
    el.style.zIndex = '5000';
    el.style.padding = '6px 0 2px';
    el.style.pointerEvents = 'none';
    return el;
  });

  useEffect(() => {
    document.body.appendChild(host);
    return () => { try { document.body.removeChild(host); } catch {} };
  }, [host]);

  host.style.display = hidden ? 'none' : 'block';

  return createPortal(
    <div style={{ pointerEvents: 'auto' }}>
      <StoryBar />
    </div>,
    host
  );
}
