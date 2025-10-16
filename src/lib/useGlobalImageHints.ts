// src/lib/useGlobalImageHints.ts
import { useEffect } from 'react';

/**
 * Глобально додає підказки браузеру для <img>:
 *  - loading="lazy" для всіх не-критичних зображень
 *  - decoding="async" щоб не блокувати головний потік
 *  - fetchpriority="low" для зображень нижче фолда
 *
 * Нічого не ламає: якщо десь уже виставлено свої атрибути — ми не переписуємо.
 */
export default function useGlobalImageHints() {
  useEffect(() => {
    const enhance = () => {
      const allImgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));

      for (const img of allImgs) {
        // пропускаємо критичні зони: навбар і його модалку
        if (img.closest('nav')) continue;
        if (img.closest('[role="dialog"]')) continue;

        // не переписуємо, якщо розробник уже виставив значення
        if (!img.hasAttribute('loading')) {
          img.loading = 'lazy';
        }
        if (!img.hasAttribute('decoding')) {
          img.decoding = 'async';
        }
        if (!img.hasAttribute('fetchpriority')) {
          const rect = img.getBoundingClientRect();
          const belowFold = rect.top > (window.innerHeight || 0);
          if (belowFold) img.setAttribute('fetchpriority', 'low');
        }
      }
    };

    // одразу після монтуння
    enhance();

    // на випадок появи нових <img> у фіді/сторі — спостерігаємо DOM
    const mo = new MutationObserver(() => enhance());
    mo.observe(document.body, { childList: true, subtree: true });

    // і на ресайз
    window.addEventListener('resize', enhance);

    return () => {
      mo.disconnect();
      window.removeEventListener('resize', enhance);
    };
  }, []);
}
