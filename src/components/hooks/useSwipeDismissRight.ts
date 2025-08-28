// src/hooks/useSwipeDismissRight.ts
import { RefObject, useEffect, useRef } from 'react';

type Opts = {
  /** Мінімальна відстань (px) після якої вважаємо, що треба закривати */
  threshold?: number;
  /** Уповільнення “перетягування” (1 = без інерції) */
  dragFriction?: number;
  /** Лише на мобільних / coarse pointers */
  onlyMobile?: boolean;
  /** Необов’язково: overlay, щоб плавно гасити під час свайпу */
  overlayRef?: RefObject<HTMLElement | null>;
};

export default function useSwipeDismissRight(
  cardRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  opts: Opts = {}
) {
  const threshold = opts.threshold ?? 120;
  const dragFriction = opts.dragFriction ?? 1;
  const onlyMobile = opts.onlyMobile ?? true;

  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const lastTS = useRef(0);
  const dragging = useRef(false);
  const canceled = useRef(false);
  const pointerId = useRef<number | null>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const isCoarse = typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    if (onlyMobile && !isCoarse) return;

    const overlay = opts.overlayRef?.current || null;

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
      // Після анімації — закриваємо
      const onEnd = () => {
        el.removeEventListener('transitionend', onEnd);
        el.classList.remove('sheet-dismissing');
        onDismiss();
        // скинути стиль (на випадок повторного відкриття)
        el.style.transform = '';
        if (overlay) overlay.style.opacity = '';
      };
      el.addEventListener('transitionend', onEnd);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return; // жести лише на дотик
      pointerId.current = e.pointerId;
      canceled.current = false;
      dragging.current = false;
      startX.current = e.clientX;
      startY.current = e.clientY;
      lastX.current = e.clientX;
      lastTS.current = e.timeStamp;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId.current == null || e.pointerId !== pointerId.current) return;

      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;

      // якщо вже вирішили, що це вертикальний скрол – ігноруємо
      if (canceled.current) return;

      // старт drag’у: горизонт домінує та свайп вправо
      if (!dragging.current) {
        const startDx = Math.abs(dx);
        const startDy = Math.abs(dy);
        if (startDy > 10 && startDy > startDx) {
          canceled.current = true; // це вертикальний скрол
          return;
        }
        if (dx > 8 && startDx > startDy * 1.15) {
          dragging.current = true;
          el.classList.add('sheet-swiping');
        } else {
          return;
        }
      }

      // активний горизонтальний drag
      e.preventDefault();
      const dragX = Math.max(0, dx / dragFriction); // тягнемо тільки вправо
      setTransform(dragX);

      // зберігаємо для швидкості
      lastX.current = e.clientX;
      lastTS.current = e.timeStamp;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId.current == null || e.pointerId !== pointerId.current) return;
      el.releasePointerCapture(e.pointerId);

      const dx = Math.max(0, lastX.current - startX.current);
      const dt = Math.max(1, e.timeStamp - lastTS.current);
      const velocity = dx / dt; // px/ms

      if (dragging.current && (dx > threshold || velocity > 0.65)) {
        finishDismiss();
      } else {
        resetTransform();
      }

      pointerId.current = null;
      dragging.current = false;
      canceled.current = false;
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
    };
  }, [cardRef, onDismiss, threshold, dragFriction, onlyMobile, opts.overlayRef]);
}
