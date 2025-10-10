/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Глобовий сторож маршрутизації:
 * якщо активний намір (bmb.lockIntent === "1"), ми не даємо піти на інші екрани,
 * а повертаємо користувача на /escrow/confirm із актуальними sid/amt.
 */
export default function RouterGuard() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const intent = sessionStorage.getItem("bmb.lockIntent") === "1";
    if (!intent) return;

    const sid = sessionStorage.getItem("bmb.sid") || "";
    const amt = sessionStorage.getItem("bmb.amt") || "";
    if (!sid || !amt) return;

    const target = `/escrow/confirm?sid=${encodeURIComponent(sid)}&amt=${encodeURIComponent(amt)}`;

    // якщо ми НЕ на цільовій сторінці — повертаємо
    if (loc.pathname !== "/escrow/confirm") {
      nav(target, { replace: true });
    }
  }, [loc.pathname, nav]);

  return null;
}
