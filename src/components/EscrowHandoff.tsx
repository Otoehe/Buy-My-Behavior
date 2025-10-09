/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/** Читаємо bmbSess=base64(json) з location.hash */
function parseSessFromHash():
  | { at?: string | null; rt?: string | null; next?: string }
  | null {
  try {
    const m = (location.hash || "").match(/bmbSess=([^&]+)/);
    if (!m) return null;
    const json = atob(decodeURIComponent(m[1]));
    const obj = JSON.parse(json);
    return {
      at: obj?.at ?? null,
      rt: obj?.rt ?? null,
      // ГОЛОВНЕ: дефолтний маршрут — на екран підтвердження, а НЕ /my-orders
      next: typeof obj?.next === "string" ? obj.next : "/escrow/confirm",
    };
  } catch {
    return null;
  }
}

export default function EscrowHandoff() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const sess = parseSessFromHash();

      // прибираємо hash із URL
      history.replaceState(null, document.title, location.pathname + location.search);

      try {
        if (sess?.at) {
          await supabase.auth.setSession({
            access_token: sess.at!,
            refresh_token: sess.rt ?? undefined,
          });
        }
      } catch {
        // ігноруємо, все одно ведемо далі
      }

      // ЖОДНИХ window.open/_blank, лише navigate в тій самій вкладці
      navigate(sess?.next || "/escrow/confirm", { replace: true });
    })();
  }, [navigate]);

  return null;
}
