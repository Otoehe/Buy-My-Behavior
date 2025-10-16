// src/components/UserProfileDrawer.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;          // ширина шторки у px (за замовчуванням 560)
  closeOnBackdrop?: boolean; // клік по фону закриває (true за замовч.)
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function UserProfileDrawer({
  isOpen,
  onClose,
  children,
  width = 560,
  closeOnBackdrop = true,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef<number | null>(null);
  const lastX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0); // +X тягнемо праворуч (до краю)

  // Блок скролу під шторкою, коли вона відкрита
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen]);

  // Ставимо translateX під час перетягування
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transform = isOpen
      ? `translateX(${dragX}px)`
      : `translateX(${width}px)`;
  }, [dragX, isOpen, width]);

  // Коли відкрили — анімацією в’їжджаємо зліва направо (з правого краю)
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.willChange = 'transform';
    el.style.transition = 'transform 220ms ease';
    requestAnimationFrame(() => {
      el.style.transform = isOpen ? 'translateX(0)' : `translateX(${width}px)`;
    });
    return () => { if (el) el.style.transition = ''; };
  }, [isOpen, width]);

  const threshold = useMemo(() => 80, []); // поріг свайпу праворуч для закриття

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    lastX.current = startX.current;
    // під час жесту — забираємо transition, щоб рух був «живим»
    const el = panelRef.current;
    if (el) el.style.transition = 'none';
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const x = e.touches[0].clientX;
    lastX.current = x;
    const deltaX = x - startX.current; // >0 — праворуч
    // тягнути можна тільки праворуч; вліво не даємо
    const next = clamp(deltaX, 0, width);
    setDragX(next);
  };

  const onTouchEnd = () => {
    if (startX.current == null || lastX.current == null) {
      startX.current = null;
      lastX.current = null;
      return;
    }
    const deltaX = lastX.current - startX.current;

    // повертаємо transition
    const el = panelRef.current;
    if (el) el.style.transition = 'transform 200ms ease';

    // якщо протягнули праворуч більше за threshold — закриваємо
    if (deltaX > threshold) {
      setDragX(width);
      // трохи зачекаємо, щоб не "обрізати" анімацію
      setTimeout(() => {
        setDragX(0);
        onClose();
      }, 180);
    } else {
      // відкотити назад
      setDragX(0);
      if (el) el.style.transform = 'translateX(0)';
    }

    startX.current = null;
    lastX.current = null;
  };

  const onBackdropClick = () => {
    if (!closeOnBackdrop) return;
    onClose();
  };

  return (
    <div
      aria-hidden={!isOpen}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      {/* Фон */}
      <div
        onClick={onBackdropClick}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 220ms ease',
        }}
      />

      {/* Панель справа */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width,
          maxWidth: '100%',
          background: '#fff',
          boxShadow: '0 0 24px rgba(0,0,0,0.2)',
          transform: `translateX(${isOpen ? 0 : width}px)`,
        }}
      >
        {/* Кнопка закриття (стрілочка/хрестик) */}
        <button
          onClick={onClose}
          aria-label="Закрити"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.08)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          {/* стрілка вправо (вказує, що шторка піде вправо) */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        {/* Контент шторки */}
        <div style={{ height: '100%', overflowY: 'auto', padding: '16px 16px 24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
