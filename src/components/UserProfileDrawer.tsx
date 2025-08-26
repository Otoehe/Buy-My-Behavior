// 📁 src/components/UserProfileDrawer.tsx
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * UserProfileDrawer — фікс переходу "Замовити поведінку" → форма сценарію.
 * - Перехоплюємо клік по кнопці всередині шторки на capture-фазі й навігуємо на /scenario/new.
 * - Підтримуємо кілька варіантів кнопки: .order-button-new, [data-action="order"],
 *   або <button> з текстом "Замовити".
 * - Зберігаємо executor_id (якщо заданий через data-executor-id).
 * - Клік по карті або по overlay як і раніше закриває шторку.
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
        target.closest('button') as HTMLElement | null;

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

    const onOverlay = (e: Event) => {
      if (e.target === overlay) onClose();
    };

    overlay.addEventListener('click', onOverlay, { capture: true });
    overlay.addEventListener('touchend', onOverlay, { capture: true });

    return () => {
      overlay.removeEventListener('click', onOverlay as any, { capture: true } as any);
      overlay.removeEventListener('touchend', onOverlay as any, { capture: true } as any);
    };
  }, [isOpen, onClose]);

  return (
    <div
      ref={rootRef}
      className={`user-profile-drawer ${isOpen ? 'open' : ''}`}
      aria-hidden={!isOpen}
    >
      {children}
    </div>
  );
}
