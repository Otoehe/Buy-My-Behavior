/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/useSafeTap.ts — безпечний тап/клік для мобільних (анти-дабл + стоп пропагації)
import { useRef, useCallback } from "react";

export interface SafeTapOptions {
  cooldownMs?: number; // анти-дабл інтервал
  stopPropagation?: boolean;
  preventDefault?: boolean;
}

export function useSafeTap<T extends (...args: any[]) => void>(
  handler: T,
  opts: SafeTapOptions = {}
) {
  const {
    cooldownMs = 800,
    stopPropagation = true,
    preventDefault = true,
  } = opts;
  const locked = useRef(false);

  const safe = useCallback(
    (e?: any) => {
      if (preventDefault && e?.preventDefault) e.preventDefault();
      if (stopPropagation && e?.stopPropagation) e.stopPropagation();
      if (locked.current) return;
      locked.current = true;
      try {
        handler(e);
      } finally {
        window.setTimeout(() => {
          locked.current = false;
        }, cooldownMs);
      }
    },
    [handler, cooldownMs, stopPropagation, preventDefault]
  );

  // Повертаємо одразу обидва хендлери, щоб підвісити на onClick і onTouchStart
  return {
    onClick: safe,
    onTouchStart: safe,
  } as const;
}
