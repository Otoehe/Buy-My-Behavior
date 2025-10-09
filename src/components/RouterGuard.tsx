/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function RouterGuard() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (sessionStorage.getItem("bmb.lockIntent") === "1") {
      const sid = sessionStorage.getItem("bmb.sid") || "";
      const amt = sessionStorage.getItem("bmb.amt") || "";
      if (sid && amt && loc.pathname !== "/escrow/confirm") {
        const url = `/escrow/confirm?sid=${encodeURIComponent(sid)}&amt=${encodeURIComponent(amt)}`;
        nav(url, { replace: true });
      }
    }
  }, [loc.pathname, nav]);

  return null;
}
