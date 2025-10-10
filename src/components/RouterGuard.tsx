/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Поки sessionStorage.bmb.lockIntent === "1",
 * примусово тримає користувача на /escrow/confirm?sid=...&amt=...
 */
export default function RouterGuard() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (sessionStorage.getItem("bmb.lockIntent") === "1") {
      const sid = sessionStorage.getItem("bmb.sid") || "";
      const amt = sessionStorage.getItem("bmb.amt") || "";
      const onConfirm = loc.pathname === "/escrow/confirm";
      if (sid && amt && !onConfirm) {
        const url = `/escrow/confirm?sid=${encodeURIComponent(sid)}&amt=${encodeURIComponent(amt)}`;
        nav(url, { replace: true });
      }
    }
  }, [loc.pathname, nav]);

  return null;
}
