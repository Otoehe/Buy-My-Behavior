import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Піднімає сесію Supabase у MetaMask Browser і редіректить на ціль.
 * Прихід сюди: /auth/handoff#at=...&rt=...&to=/my-orders?scenario=...
 */
export default function AuthHandoff() {
  const loc = useLocation();

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams((loc.hash || "").replace(/^#/, ""));
      const at = params.get("at") || "";
      const rt = params.get("rt") || "";
      const to = params.get("to") || "/";

      try {
        if (at && rt) {
          await supabase.auth.setSession({ access_token: at, refresh_token: rt });
        }
      } catch (err) {
        console.error("AuthHandoff setSession error:", err);
      } finally {
        const target = to.startsWith("/") ? to : "/";
        try { window.history.replaceState(null, "", target); } catch {}
        window.location.replace(target);
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div style={{ padding: 24 }}>Авторизація…</div>;
}
