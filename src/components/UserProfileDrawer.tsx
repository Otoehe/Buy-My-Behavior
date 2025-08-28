// 📁 src/components/UserProfileDrawer.tsx
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * UserProfileDrawer — фікс переходу "Замовити поведінку" → форма сценарію + мобільний свайп-дисміс вправо.
 * - [1] Перехоплюємо клік по кнопці "Замовити" всередині шторки (capture) і навігуємо на /scenario/new.
 * - [2] Клік/тап по карті (Leaflet) закриває шторку.
 * - [3] Клік по overlay (елемент .drawer-overlay) також закриває.
 * - [4] NEW: Правий свайп (горизонтальний drag) на мобільних плавно зсуває картку вправо і закриває при достатній відстані/швидкості.
 *   Під час drag затемнення (overlay) плавно гасне.
 */
export default function UserProfileDrawer({ isOpen, onClose, children }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  // ——— 1) Локальне перехоплення кліку по "Замовити поведінку" всередині шторки
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !isOpen) return;

    const matchIsOrderButton = (el: HTMLElement) => {
      if (!el) return false;
      // 1) Прямі селектори
      if (el.closest('.order-button-new')) return true;
      if (el.closest('[data-action="order"]')) return true;

      // 2) Будь-який <button> з текстом, що містить "замовити"
      const btn = el.closest('button');
      if (btn) {
        const text = (btn.textContent || '').toLowerCase().trim();
        if (text.includes('замовити')) return true;
      }
      return false;
    };

    const onClickCapture = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (!root.contains(target)) return;
      if (!matchIsOrderButton(target)) return;

      // Глушимо все І ДО, і ПІСЛЯ — жоден інший обробник не спрацює
      ev.preventDefault();
      ev.stopPropagation();
      (ev as any).stopImmediatePropagation?.();

      // Можемо зчитати виконавця з атрибута, якщо він прокинений у кнопку
      const btn =
        (target.closest('.order-button-new') as HTMLElement | null) ||
        (target.closest('[data-action="order"]') as HTMLElement | null) ||
        (target.closest('button') as HTMLElement | null);

      const executorId = btn?.getAttribute?.('data-executor-id') || '';

      if (executorId) {
        try {
          localStorage.setItem('scenario_receiverId', executorId);
        } catch {}
      }

      const q = executorId ? `?executor_id=${encodeURIComponent(executorId)}` : '';
      navigate(`/scenario/new${q}`);
    };

    // Ловимо й click, і touchend на capture-фазі
    root.addEventListener('click', onClickCapture, true);
    root.addEventListener('touchend', onClickCapture, true);

    return () => {
      root.removeEventListener('click', onClickCapture, true);
      root.removeEventListener('touchend', onClickCapture, true);
    };
  }, [isOpen, navigate]);

  // ——— 2) Клік/тап по КАРТІ (Leaflet) — закриває шторку
  useEffect(() => {
    if (!isOpen) return;
    const mapEl = document.querySelector('.leaflet-container') as HTMLElement | null;
    if (!mapEl) return;

    const handleMapTap = () => onClose();

    mapEl.addEventListener('click', handleMapTap, { capture: true });
    mapEl.addEventListener('touchend', handleMapTap, { capture: true });

    return () => {
      mapEl.removeEventListener('click', handleMapTap as any, { capture: true } as any);
      mapEl.removeEventListener('touchend', handleMapTap as any, { capture: true } as any);
    };
  }, [isOpen, onClose]);

  // ——— 3) Клік по фон-оверлею шторки (якщо є .drawer-overlay) — теж закриває
  useEffect(() => {
    if (!isOpen) return;
    const overlay = document.querySelector('.drawer-overlay') as HTMLElement | null;
    if (!overlay) return;

    // додамо клас для плавного гасіння (CSS .sheet-overlay { transition: opacity } уже є)
    overlay.classList.add('sheet-overlay');

    const onOverlay = (e: Event) => {
      if (e.target === overlay) onClose();
    };

    overlay.addEventListener('click', onOverlay, { capture: true });
    overlay.addEventListener('touchend', onOverlay, { capture: true });

    return () => {
      overlay.removeEventListener('click', onOverlay as any, { capture: true } as any);
      overlay.removeEventListener('touchend', onOverlay as any, { capture: true } as any);
      overlay.classList.remove('sheet-overlay');
    };
  }, [isOpen, onClose]);

  // ——— 4) NEW: Свайп вправо для закриття (лише на мобільних/коpс-поінтерах)
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !isOpen) return;

    // працюємо лише на дотику (щоб не заважати миші)
    const isCoarse =
      (window.matchMedia?.('(pointer: coarse)').matches) ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isCoarse) return;

    const overlay = document.querySelector('.drawer-overlay') as HTMLElement | null;

    const THRESHOLD = 120;     // мін. відстань у px для закриття
    const FRICTION = 1;        // уповільнення drag
    let pointerId: number | null = null;
    let dragging = false;
    let canceled = false;
    let startX = 0, startY = 0;
    let lastX = 0, lastTS = 0;

    // допоміжні стилі/класи (плавне перетягування)
    const setTransform = (x: number) => {
      el.style.transform = `translateX(${x}px)`;
      if (overlay) {
        const k = Math.min(1, x / 300);
        overlay.style.opacity = String(1 - k * 0.85);
      }
    };
    const resetTransform = () => {
      el.classList.remove('sheet-swiping');
      el.style.transform = '';
      if (overlay) overlay.style.opacity = '';
    };
    const finishDismiss = () => {
      el.classList.remove('sheet-swiping');
      el.classList.add('sheet-dismissing');
      el.style.transform = 'translateX(110%)';
      const onEnd = () => {
        el.removeEventListener('transitionend', onEnd);
        el.classList.remove('sheet-dismissing');
        onClose();
        // скидаємо, якщо шторку відкриють знову
        el.style.transform = '';
        if (overlay) overlay.style.opacity = '';
      };
      el.addEventListener('transitionend', onEnd);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      pointerId = e.pointerId;
      dragging = false;
      canceled = false;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastTS = e.timeStamp;
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (pointerId == null || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (canceled) return;

      if (!dragging) {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        if (ay > 10 && ay > ax) { canceled = true; return; } // вертикальний скрол
        if (dx > 8 && ax > ay * 1.15) {
          dragging = true;
          el.classList.add('sheet-swiping');
        } else return;
      }

      e.preventDefault();
      const dragX = Math.max(0, dx / FRICTION); // тягнемо лише вправо
      setTransform(dragX);
      lastX = e.clientX;
      lastTS = e.timeStamp;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pointerId == null || e.pointerId !== pointerId) return;
      el.releasePointerCapture(e.pointerId);

      const dx = Math.max(0, lastX - startX);
      const dt = Math.max(1, e.timeStamp - lastTS);
      const velocity = dx / dt; // px/ms

      if (dragging && (dx > THRESHOLD || velocity > 0.65)) finishDismiss();
      else resetTransform();

      pointerId = null;
      dragging = false;
      canceled = false;
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('lostpointercapture', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown as any);
      el.removeEventListener('pointermove', onPointerMove as any);
      el.removeEventListener('pointerup', onPointerUp as any);
      el.removeEventListener('pointercancel', onPointerUp as any);
      el.removeEventListener('lostpointercapture', onPointerUp as any);
      // скидаємо стилі на всяк випадок
      el.style.transform = '';
      if (overlay) overlay.style.opacity = '';
    };
  }, [isOpen, onClose]);

  return (
    <div
      ref={rootRef}
      className={`user-profile-drawer sheet-card ${isOpen ? 'open' : ''}`}
      aria-hidden={!isOpen}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  );
}
