// src/components/PwaLaunchGuard.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Визначаємо, що працюємо як встановлена PWA (ярлик на робочому столі)
function isStandalone() {
  // Android / Chrome / Edge
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari
  // @ts-ignore
  if (typeof (navigator as any).standalone === "boolean" && (navigator as any).standalone) return true;
  return false;
}

export default function PwaLaunchGuard() {
  const nav = useNavigate();

  useEffect(() => {
    const goMap = () => nav("/map", { replace: true });

    // 1) Перший рендер у standalone → одразу на карту
    if (isStandalone()) {
      goMap();
    }

    // 2) Будь-яке повернення на передній план / повторне відкриття з іконки → на карту
    const onVisible = () => {
      if (isStandalone() && document.visibilityState === "visible") {
        goMap();
      }
    };
    const onFocus = () => {
      if (isStandalone()) {
        goMap();
      }
    };
    const onPageShow = () => {
      if (isStandalone()) {
        goMap();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [nav]);

  return null;
}
