/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

/**
 * Зчитуємо bmbSess=base64(json) з hash та переводимо на next.
 * Якщо next відсутній — дефолт: /escrow/confirm
 */
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
      // прибираємо hash
      history.replaceState(null, document.title, location.pathname + location.search);

      if (sess?.at) {
        try {
          await supabase.auth.setSession({
            access_token: sess.at!,
            refresh_token: sess.rt ?? undefined,
          });
        } catch {
          // ігноруємо — продовжуємо навігацію
        }
      }

      // КРИТИЧНО: ніяких window.open/_blank
      if (sess?.next) {
        navigate(sess.next, { replace: true });
      } else {
        navigate("/escrow/confirm", { replace: true });
      }
    })();
  }, [navigate]);

  return null;
}
