// src/components/StoryBarDock.tsx
import React from 'react';
import StoryBar from './StoryBar';

type Props = { hidden?: boolean };

/**
 * Фіксований “док” для StoryBar під навбаром.
 * НІКОЛИ не розмонтовується — лише ховається (display:none)
 * щоб не було миготіння.
 */
export default function StoryBarDock({ hidden = false }: Props) {
  // висоту навбару можна підкрутити через CSS-змінну --nav-h
  return (
    <div
      className="storybar-dock"
      style={{
        position: 'sticky',
        top: 'var(--nav-h, 56px)',
        zIndex: 1100,           // нижче за навбар, але вище за карту
        padding: '6px 0',
        display: hidden ? 'none' : 'block',
        pointerEvents: 'none',  // кліки йдуть у карту
      }}
    >
      <div style={{ pointerEvents: 'auto' }}>
        <StoryBar />
      </div>
    </div>
  );
}
