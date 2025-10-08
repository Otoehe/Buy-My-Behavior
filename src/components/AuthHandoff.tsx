import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * Підхоплює access/refresh токени з #hash, піднімає сесію Supabase
 * у MetaMask Browser і одразу редіректить на цільову сторінку.
 *
 * Приклад входу:
 *   https://www.buymybehavior.com/auth/handoff#at=<...>&rt=<...>&to=/my-orders?scenario=...
 */
export default function AuthHandoff() {
  const loc = useLocation();

  useEffect(() => {
    const run = async () => {
      // беремо параметри з HASH (не відправляється на сервер)
      const params = new URLSearchParams((loc.hash || "").replace(/^#/, ""));
      const at = params.get("at") || "";
      const rt = params.get("rt") || "";
      const to = params.get("to") || "/";

      try {
        if (at && rt) {
          await supabase.auth.setSession({
            access_token: at,
            refresh_token: rt,
          });
        }
      } catch (err) {
        console.error("AuthHandoff setSession error:", err);
      } finally {
        // Прибираємо hash і переходимо на ціль
        const target = to.startsWith("/") ? to : "/";
        try {
          window.history.replaceState(null, "", target);
        } catch {}
        window.location.replace(target);
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 24, fontSize: 16 }}>
      Секунда… авторизую в MetaMask Browser
    </div>
  );
}

